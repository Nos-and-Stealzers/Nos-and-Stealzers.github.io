# Fighting / Flash repair audit — 2026-10-30

## Scope and evidence

- One headless Playwright **Firefox** tab reused sequentially, then closed. No Chrome or Opera.
- Baseline: **39 distinct entries** = all **26 fighting-category** games plus **13 samples**, including all three root self-hosted SWFs.
- The baseline sweep checks visible loading/title/menu/scene and network/page errors, **not a complete playthrough of all 39 games**.
- Targeted follow-ups navigate through character selection into real Bleach vs Naruto and SSF2 fights; additional launcher fixes are checked with input and screenshots.
- Evidence directory: `C:/Users/lucas/AppData/Local/Temp/bvn/` (baseline `sweep/results.json` + 39 PNGs; targeted `verified-repairs/`, `live-fights/`, `live-repairs/`, `top-pages/`).
- Re-run the two main match regressions: `py -3.14 tools/verify-flash-fights.py https://www.arcadecampushub.online OUTDIR`.
- Automated gates: `node --test tools/test-flash-player.js tools/test-repaired-games.js tools/test-cross-domain-sync.js`.

## Broken games and repairs

| Entry | Root cause and action |
|---|---|
| `flash-bleach-vs-naruto` | Missing external fighters/assists/music; restored 61 companion files and fixed Ruffle base. Original v2.2 SWF retained. |
| `flash-super-smash-flash-2` | Beta loader stuck at 5% (28 missing DAT requests). Replaced with standalone Demo v0.4a; catalog explicitly labels demo. |
| `nebula-brawlsimulator-3d` | Unity loader stuck at 0 MB: CDN blocks genizy. Pinned alternate asset origin and local launcher. |
| `nebula-genericfightermaybe` | Black canvas / GameMaker_Init undefined: blocked runner CDN. Pinned alternate asset origin and local launcher. |
| `nebula-stickfighter` | Purple canvas / missing textures and audio: CDN package >50 MB. Pinned alternate origin, fixed Construct runtime and worker bases. |

## Full baseline inventory

| Entry | Baseline HTTP errors | Page errors | Assessment / action |
|---|---:|---:|---|
| `flash-bleach-vs-naruto` | 0 | 0 | Missing external fighters/assists/music; restored 61 companion files and fixed Ruffle base. Original v2.2 SWF retained. |
| `flash-super-smash-flash-2` | 28 | 0 | Beta loader stuck at 5% (28 missing DAT requests). Replaced with standalone Demo v0.4a; catalog explicitly labels demo. |
| `flash-mario-combat` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `original-snake` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `huge-getaway-shootout` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `huge-idle-breakout` | 12 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `nebula-beachboxingsim` | 4 | 1 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `nebula-bigshotboxing-2` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `nebula-boxinglive-2` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `nebula-brawlsimulator-3d` | 9 | 0 | Unity loader stuck at 0 MB: CDN blocks genizy. Pinned alternate asset origin and local launcher. |
| `nebula-brawlstars` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `nebula-genericfightermaybe` | 1 | 1 | Black canvas / GameMaker_Init undefined: blocked runner CDN. Pinned alternate asset origin and local launcher. |
| `nebula-glfighters` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `nebula-praxisfighterx` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `nebula-stickfighter` | 20 | 2 | Purple canvas / missing textures and audio: CDN package >50 MB. Pinned alternate origin, fixed Construct runtime and worker bases. |
| `nebula-supersmashflash-2-butdifversion` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `nebula-fnfmidfight` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-bloons-tower-defense-5` | 2 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-happywheels` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-run-2` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-super-smash-flash` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-learn-to-fly-3` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-learntofly2` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-papasburgeria` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-superfighters` | 0 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `flash-tank-trouble` | 4 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `huge-kart-fight` | 3 | 2 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `huge-boxhead` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `huge-ninja-vs` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-babychiccoadventure` | 0 | 1 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-chaosfaction2` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-electricman2` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-hobo2` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-hobo3` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-hobo4` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-hobo5` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-hobo6` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-hobo7` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |
| `neb4-newgroundsrumble` | 1 | 0 | Rendered menu/scene; retained. Any recorded ads/analytics/platform warnings were not treated as a failed game. |

## Non-blocking warnings / limitations

- Tank Trouble v3.13 requests unavailable `includes/loadMaze.php`. A targeted follow-up reaches its built-in maze after selecting 1 player and pressing M; server-dependent features are not restored.
- Kart Fight.io reaches the match/tutorial after Play despite retired GameDistribution ad/API requests. It was not incorrectly hidden on the strength of an ad API 404.
- Older NEBULA wrappers (Chaos Faction 2, Hobo 2–7, Newgrounds Rumble) make a stray `$1` request but their fallback embedded SWFs render; these were retained, not replaced merely to make console logs quiet.
- Generic Fighter Maybe can log GameMaker audio-buffer warnings before a user gesture; menu navigation is verified separately from that warning.
- The standalone SSF2 demo has a retired MochiBot analytics request. This does not supply game assets and does not block matches.
- The three repaired external launchers now run on the hub origin. Their existing catalog ids/cloud row ids are retained; old unsynced origin-local saves are not deleted but are not automatically migrated.
- This audit is a targeted fighting/Flash sweep, not a promise that all 2,073 catalog games work or that all online services have been restored.
