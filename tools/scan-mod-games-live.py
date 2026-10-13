"""Live engine scan for the Campus+ mod menu list (data/mod-games.js).

tools/scan-mod-games.js reads each game page's HTML, which misses games
whose engine is loaded from a script or an inner frame. This loads every
reachable game in headless Chromium, injects js/features/game-cheats.js and
asks it which engine it found, exactly as the mod menu would. Results go to
tools/mod-games-live.json, which scan-mod-games.js merges in.

Usage:  uv run --with playwright python tools/scan-mod-games-live.py [--only nebula|huge|ext|self] [--limit N]
"""
from urllib.parse import quote
import argparse, asyncio, json, mimetypes, pathlib, re, subprocess, sys, time

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "mod-games-live.json"
HUB = "https://www.arcadecampushub.online"
PLAY = "https://play.arcadecampushub.online"
GH = "https://arcadecampushub.github.io"

KIND = {
    "Super Mario 64": "mario", "Clickteam Fusion": "clickteam", "Construct": "construct", "Phaser": "phaser",
    "Minecraft (Eaglercraft)": "minecraft", "Flash": "flash", "Unity": "unity", "Chrome Dino": "dino",
    "Cookie Clicker": "cookie", "Moto X3M": "moto", "Retro Bowl": "retrobowl", "2048": "g2048",
    "Flappy Bird": "flappy", "Temple Run 2": "temple", "Crossy Road": "crossy", "A Dark Room": "darkroom",
    "Bitcoin Clicker": "bitcoin", "Particle Clicker": "particle", "QuickClick": "quickclick",
    "devLife": "devlife", "Game values": "values",
}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
CHEATS = (ROOT / "js/features/game-cheats.js").read_text(encoding="utf8")

PROBE = """async () => {
  try {
    const r = await Promise.race([window.GameCheats.inspect(window),
      new Promise(res => setTimeout(() => res({engine: 'timeout', items: []}), 6000))]);
    const own = (r.items || []).filter(i => !String(i.id).startsWith('q:'));
    return { engine: r.engine, items: own.length, labels: own.filter(i => i.type === 'value').slice(0, 6).map(i => i.label) };
  } catch (e) { return { err: String(e && e.message || e) }; }
}"""


