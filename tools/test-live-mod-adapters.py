"""Real framed-game + real ModMenu/agent E2E in disposable Chrome context.
Run: uv run --with playwright python tools/test-live-mod-adapters.py
No existing profiles, saves, accounts, cloud writes or game-source patches.
Only the hub test fixture and /_mods helper are served from working tree.
"""
import asyncio,json,mimetypes,pathlib,re
from playwright.async_api import async_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=pathlib.Path('C:/Users/lucas/AppData/Local/hermes/cache/scratch/mod-expansion/evidence');OUT.mkdir(parents=True,exist_ok=True)
HUB='https://www.arcadecampushub.online'
PLAY='https://play.arcadecampushub.online'
FIXTURE='''<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#101521;color:#eee;font:15px Arial}header{height:40px;padding:8px}iframe{width:970px;height:830px;border:0;background:#fff}.stage{position:relative}.mod-panel{position:absolute;top:0;left:980px;width:350px;background:#192337;padding:12px;max-height:790px;overflow:auto}.mod-panel[hidden]{display:none}.mod-label,.mod-sub{display:block;margin:12px 0;font-weight:bold}.mod-note{line-height:1.4}.mod-chip,button{padding:8px;margin:4px;border:1px solid #53617c;border-radius:5px;background:#253652;color:white}.mod-cheat{display:flex;align-items:center;margin:8px 0}.mod-cheat-name{flex:1}.mod-cheat input{width:110px;padding:6px}.mod-head svg{width:16px}.mod-head{display:flex;gap:10px}.mod-titles{display:grid}.mod-x{margin-left:auto}.toast-container{position:fixed;bottom:0}
</style></head><body><header><strong>Disposable live-game mod verification</strong><button id="anchor">Game</button></header><div class="stage" id="stage"><iframe id="game" allow="autoplay;fullscreen"></iframe></div>
<script>window.Session={user:{isPlus:true}};window.SITE={gameProxy:{active:true,to:'https://play.arcadecampushub.online'}};</script>
<script src="/js/core/ui.js"></script><script src="/js/features/game-cheats.js"></script><script src="/js/features/mod-menu.js"></script>
<script>const q=new URLSearchParams(location.search);const frame=document.querySelector('#game');frame.src=q.get('url');window.reloads=0;window.menu=ModMenu.attach({frame:()=>frame,stage:document.querySelector('#stage'),anchor:document.querySelector('#anchor'),game:{title:q.get('title')},reload:()=>{window.reloads++;frame.src=frame.src;}});</script></body></html>'''
JOBS=[('huge-csgo-clicker','csgo-clicker','CS:GO Clicker'),('huge-trimps','trimps','Trimps'),('huge-spacecompany','spacecompany','Space Company'),('huge-space-company','space-company','Space Company')]
async def main():
 results=[]; blocked=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(channel='chrome',headless=True,args=['--mute-audio','--disable-background-timer-throttling'])
  ctx=await browser.new_context(service_workers='block',viewport={'width':1360,'height':920})
  async def network(route):
   request=route.request;url=request.url
   if request.method not in ('GET','HEAD') or re.search(r'supabase|playfab',url,re.I):
    blocked.append({'url':url,'method':request.method});await route.abort();return
   if re.search(r'arc\.io|googlesyndication|googletagmanager|google-analytics|widgetbot|doubleclick',url):await route.abort();return
   if url.startswith(HUB+'/__mod_adapter_test'):
    await route.fulfill(content_type='text/html',body=FIXTURE);return
   if url.startswith(HUB+'/games/originals/'):
    # Use unmodified live originals, not a game fixture.
    await route.continue_();return
   if url.startswith(HUB+'/'):
    f=ROOT/url[len(HUB)+1:].split('?')[0]
    if f.is_file():await route.fulfill(body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'text/plain')
    else:await route.fulfill(status=404,body='Not found')
    return
   if url.split('?')[0]==PLAY+'/_mods/agent.html':await route.fulfill(content_type='text/html',body=(ROOT/'_mods/agent.html').read_text());return
   if url.split('?')[0]==PLAY+'/_mods/game-cheats.js':await route.fulfill(content_type='text/javascript',body=(ROOT/'js/features/game-cheats.js').read_text());return
   await route.continue_()
  await ctx.route('**/*',network)
  page=await ctx.new_page()
  page.on('dialog',lambda d:asyncio.ensure_future(d.dismiss()))
  try:
   for gid,slug,title in JOBS:
    from urllib.parse import urlencode
    await page.goto(HUB+'/__mod_adapter_test?'+urlencode({'url':PLAY+'/games-huge/'+slug+'/index.html','title':title}),wait_until='domcontentloaded')
    frame=page.frame_locator('#game')
    await page.wait_for_timeout(12000)
    actual=next(f for f in page.frames if '/games-huge/'+slug+'/' in f.url)
    if slug=='csgo-clicker':await actual.wait_for_function('localStorage.getItem("savegame") !== null',timeout=45000)
    if slug=='trimps':
     await frame.get_by_text("Don't Enable",exact=True).click()
     await page.wait_for_timeout(500)
    await page.get_by_role('button',name='Mods',exact=True).click()
    await page.get_by_role('tab',name='Cheats',exact=True).click()
    expected={'csgo-clicker':'+$1 million','trimps':'Fill food, wood and metal storage'}.get(slug,'Fill metal, gems and wood storage')
    await expect(page.get_by_role('button',name=expected,exact=True)).to_be_visible(timeout=20000)
    await page.screenshot(path=str(OUT/(gid+'-menu-before.png')))
    # Use the actual mod buttons (postMessage agent), not direct storage writes.
    await page.get_by_role('button',name=expected,exact=True).click()
    await page.wait_for_timeout(2000)
    if slug=='csgo-clicker':
     await expect(frame.locator('#money')).to_have_text('$1000007.50',timeout=15000)
     await page.get_by_role('button',name='Refresh',exact=True).click()
     await page.wait_for_timeout(600)
     field=page.locator('.mod-cheat').filter(has=page.locator('.mod-cheat-name',has_text='Wallet ($)'))
     await field.locator('input').fill('12345.67');await field.get_by_role('button',name='Set',exact=True).click()
     await expect(frame.locator('#money')).to_have_text('$12345.67',timeout=15000)
     ui={'wallet':await frame.locator('#money').inner_text()}
     assert await page.evaluate('reloads')==2
    else:
     if slug=='trimps':
      await expect(frame.locator('#foodOwned')).to_have_text('500',timeout=10000)
      # Reach Metal with normal in-game actions; never force-hide/show UI.
      await frame.locator('#foodCollectBtn').click();await page.wait_for_timeout(1200)
      await frame.locator('#Trap').click();await frame.locator('#Trap').click()
      await frame.locator('#buildingsCollectBtn').click();await page.wait_for_timeout(11000)
      await frame.locator('#trimpsCollectBtn').click()
      await expect(frame.locator('#scienceCollectBtn')).to_be_visible(timeout=25000)
      await frame.locator('#scienceCollectBtn').click();await page.wait_for_timeout(11500)
      await frame.locator('#upgradesTab').click();await frame.locator('#Battle').click()
      await expect(frame.locator('#metalOwned')).to_be_visible(timeout=8000)
      await page.get_by_role('button',name=expected,exact=True).click();await page.wait_for_timeout(500)
      for k in ('food','wood','metal'):await expect(frame.locator('#'+k+'Owned')).to_have_text('500')
      await page.screenshot(path=str(OUT/(gid+'-fill-visible.png')))
     else:
      for k in ('metal','gem','wood'):await expect(frame.locator('#'+k)).to_have_text('50',timeout=10000)
     # Verify every advertised setter, then capped fill again; reload UI below.
     names=('Food','Wood','Metal') if slug=='trimps' else ('Metal','Gems','Wood')
     for label,n in zip(names,(123,234,345) if slug=='trimps' else (12,23,34)):
      field=page.locator('.mod-cheat').filter(has=page.locator('.mod-cheat-name',has_text=re.compile('^'+label+'$')))
      await field.locator('input').fill(str(n));await field.get_by_role('button',name='Set',exact=True).click();await page.wait_for_timeout(250)
      if slug=='trimps':assert await actual.evaluate('(k)=>game.resources[k].owned',label.lower())==n
      else:await expect(frame.locator('#'+{'Gems':'gem'}.get(label,label.lower()))).to_have_text(str(n))
     await page.screenshot(path=str(OUT/(gid+'-setters.png')))
     # Explicit reload, because these adapters save without forcing a restart.
     await page.evaluate('()=>{const f=document.querySelector("#game");f.src=f.src}')
     await page.wait_for_timeout(3500)
     actual=next(f for f in page.frames if '/games-huge/'+slug+'/' in f.url)
     if slug=='trimps':
      for k,n in zip(('food','wood','metal'),(123,234,345)):
       await expect(frame.locator('#'+k+'Owned')).to_be_visible()
       await expect(frame.locator('#'+k+'Owned')).to_have_text(str(n),timeout=10000)
      ui={k:await frame.locator('#'+k+'Owned').inner_text() for k in ('food','wood','metal')}
     else:
      for k,n in zip(('metal','gem','wood'),(12,23,34)):await expect(frame.locator('#'+k)).to_have_text(str(n),timeout=10000)
      ui={k:await frame.locator('#'+k).inner_text() for k in ('metal','gem','wood')}
    await page.screenshot(path=str(OUT/(gid+'-after-reload.png')))
    # Shared-origin saves remain in this same isolated context as subsequent
    # unrelated games load. The helper cannot detect this adapter on Dino.
    results.append({'id':gid,'title':title,'ui':ui,'menuAction':expected,'postReload':True})
    print(json.dumps(results[-1]),flush=True)
   for slug,title,key,balance,bonus,added in [('idle-miner','Idle Miner','idleMiner','Gold','+100,000 gold','100.0K'),('cookie-empire','Cookie Empire','cookieEmpire','Cookies','+1 million cookies','1.0M')]:
    gid='original-'+slug
    await page.goto(HUB+'/__mod_adapter_test?'+urlencode({'url':HUB+'/games/originals/'+slug+'.html','title':title}),wait_until='domcontentloaded')
    frame=page.frame_locator('#game')
    await page.wait_for_timeout(3000)
    actual=next(f for f in page.frames if '/games/originals/'+slug+'.html' in f.url)
    await page.get_by_role('button',name='Mods',exact=True).click();await page.get_by_role('tab',name='Cheats',exact=True).click()
    await expect(page.get_by_role('button',name=bonus,exact=True)).to_be_visible()
    await page.screenshot(path=str(OUT/(gid+'-menu-before.png')))
    await page.get_by_role('button',name=bonus,exact=True).click()
    selector='#gold' if slug=='idle-miner' else '#count'
    await expect(frame.locator(selector)).to_have_text(added,timeout=10000)
    await page.get_by_role('button',name='Refresh',exact=True).click();await page.wait_for_timeout(400)
    field=page.locator('.mod-cheat').filter(has=page.locator('.mod-cheat-name',has_text=re.compile('^'+balance+'$')))
    await field.locator('input').fill('12345');await field.get_by_role('button',name='Set',exact=True).click()
    await expect(frame.locator(selector)).to_have_text('12.3K',timeout=10000)
    if slug=='cookie-empire':
     await page.get_by_role('button',name='+10 of every building',exact=True).click()
     await expect(frame.locator('.owned')).to_have_count(7)
     for i in range(7):await expect(frame.locator('.owned').nth(i)).to_have_text('×10',timeout=10000)
     await expect(frame.locator('#rate')).to_have_text('13.5K / sec',timeout=10000)
     ui={'buildings':await frame.locator('.owned').all_text_contents(),'rate':await frame.locator('#rate').inner_text()}
    else:ui={'gold':await frame.locator('#gold').inner_text()}
    await page.screenshot(path=str(OUT/(gid+'-after-reload.png')))
    results.append({'id':gid,'title':title,'ui':ui,'menuAction':bonus,'postReload':True})
    print(json.dumps(results[-1]),flush=True)
   # Unrelated hub-origin game with both original idle saves still present.
   await page.goto(HUB+'/__mod_adapter_test?'+urlencode({'url':HUB+'/games/originals/memory.html','title':'Memory'}),wait_until='domcontentloaded')
   await page.wait_for_timeout(2500)
   await page.get_by_role('button',name='Mods',exact=True).click();await page.get_by_role('tab',name='Cheats',exact=True).click()
   await page.wait_for_timeout(700)
   body=await page.locator('.mod-body').inner_text()
   assert 'Idle Miner' not in body and 'Cookie Empire' not in body and '+100,000 gold' not in body,body
   actual=next(f for f in page.frames if '/games/originals/memory.html' in f.url)
   assert await actual.evaluate('()=>!!localStorage.getItem("idleMiner")&&!!localStorage.getItem("cookieEmpire")')
   await page.screenshot(path=str(OUT/'shared-origin-memory.png'))
   # Load an unrelated real same-origin game with ALL prior saves present.
   await page.goto(HUB+'/__mod_adapter_test?'+urlencode({'url':PLAY+'/games-huge/chromedino/index.html','title':'Chrome Dino'}),wait_until='domcontentloaded')
   await page.wait_for_timeout(8000)
   await page.get_by_role('button',name='Mods',exact=True).click();await page.get_by_role('tab',name='Cheats',exact=True).click()
   await expect(page.get_by_text('Chrome Dino',exact=True).last).to_be_visible(timeout=15000)
   text=await page.locator('.mod-body').inner_text()
   assert 'Wallet ($)' not in text and 'Earth resources' not in text and 'Fill food' not in text,text
   await page.screenshot(path=str(OUT/'shared-origin-dino.png'))
   result={'verified':results,'sharedOriginControl':'Chrome Dino with previous saves present','blockedRequests':blocked}
   (OUT/'results.json').write_text(json.dumps(result,indent=2))
   print(json.dumps(result,indent=2),flush=True)
  finally:await ctx.close();await browser.close()
asyncio.run(main())
