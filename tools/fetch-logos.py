# W2 logo pipeline: fetch real game logos for catalog entries that have none.
#
# For each priority entry (featured / sponsored / newest first, then any game
# hosted on a folder-based repo) it looks for logo-like image files inside that
# game's own folder on its GitHub Pages repo, downloads the best one, verifies
# it decodes as an image, downscales to <=96px tall and stores it locally under
# assets/logos/<id>.webp. The entry then gets a `logo` field pointing at the
# local copy, so the card never depends on a game host staying up.
#
# Honesty rules: no invented art, no web-search harvesting. A candidate must
# come from the game's own folder and pass an HTTP 200 + image-decode check;
# anything the pipeline cannot source keeps the generated plate.
#
# After a run: regenerate data/games.js + sitemap.xml (tools/build-sitemap.ps1),
# bump sw.js SHELL_VERSION, then CURATE BY EYE - contact-sheet the produced
# logos and drop engine logos (Unity/Construct TemplateData art), other
# companies' app icons and placeholder assets. Filename ranking cannot tell a
# Unity placeholder logo from the game's own art; only a vision pass can.
#
#   py -3.14 tools/fetch-logos.py            # fill missing logos
#
# Needs Pillow: py -3.14 -m pip install pillow

import json, os, io, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(os.environ.get("TMPDIR", os.environ.get("TEMP", ".")), "ach-logos")
OUT = os.path.join(ROOT, "assets", "logos")
CATALOG = os.path.join(ROOT, "data", "games.json")
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

GITHUB_IO = "https://arcadecampushub.github.io"
API = "https://api.github.com/repos/arcadecampushub/%s/git/trees/%s?recursive=1"
HOST_REPO = {
    "games-huge": "games-huge",
    "extgames": "extgames",
    "hd_fnaf": "hd_fnaf",
    "polytrack": "polytrack",
    "retrobowl": "RetroBow",
    "waterboy-firegirl": "Waterboy-Firegirl",
}
MIN_DIM = 48          # smaller than this reads as a blurry favicon on a card
MAX_TALL = 96         # stored height cap
MAX_WIDE = 160
MAX_BYTES = 3_000_000

def rank(path):
    """Filename ranking: logo-like names first, scenery and UI junk last."""
    name = path.rsplit("/", 1)[-1].lower()
    r = 0
    if "icon" in name: r = 100
    elif "logo" in name: r = 90
    elif "apple-touch" in name: r = 80
    elif "og_image" in name or "ogimage" in name: r = 75
    elif "thumb" in name: r = 60
    elif "cover" in name: r = 55
    elif "splash" in name: r = 50
    elif "favicon" in name: r = 40
    if "background" in name or name.startswith("media"): r = 5
    if "/assets/" in "/" + path: r = 0
    if any(s in name for s in ("button", "arrow", "cursor", "donate", "favicon-16")): r = 0
    return r

def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "ach-logo-pipeline/1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "")

def fetch_tree(repo, branch):
    cache = os.path.join(TMP, repo + ".txt")
    if os.path.isfile(cache):
        return open(cache, encoding="utf-8").read().splitlines()
    for b in (branch, "main", "master"):
        try:
            raw, _ = fetch(API % (repo, b))
            paths = [t["path"] for t in json.loads(raw)["tree"]]
            open(cache, "w", encoding="utf-8").write("\n".join(paths))
            return paths
        except Exception:
            continue
    return []

def folder_index(repo, paths):
    idx = {}
    for p in paths:
        if "/" not in p: continue
        folder = p.split("/", 1)[0]
        r = rank(p)
        if r <= 0: continue
        idx.setdefault(folder, []).append((r - p.count("/") * 2, p))
    for folder in idx:
        idx[folder] = [p for _, p in sorted(idx[folder], reverse=True)]
    return idx