def candidates():
    js = r"""
global.location={protocol:'https:',origin:'https://www.arcadecampushub.online',hostname:'www.arcadecampushub.online'};
global.window={};require(process.argv[1]+'/js/core/config.js');
const site=window.SITE, px=site.gameProxy, hosts=Object.assign({}, site.gameHosts, px.direct||{});
const g=JSON.parse(require('fs').readFileSync(process.argv[1]+'/data/games.json','utf8'));const games=Array.isArray(g)?g:g.games;
const out=[];
for(const x of games){ if(x.unavailable) continue;
  const src=String(x.source||x.direct||''); if(/^https?:/i.test(src)) continue;
  let base=null, kind=null;
  if(!x.host){ base='HUB'; kind='self'; }
  else if(hosts[x.host] && hosts[x.host].startsWith(px.from+'/')){ base=hosts[x.host].replace(px.from, 'PLAY'); kind=x.host==='games-huge'?'huge':x.host; }
  else if(x.host==='nebula-cdn'){ base=site.gameHosts['nebula-cdn']; kind='nebula'; }
  else continue;
  out.push({id:x.id, kind, url: base.replace(/\/+$/,'')+'/'+src.replace(/^\/+/,'')});
}
process.stdout.write(JSON.stringify(out));
"""
    res = subprocess.run(["node", "-e", js, str(ROOT)], capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


SCAN_PAGE = """<!doctype html><meta charset="utf-8"><body style="margin:0">
<iframe id="g" style="width:1100px;height:760px;border:0" allow="autoplay; fullscreen; gamepad"></iframe>
<script>document.getElementById('g').src = new URLSearchParams(location.search).get('u');</script>"""


async def route_hub(route):
    url = route.request.url
    if url.split("?", 1)[0] == HUB + "/__scan.html":
        await route.fulfill(status=200, body=SCAN_PAGE, headers={"content-type": "text/html"})
        return
    path = url.split("?", 1)[0].split("#", 1)[0][len(HUB):] or "/"
    if path.endswith("/"):
        path += "index.html"
    f = ROOT / path.lstrip("/")
    if not f.is_file():
        await route.fulfill(status=404, body="nf")
        return
    await route.fulfill(status=200, body=f.read_bytes(), headers={"content-type": mimetypes.guess_type(str(f))[0] or "application/octet-stream"})


async def route_play(route):
    try:
        resp = await route.fetch(url=GH + route.request.url[len(PLAY):])
        await route.fulfill(response=resp)
    except Exception:
        try:
            await route.abort()
        except Exception:
            pass


async def scan_one(ctx, job, wait):
    """Embedded in a hub page, as the site plays it (githack refuses
    top-level navigations with an interstitial)."""
    page = await ctx.new_page()
    page.on("dialog", lambda d: asyncio.ensure_future(d.dismiss()))
    url = job["url"].replace("HUB", HUB, 1).replace("PLAY", PLAY, 1)
    try:
        await page.goto(HUB + "/__scan.html?u=" + quote(url, safe=""), timeout=30000, wait_until="load")
        frame = None
        for _ in range(60):
            frame = next((f for f in page.frames if f.url.split("#")[0] == url or f.url.startswith(url)), None)
            if frame:
                break
            await asyncio.sleep(0.5)
        if not frame:
            return {"err": "frame never loaded"}
        await asyncio.sleep(wait)
        await frame.add_script_tag(content=CHEATS)
        return await frame.evaluate(PROBE)
    except Exception as e:
        return {"err": str(e)[:160]}
    finally:
        try:
            await page.close()
        except Exception:
            pass


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--wait", type=float, default=9)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--ids")
    a = ap.parse_args()
    jobs = candidates()
    if a.only:
        jobs = [j for j in jobs if j["kind"] == a.only]
    if a.ids:
        want = set(a.ids.split(","))
        jobs = [j for j in jobs if j["id"] in want]
    done = json.loads(OUT.read_text()) if OUT.exists() else {}
    if not a.ids:
        jobs = [j for j in jobs if j["id"] not in done]
    if a.limit:
        jobs = jobs[: a.limit]
    print(len(jobs), "to scan", flush=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])
        # rawcdn.githack.com shows an interstitial to HeadlessChrome; look like a normal browser.
        ctx = await browser.new_context(service_workers="block", user_agent=UA, viewport={"width": 1150, "height": 800})
        await ctx.route(HUB + "/**", route_hub)
        await ctx.route(PLAY + "/**", route_play)
        q = list(jobs)
        n = 0
        t0 = time.time()

        async def worker():
            nonlocal n
            while q:
                job = q.pop(0)
                try:
                    r = await asyncio.wait_for(scan_one(ctx, job, a.wait), 75)
                except asyncio.TimeoutError:
                    r = {"err": "hung"}
                eng = r.get("engine")
                done[job["id"]] = {"engine": eng, "kind": KIND.get(eng), "items": r.get("items", 0), "err": r.get("err"),
                                   "labels": r.get("labels") or []}
                n += 1
                if n % 20 == 0:
                    OUT.write_text(json.dumps(done, indent=1, sort_keys=True))
                    print(n, "scanned", round(time.time() - t0), "s", flush=True)

        await asyncio.gather(*[worker() for _ in range(a.workers)])
        OUT.write_text(json.dumps(done, indent=1, sort_keys=True))
        await browser.close()
    kinds = {}
    for v in done.values():
        kinds[v.get("kind")] = kinds.get(v.get("kind"), 0) + 1
    print("done", kinds)


asyncio.run(main())
