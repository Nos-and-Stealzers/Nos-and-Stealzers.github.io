"""Headless, isolated staff-console browser regressions; all external traffic blocked.
Run: uv run --with playwright python tools/test-admin-ui.py --out <scratch-directory>
"""
import argparse, asyncio, json, mimetypes, pathlib
from playwright.async_api import async_playwright, expect
ROOT = pathlib.Path(__file__).resolve().parents[1]
HUB = 'https://www.arcadecampushub.online'
async def main(out):
    out.mkdir(parents=True, exist_ok=True)
    blocked=[]; errors=[]; checks=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True)
        context=await browser.new_context(service_workers='block')
        async def route(r):
            if not r.request.url.startswith(HUB+'/'):
                blocked.append(r.request.url); await r.abort(); return
            path=r.request.url.split('?',1)[0][len(HUB):]
            f=ROOT/path.lstrip('/')
            if path=='/js/core/session.js': f=ROOT/'tools/admin-ui-fixture.js'
            if not f.is_file(): await r.fulfill(status=404,body='not found'); return
            await r.fulfill(body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
        await context.route('**/*',route)
        await context.add_init_script("if (location.origin === 'https://www.arcadecampushub.online') localStorage.setItem('ach:consent',JSON.stringify({version:'2026-09-10',at:new Date().toISOString()}));")
        page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            await page.goto(HUB+'/admin.html?testRole=owner#users')
            await page.locator('[data-user-id="fixture-0"]').wait_for()
            for width in [1440,768,390]:
                await page.set_viewport_size({'width':width,'height':1000})
                for name in ['users','overview','live','logins','playlists','audit','reports','support','feedback','help','games','workbench']:
                    await page.locator(f'#tabs [data-tab="{name}"]').click()
                    await page.wait_for_timeout(80)
                    assert await page.locator(f'[data-panel="{name}"]').is_visible(),name
                    assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth'),(width,name)
                    if name in ['live','logins','playlists','audit'] and width<1180:
                        host={'live':'live-rows','logins':'login-rows','playlists':'pl-rows','audit':'audit-rows'}[name]
                        assert await page.locator(f'#{host} .row').count()>0
                        for cell in await page.locator(f'#{host} .row').first.locator(':scope > *').all():
                            assert await cell.is_visible(),(name,await cell.text_content())
                        assert await page.locator(f'#{host} [data-label]').count()>0
                        if width==390: await page.screenshot(path=str(out/f'admin-{name}-390.png'),full_page=True)
                await page.locator('#tabs [data-tab="users"]').click()
                row=page.locator('[data-user-id="fixture-0"]');await row.focus();await page.keyboard.press('Space')
                assert await row.get_attribute('aria-pressed')=='true'
                assert await page.evaluate("document.activeElement.id === 'user-detail'")
                await page.locator('[data-section="notes"] summary').click()
                await page.get_by_label('New staff note',exact=True).fill('Draft survives refresh')
                await page.evaluate("window.__fixtureUsers.find(u=>u.id==='fixture-0').displayName='Refreshed student'")
                await page.locator('#refresh').click();await page.wait_for_timeout(100)
                assert 'Refreshed student' in await page.locator('#user-detail strong').text_content()
                assert await page.get_by_label('New staff note',exact=True).input_value()=='Draft survives refresh'
                await page.screenshot(path=str(out/f'admin-detail-{width}.png'),full_page=True)
                await page.locator('#user-filter').select_option('suspended')
                assert not await page.locator('#user-detail button').count()
                await page.locator('#user-filter').select_option('all')
                checks.append({'viewport':width,'populated_panels':'pass','selection_refresh_drafts':'pass'})
            await page.locator('[data-user-id="fixture-0"]').dispatch_event('click')
            await page.locator('[data-section="recovery"] summary').click()
            await page.get_by_label('New account password',exact=True).fill('FixturePassword123!')
            await page.evaluate("window.__failMethod='adminSetPassword'")
            page.once('dialog',lambda dialog:dialog.accept())
            await page.get_by_role('button',name='Set new password',exact=True).click()
            await page.locator('.admin-action-error').wait_for()
            assert await page.get_by_label('New account password',exact=True).input_value()=='FixturePassword123!'
            await page.screenshot(path=str(out/'admin-recovery-error-390.png'),full_page=True)
            await page.goto(HUB+'/admin-search.html?testRole=owner&q=first&keep=yes')
            await page.locator('#tool').wait_for(state='visible')
            await page.locator('#q').fill('saves & recovery');await page.get_by_role('button',name='Search',exact=True).click()
            assert 'q=saves+%26+recovery' in page.url
            assert 'q=saves%20%26%20recovery' in await page.locator('#open-tab').get_attribute('href')
            await page.locator('#q').fill('');await page.get_by_role('button',name='Search',exact=True).click()
            assert await page.locator('#results').get_attribute('srcdoc')
            assert '?q=' not in await page.locator('#open-tab').get_attribute('href')
            await page.evaluate('history.back()')
            await expect(page.locator('#q')).to_have_value('saves & recovery')
            await page.screenshot(path=str(out/'admin-search-390.png'),full_page=True)
            await page.goto(HUB+'/admin.html?testRole=mod#games')
            await page.locator('#console').wait_for(state='visible')
            assert await page.locator('[data-panel="overview"]').is_visible()
            assert not await page.locator('#tabs [data-tab="games"]').is_visible()
            await page.goto(HUB+'/admin-search.html?testRole=mod')
            await page.locator('#denied').wait_for(state='visible')
            assert not await page.locator('#tool').is_visible()
            assert not errors, errors
            assert blocked, 'External result requests must have been blocked'
            result={'checks':checks,'action_error_password_retention':'pass','search_URL_clear_back':'pass','mod_permissions':'pass','page_errors':errors,'external_requests_blocked':len(blocked)}
            (out/'admin-reliability-ui-results.json').write_text(json.dumps(result,indent=2))
            print(json.dumps(result))
        finally: await browser.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',required=True,type=pathlib.Path)
    asyncio.run(main(parser.parse_args().out))
