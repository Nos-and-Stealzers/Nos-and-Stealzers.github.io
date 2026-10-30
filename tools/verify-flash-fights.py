"""Real Ruffle match regression gate. Run with py -3.14 (Playwright Firefox).
Usage: py -3.14 tools/verify-flash-fights.py https://www.arcadecampushub.online OUTDIR
One headless Firefox tab; no Chrome/Opera; screenshots and network log retained.
"""
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
records = []
with sync_playwright() as p:
    browser = p.firefox.launch(headless=True)
    page = browser.new_page(viewport={'width': 960, 'height': 600})
    current = {}
    page.on('response', lambda r: current.setdefault('responses', []).append([r.status, r.url]))
    page.on('requestfailed', lambda r: current.setdefault('failed', []).append([r.failure, r.url]))
    page.on('pageerror', lambda e: current.setdefault('errors', []).append(str(e)))
    def click(x, y):
        page.mouse.move(x, y); page.mouse.down(); page.wait_for_timeout(180); page.mouse.up(); page.wait_for_timeout(500)
    def key(name, ms=180):
        page.keyboard.down(name); page.wait_for_timeout(ms); page.keyboard.up(name); page.wait_for_timeout(500)
    def shot(name):
        page.screenshot(path=str(out / (name + '.png')))
    try:
        current = {'game': 'flash-bleach-vs-naruto'}
        page.goto(base + '/games/flash.html?swf=/games/swf/bleach-vs-naruto.swf&audit=' + str(time.time()))
        page.wait_for_timeout(20000)
        click(480, 330)
        shot('naruto-menu')
        for _ in range(7):
            key('KeyJ'); page.wait_for_timeout(3000)
        page.wait_for_timeout(6000)
        shot('naruto-fight')
        for name in ['KeyD', 'KeyJ', 'KeyK', 'KeyO']:
            key(name, 700)
        page.wait_for_timeout(2500)
        shot('naruto-fight-after-input')
        assets = [r for r in current.get('responses', []) if '/fighter/' in r[1] or '/music/' in r[1]]
        assert len(assets) >= 5, 'Did not reach fighter/assist/music loading'
        assert all(r[0] == 200 for r in assets), assets
        assert not current.get('errors'), current['errors']
        records.append(current)

        current = {'game': 'flash-super-smash-flash-2'}
        page.goto(base + '/games/flash.html?swf=/games/swf/super-smash-flash-2.swf&audit=' + str(time.time()))
        page.wait_for_timeout(15000)
        click(480, 330); page.wait_for_timeout(1000)
        click(475, 360); page.wait_for_timeout(1500)
        # Tokens need a held drag, not a click on a portrait.
        for x, y, tx, ty in [(380, 416, 263, 198), (439, 416, 598, 198)]:
            page.mouse.move(x, y); page.mouse.down(); page.wait_for_timeout(200)
            page.mouse.move(tx, ty, steps=30); page.wait_for_timeout(200); page.mouse.up(); page.wait_for_timeout(500)
        shot('ssf2-characters')
        click(826, 496); page.wait_for_timeout(1500)
        shot('ssf2-stages')
        click(300, 200); page.wait_for_timeout(8000)
        shot('ssf2-fight')
        key('KeyD', 1000); key('KeyP', 1000)
        page.wait_for_timeout(2000)
        shot('ssf2-fight-after-input')
        assert not any('/data/DAT' in u for _, u in current.get('responses', [])), 'Still using the missing-data beta loader'
        assert not current.get('errors'), current['errors']
        assert any(s == 200 and 'super-smash-flash-2.swf' in u for s, u in current['responses'])
        records.append(current)
    finally:
        browser.close()
        (out / 'network.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print(json.dumps([{'game': r['game'], 'requests': len(r.get('responses', [])), 'http_errors': [x for x in r.get('responses', []) if x[0] >= 400], 'page_errors': r.get('errors', [])} for r in records], indent=2))
