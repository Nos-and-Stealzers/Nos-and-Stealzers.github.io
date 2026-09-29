#!/usr/bin/env node
/* Builds data/mod-games.js: which games get in-game cheats in the Campus+
   mod menu, for the list on plus.html.

   Only games the menu can reach count: ones hosted on this site and ones
   served through play.<domain> (the github.io repos, see SITE.gameProxy).
   Each game page is fetched and its engine read from the scripts it loads.

   Usage: node tools/scan-mod-games.js            (needs curl on PATH) */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "mod-games.js");

/* Games with their own cheat set, by id. */
const SPECIAL = {
  "huge-sm64": "mario",
  "huge-sonic-the-hedgehog": "phaser",
  "huge-sonic-hedgehog": "phaser",
  "huge-house-of-hazards": "unity",
  "huge-cookie-clicker": "cookie",
  "huge-cookieclicker": "cookie",
  "huge-chrome-dino": "dino",
  "huge-chromedino": "dino",
  "dino": "dino",
  "huge-motox3m": "moto",
  "huge-moto-x3m-2": "moto",
  "huge-motox3m2": "moto",
  "huge-motox3m-spooky": "moto",
  "huge-motox3m-winter": "moto",
  "huge-motox3mwinter": "moto",
  "huge-moto-x3m-pool-party": "moto",
  "huge-motox3m-pool": "moto",
  "retro-bowl-plus": "retrobowl",
  "huge-retrobowl": "retrobowl",
  "huge-retro-bowl-huge": "retrobowl"
};
const SPECIAL_HOST = { hd_fnaf: "clickteam", eaglercraft: "minecraft" };

/* Checked in a browser: these look like a supported engine from their page
   but expose nothing the menu can use (Construct 3 in worker mode, Phaser
   games whose player isn't reachable), so they stay off the list. */
const EXCLUDE = new Set(["btts", "ext-quickclick", "ext2-dude-sidescroll", "ext2-hangman", "ext3-drunken-viking", "huge-basketball-legends-2020", "huge-draw-the-hill", "huge-geometry-jump-sketchy", "huge-go-ball", "huge-gopher", "huge-icys-purple-head", "huge-jelly-truck", "huge-moto-x3m-2", "huge-moto-x3m-pool-party", "huge-motox3m", "huge-motox3m-spooky", "huge-motox3m2", "huge-protektor", "huge-push-your-luck", "huge-slice-of-sasha", "huge-super-mario-construct", "huge-tactical-weapon-pack-2", "huge-unfold-2", "huge-wipo", "huge-yoshifabrication"]);
/* Plain JavaScript games the scan mistook for an engine; their own
   variables still work. */
const RETAG = {"ext2-bullet-hell": "values"};

function loadCatalog() {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "games.json"), "utf8"));
  return Array.isArray(json) ? json : json.games;
}

function loadHosts() {
  global.location = { protocol: "https:", origin: "https://www.arcadecampushub.online", hostname: "x" };
  global.window = {};
  require(path.join(ROOT, "js", "core", "config.js"));
  const site = global.window.SITE;
  const reachable = {};
  Object.keys(site.gameHosts).forEach((k) => {
    if (String(site.gameHosts[k]).indexOf(site.gameProxy.from + "/") === 0) reachable[k] = site.gameHosts[k];
  });
  return reachable;
}

function curl(url) {
  return new Promise((resolve) => {
    execFile("curl", ["-sS", "-L", "-m", "25", "--max-filesize", "4000000", url],
      { maxBuffer: 8 * 1024 * 1024, encoding: "latin1" },
      (err, out) => resolve(err ? "" : out));
  });
}

const SIGNS = [
  ["clickteam", /MMFCanvas|CRunApp|src\/Runtime\.js/i],
  ["construct", /c2runtime|cr_createRuntime|c3runtime|c3main|scripts\/main\.js|offlineclient\.js/i],
  /* Unity WebGL: its save editor works on any of them. */
  ["unity", /UnityLoader(\.min)?\.js|unityWebglLoaderUrl|UnityLoader\.instantiate|createUnityInstance|\.loader\.js["']/i],
  ["phaser?", /phaser(\.min)?\.js|phaser-ce/i]
];

async function engineOf(url) {
  const html = await curl(url);
  if (!html) return null;
  for (const [name, re] of SIGNS) {
    if (!re.test(html)) continue;
    if (name !== "phaser?") return name;
    /* Only Phaser 2 keeps its games on Phaser.GAMES where the menu finds them. */
    const src = (html.match(/src=["']([^"']*phaser[^"']*\.js)["']/i) || [])[1];
    if (!src) return null;
    const lib = await curl(new URL(src, url).href);
    return /VERSION\s*:\s*["']2\.|VERSION\s*=\s*["']2\./.test(lib.slice(0, 400000)) ? "phaser" : null;
  }
  return null;
}

async function main() {
  const games = loadCatalog();
  const hosts = loadHosts();
  const out = {};
  const todo = [];
  games.forEach((g) => {
    if (SPECIAL[g.id]) { out[g.id] = SPECIAL[g.id]; return; }
    if (SPECIAL_HOST[g.host]) { out[g.id] = SPECIAL_HOST[g.host]; return; }
    if (EXCLUDE.has(g.id)) return;
    if (RETAG[g.id]) { out[g.id] = RETAG[g.id]; return; }
    const src = String(g.source || g.direct || "");
    if (!hosts[g.host] || /^https?:/i.test(src)) return;
    todo.push({ id: g.id, url: hosts[g.host].replace(/\/+$/, "") + "/" + src.replace(/^\/+/, "") });
  });

  let done = 0;
  const workers = Array.from({ length: 12 }, async () => {
    while (todo.length) {
      const job = todo.shift();
      const engine = await engineOf(job.url);
      if (engine) out[job.id] = engine;
      if (++done % 50 === 0) process.stderr.write(done + " scanned\n");
    }
  });
  await Promise.all(workers);

  const ids = Object.keys(out).sort();
  const body = "/* Auto-generated by tools/scan-mod-games.js. Which games get in-game\n" +
    "   cheats in the Campus+ mod menu, and from which engine. */\n" +
    "window.MOD_GAMES = {\n" +
    ids.map((id) => "  " + JSON.stringify(id) + ": " + JSON.stringify(out[id])).join(",\n") +
    "\n};\n";
  fs.writeFileSync(OUT, body);
  const counts = {};
  ids.forEach((id) => { counts[out[id]] = (counts[out[id]] || 0) + 1; });
  console.log("wrote", path.relative(ROOT, OUT), ids.length, "games", counts);
}

main();
