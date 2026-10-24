/* Offline shell cache.
   The site's own pages and assets are cached. Game folders stay live EXCEPT
   pepersfight's Build files, which are version-stamped in their URLs and cached
   so returning players skip the wasm download. Bump SHELL_VERSION after a deploy. */

var SHELL_VERSION = "ach-shell-v91";

/* Pepersfight build files are version-stamped in their URL (?v=x.y.z), so a cached
   copy can never go stale: the first visit fills this cache and repeat visits skip
   the whole wasm/data download. Bumped game versions create a new cache and this one
   is pruned on activate. */
var PF_BUILD_VERSION = "3.7.8";
var PF_BUILD_CACHE = "pf-build-" + PF_BUILD_VERSION;

var SHELL = [
  "index.html",
  "browse.html",
  "categories.html",
  "play.html",
  "library.html",
  "stats.html",
  "sponsored.html",
  "about.html",
  "ai.html",
  "plus.html",
  "404.html",
  "login.html",
  "signup.html",
  "friends.html",
  "messages.html",
  "notifications.html",
  "profile.html",
  "settings.html",
  "admin.html",
  "admin-search.html",
  "css/style.css",
  "js/core/config.js",
  "js/core/cloak.js",
  "js/core/theme-boot.js",
  "js/core/store.js",
  "js/core/ui.js",
  "js/core/api.js",
  "js/core/api-supabase.js",
  "js/core/session.js",
  "js/core/realtime.js",
  "js/features/catalog.js",
  "js/features/art.js",
  "js/features/social-ui.js",
  "js/features/capture.js",
  "js/features/chat-core.js",
  "js/features/chat-dock.js",
  "js/features/game-cheats.js",
  "js/features/mod-menu.js",
  "js/features/rom-guide.js",
  "js/pages/page-plus.js",
  "js/features/call.js",
  "js/features/shell.js",
  "js/pages/page-ai.js",
  "js/pages/page-home.js",
  "js/pages/page-browse.js",
  "js/pages/page-categories.js",
  "js/pages/page-play.js",
  "js/pages/page-library.js",
  "js/pages/page-stats.js",
  "js/pages/page-about.js",
  "js/pages/page-404.js",
  "js/pages/page-login.js",
  "js/pages/page-signup.js",
  "js/pages/page-friends.js",
  "js/pages/page-messages.js",
  "js/pages/page-notifications.js",
  "js/pages/page-profile.js",
  "js/pages/page-settings.js",
  "js/pages/page-admin.js",
  "js/pages/page-admin-search.js",
  "data/games.js",
  "data/mod-games.js",
  "assets/icon.svg",
  "manifest.json"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_VERSION).then(function (cache) {
      /* addAll fails the whole install if one file 404s, so add individually. */
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key === SHELL_VERSION || key === PF_BUILD_CACHE) return null;
        return caches.delete(key);   // old shells AND stale game-version build caches
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // games on other hosts

  /* Pepersfight Build assets are version-stamped (?v=x.y.z) so a cached copy can never
     go stale: cache-first makes returning players skip the wasm/data download entirely.
     The cache is keyed by PF_BUILD_VERSION and pruned on activate. */
  if (url.pathname.indexOf("/games/pepersfight/Build/") !== -1) {
    event.respondWith(
      caches.open(PF_BUILD_CACHE).then(function (cache) {
        return cache.match(request).then(function (hit) {
          if (hit) return hit;
          return fetch(request).then(function (response) {
            if (response && response.status === 200) {
              var copy = response.clone();
              cache.put(request, copy);
            }
            return response;
          });
        });
      })
    );
    return;
  }

  if (url.pathname.indexOf("/games/") !== -1) return;   // always live
  /* Sessions, friends and messages must never be served from cache. */
  if (url.pathname === "/api" || url.pathname.indexOf("/api/") === 0) return;

  /* Navigations: try the network, fall back to cache, then to the 404 page. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(SHELL_VERSION).then(function (c) { c.put(request, copy); });
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (hit) {
            return hit || caches.match("404.html") || caches.match("index.html");
          });
        })
    );
    return;
  }

  // Always prefer the active deployment's backend configuration, but keep
  // the last known config for genuinely offline arcade browsing.
  if (/\/js\/core\/config\.js$/.test(url.pathname)) {
    event.respondWith(fetch(request, { cache: "no-store" }).then(function (response) {
      if (!response || response.status !== 200) throw new Error("Config unavailable");
      var copy = response.clone();
      return caches.open(SHELL_VERSION).then(function (cache) {
        return cache.put(request, copy);
      }).catch(function () {}).then(function () { return response; });
    }).catch(function () { return caches.match(request); }));
    return;
  }

  /* Assets: cache first, refresh in the background. */
  event.respondWith(
    caches.match(request).then(function (hit) {
      var network = fetch(request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(SHELL_VERSION).then(function (c) { c.put(request, copy); });
        }
        return response;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