def plan_for(entry, indexes):
    host = entry.get("host") or ""
    src = entry.get("source") or entry.get("direct") or ""
    if host in HOST_REPO:
        repo = HOST_REPO[host]
        folder = src.rsplit("/", 1)[0] if "/" in src else ""
        if folder and folder in indexes[repo]:
            return repo, folder
    if not host and src.startswith("games/"):
        folder = src.split("/")[1] if src.count("/") >= 1 else ""
        if folder and folder not in ("originals", "repaired", "swf"):
            return "@local", folder
    return None

def process(raw, gid):
    """Verify + downscale + store. Returns stored dims, or None to reject."""
    if len(raw) < 400 or len(raw) > MAX_BYTES: return None
    try:
        im = Image.open(io.BytesIO(raw)); im.load()
    except Exception:
        return None
    w, h = im.size
    if w < MIN_DIM or h < MIN_DIM: return None
    scale = min(1.0, MAX_TALL / h, MAX_WIDE / w)
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    im.convert("RGBA").save(os.path.join(OUT, gid + ".webp"), "WEBP", quality=82, method=4)
    return im.size

def work(job):
    e, repo, folder, cands = job
    for cand in cands:
        try:
            if repo == "@local":
                path = os.path.join(ROOT, "games", folder, cand)
                if not os.path.isfile(path): continue
                raw = open(path, "rb").read()
            else:
                raw, _ = fetch("%s/%s/%s" % (GITHUB_IO, repo, cand))
        except Exception:
            continue
        dims = process(raw, e["id"])
        if dims:
            return (e["id"], cand, dims)
    return None

def main():
    catalog = json.load(open(CATALOG, encoding="utf-8"))
    indexes = {r: folder_index(r, fetch_tree(r, "main")) for r in set(HOST_REPO.values())}

    priority, seen = [], set()
    def add(entries):
        for e in entries:
            if e["id"] in seen: continue
            seen.add(e["id"])
            if e.get("unavailable") or e.get("logo") or e.get("icon"): continue
            priority.append(e)
    add([e for e in catalog if e.get("featured")])
    add([e for e in catalog if e.get("sponsored")])
    newest = [e for e in catalog if e.get("dateAdded")]
    newest.sort(key=lambda e: e["dateAdded"], reverse=True)
    add(newest)
    add([e for e in catalog if (e.get("host") or "") in HOST_REPO])
    add([e for e in catalog if not e.get("host") and (e.get("source") or "").startswith("games/")])

    jobs = []
    for e in priority:
        plan = plan_for(e, indexes)
        if not plan: continue
        repo, folder = plan
        if repo == "@local":
            base = os.path.join(ROOT, "games", folder)
            cands = sorted(((rank(n), n) for n in os.listdir(base)
                            if os.path.isfile(os.path.join(base, n))), reverse=True)
            cands = [n for r, n in cands if r > 0][:3]
        else:
            cands = indexes[repo].get(folder, [])[:4]
        if cands:
            jobs.append((e, repo, folder, cands))
    print("candidates: %d, fetch jobs: %d" % (len(priority), len(jobs)))

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = [r for r in pool.map(work, jobs) if r]
    ok = {gid: cand for gid, cand, _ in results}

    raw = open(CATALOG, encoding="utf-8").read()
    byid = {e["id"] for e in catalog}
    inserted = 0
    for gid in ok:
        if gid not in byid: continue
        anchor = '"id": "%s",' % gid
        i = raw.find(anchor)
        if i == -1: continue
        line_end = raw.find("\n", i)
        if '"logo"' in raw[i:raw.find('"id":', i + 1)]:
            continue
        raw = raw[:line_end + 1] + '        "logo": "assets/logos/%s.webp",\n' % gid + raw[line_end + 1:]
        inserted += 1
    open(CATALOG, "w", encoding="utf-8", newline="\n").write(raw)
    json.load(open(CATALOG, encoding="utf-8"))   # validate

    print("upgraded: %d (files: %d, catalog lines: %d)" % (len(results), len(ok), inserted))
    for gid, cand, dims in results[:20]:
        print("  %-30s <- %s %s" % (gid, cand, dims))
    print("NEXT: curation pass (contact sheet), then tools/build-sitemap.ps1 + sw bump.")

if __name__ == "__main__":
    main()
