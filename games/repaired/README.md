# Repaired fighting-game launchers

These are local launch pages for three existing catalog ids. Original game
code, author credits and save ids are retained. Only asset delivery / runtime
path handling changed; no build files were fabricated or replaced.

| Catalog id | Original breakage | Repair |
|---|---|---|
| `nebula-brawlsimulator-3d` | jsDelivr returns `User genizy is blocked`; Unity remained at `0.00 MB / 101.82 MB` | Same upstream build, assets on rawcdn.githack at `300ed9885585131efb4e07f26bb835e100e542ff` (`genizy/google-class/brawl-3d`) |
| `nebula-genericfightermaybe` | Blocked jsDelivr runner; `GameMaker_Init is not defined`; black canvas | Same upstream GameMaker assets pinned to `acfea3c40aaf3f2d64b32691bb93c6c93c69796a` (`genizy/biologyexams/generic-fighter-maybe`) |
| `nebula-stickfighter` | jsDelivr package exceeds 50 MB, so many textures/audio return 403; purple canvas | Same upstream Construct build pinned to `c971830969590ba871cdc88e79d6c9d181ffc74b` (`cooldude2349/everything/stickfight`) |

`stick-fighter-main.js` is the existing runtime bootstrap, with its hard-coded
jsDelivr URLs changed to the pinned asset origin. It also sets `runtimeBaseUrl`
explicitly: `<base>` alone does not fix Construct's `location.pathname`-derived
runtime paths. Worker fetch uses the requested worker URL, not the old bootstrap's
hard-coded dispatchworker URL for every worker. The remote service-worker
registration was removed because it cannot control our local-origin wrapper.

Do not judge cold GitHack assets by HEAD alone: we saw HEAD 403 while GET returned
the correct bytes. Verify in a real headless Firefox tab and inspect the rendered
game, HTTP failures and console. These builds still contain their original
optional advertising/platform SDK calls; an SDK warning is not a broken game
if the game itself renders and accepts input.

A catalog id stays unchanged so favourites/history and per-game cloud rows still
refer to the same entry. The launcher origin does change from rawcdn.githack to
the hub; pre-existing unsynced local-only saves on the old origin are not erased,
but are not automatically migrated by these launch-page repairs.
