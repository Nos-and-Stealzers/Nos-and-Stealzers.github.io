# Self-hosted Flash game assets

These games run in `games/flash.html` with Ruffle. Its `base` must be the SWF's
folder, not the player's folder. Keep filenames/case and subdirectories intact.

## Bleach vs Naruto (5DPLAY, original v2.2 retained)

The original `bleach-vs-naruto.swf` is a **loader**, not a complete game. It needs
`fighter/*.swf`, `fighter/fz/*.swf` (assists) and `music/*.mp3` at runtime. Missing
fighters leave the versus screen's loading bar stuck indefinitely.

The 61 companion files were recovered from the matching legacy asset layout at:
`https://flashga.me/public/storage/games/bleach-vs-naruto-2.6-files/`
(only filenames referenced by our existing v2.2 SWF were retained). The v2.6
archive reuses the v2.2 fighters/assists; we kept our original v2.2 launcher and
verified fights, assists, music and additional character selections in Ruffle.
Original game by 5DPLAY: `https://www.5dplay.net/`.

Do not replace this with another single v2.x loader without its matching assets.
The strings `keysound1.mp3`/`keysound2.mp3` are embedded sound linkage names, not
missing external downloads. Fighter/assist SWFs contain additional embedded
transformation resources; preserve them byte-for-byte.

## Super Smash Flash 2 (McLeodGaming, standalone Demo v0.4a)

The previous 1.7 MB beta loader stalled at 5% because its ~300 matching
`data/DAT*.ssf` archives were absent. It has been replaced with **Demo v0.4a**,
which is standalone and has six playable characters. The catalog explicitly
labels this older demo; it is not represented as the full beta release.

Archive source:
`https://cdn.jsdelivr.net/gh/KrMattsson/azurenaming@0d162ac92aa303b9fe7c30988877cb5025c7183a/Pages/ssf2-0.4a.swf`
Original publisher: `https://www.supersmashflash.com/` / McLeodGaming.

The source was FWS; the committed copy is losslessly zlib-compressed CWS with
identical decompressed bytes. It was verified through character selection,
stage selection and a Mario-vs-Sonic fight. Drag player tokens onto portraits
(do not just click the portraits), then click GO and a stage.
The retired `mochibot.com` analytics request can fail without affecting play.

## Regression checks

`node --test tools/test-flash-player.js`

HTTP 200 on the main SWF and a visible menu do **not** prove a game works.
Use headless Firefox (never Chrome/Opera) and actually start a fight. Watch for
network 404s **after** character selection and confirm both fighters, the HUD,
movement/attacks and the match timer render. A new catalog id must not be used
for these repairs: existing favourites/history/save keys stay attached.
