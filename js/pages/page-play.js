/* Player page: loads one title, tracks playtime, falls back to a new tab when
   a game refuses to be framed. */
(function () {
  "use strict";

  var game = null;
  var frame = null;
  var since = 0;
  var tall = false;
  var loaded = false;
  var callRootHome = null;
  var callRootNext = null;

  function $(id) { return document.getElementById(id); }
  function stage() { return $("stage"); }
  function curtain() { return $("curtain"); }

  /* ------------------------------------------------------------------ boot */

  function init() {
    var UI = window.UI;
    game = window.Catalog.byId(UI.params().get("id") || "");

    if (!game) {
      $("missing").hidden = false;
      $("miss-random").addEventListener("click", window.Shell.playRandom);
      document.title = "Not found — " + window.SITE.name;
      return;
    }

    $("player").hidden = false;
    document.title = game.title + " — " + window.SITE.name;
    var meta = document.querySelector('meta[name="description"]');
    if (meta && game.description) meta.setAttribute("content", game.description);

    details();
    actions();
    stars();
    window.UI.render($("g-related"), window.Catalog.related(game, 12), { desc: false });

    if (game.unavailable) unavailable();
    else if (game.embeddable && !game.preferDirect) restoreThenEmbed();
    else prompt();

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        flush();
        /* Tabbing away is the most common way a session ends, so treat it as
           a save point rather than waiting for the interval. */
        if (playedLongEnough()) backupProgress("hidden");
      } else if (frame) {
        since = Date.now();
      }
    });

    window.addEventListener("beforeunload", function () {
      flush();
      if (playedLongEnough()) backupProgress("unload");
    });
    window.setInterval(flush, 30000);

    window.Session.ready.then(watchProgress);
    document.addEventListener("session:change", watchProgress);

    /* Presence: tell the server what's being played, and clear it on the way
       out so the staff live view doesn't show ghosts. Best-effort — a failure
       here must never interrupt play. */
    function announcePlaying(id) {
      if (!window.Session.user) return;
      window.API.setPlaying(id).catch(function () {});
    }
    window.Session.ready.then(function (state) {
      if (state.user && frame) announcePlaying(game.id);
    });
    window.addEventListener("beforeunload", function () { announcePlaying(""); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) announcePlaying("");
      else if (frame) announcePlaying(game.id);
    });
    window.playAnnounce = announcePlaying;
  }

  /* --------------------------------------------------------------- details */

  function details() {
    var UI = window.UI;

    $("crumb").textContent = game.categoryLabel + " · " + game.id;
    $("g-title").textContent = game.title;
    $("g-desc").textContent = game.description || "No description on file for this one.";

    var catHref = "browse.html?category=" + game.category;
    $("cat-link").href = catHref;
    $("cat-link").textContent = game.categoryLabel + " →";

    var flags = $("g-flags");
    flags.appendChild(UI.riskFlag(game));
    var launch = UI.el("span", "flag " + (game.embeddable && !game.preferDirect ? "flag-good" : "flag-warn"),
      game.embeddable && !game.preferDirect ? "Plays in page" : "Opens a new tab");
    flags.appendChild(launch);
    if (game.platform === "local") flags.appendChild(UI.el("span", "flag", "Hosted here"));

    /* Pre-fills the game on the feedback form, so a broken title takes one
       click to report from the place you noticed it. */
    $("a-report").href = "feedback.html?game=" + encodeURIComponent(game.id);

    /* A per-title warning, shown before the stage rather than after you've
       already lost something to it. */
    if (game.notice) {
      $("notice-body").textContent = game.notice;
      $("game-notice").hidden = false;
    }

    $("m-cat").textContent = game.categoryLabel;
    $("m-risk").textContent = UI.riskLabel(game);
    $("m-launch").textContent = UI.launchLabel(game);

    counters();
    pinButton(window.Store.isFavorite(game.id));
  }

  function counters() {
    var UI = window.UI;
    var s = window.Store.statFor(game.id);
    $("m-plays").textContent = s.plays;
    $("m-time").textContent = UI.formatDuration(s.seconds);
    $("m-last").textContent = UI.formatWhen(s.last);
  }

  function pinButton(on) {
    var b = $("a-pin");
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.textContent = on ? "★ Pinned" : "☆ Pin";
  }

  /* ----------------------------------------------------------------- stage */

  /* Auto-restore, then play. Before the game frame ever loads, pull this
     account's cloud save for this host down into the host's storage (merge,
     never overwrite newer local progress). That way a game started on another
     device already has its progress present the moment it reads storage — the
     user never presses a "load" button. If there's no save, nothing to do; if
     the bridge is slow or absent, we don't block play — a short timeout falls
     through to embedding regardless. */
  var didRestore = false;
  function restoreThenEmbed() {
    if (didRestore || !canBackup()) { embed(); return; }
    didRestore = true;

    var origin = (window.SITE.gameHosts || {})[effectiveHost()];
    if (!origin) { embed(); return; }

    showLoading(true);
    markSaved("checking your save…", "");

    var settled = false;
    function go(restored) {
      if (settled) return;
      settled = true;
      embed();
      if (restored) markSaved("cloud save loaded", "ok");
    }

    /* Never let a stuck bridge hold the game hostage. */
    var guard = window.setTimeout(function () { go(false); }, 6000);

    window.GameSaves.restoreHost(origin, false).then(function (mine) {
      window.clearTimeout(guard);
      go(!!(mine && mine.written));
    }).catch(function () {
      window.clearTimeout(guard);
      go(false);
    });
  }

  function embed() {
    var url = game.sourceUrl || game.directUrl;
    if (!url) { prompt("This entry has no playable URL on file."); return; }
    if (frame) frame.remove();
    frame = document.createElement("iframe");
    frame.src = url;
    frame.title = game.title;
    frame.allow = "autoplay; fullscreen; gamepad; clipboard-write";
    frame.setAttribute("allowfullscreen", "");
    if (game.sandbox) frame.setAttribute("sandbox", game.sandbox);

    loaded = false;
    showLoading(true);
    frame.addEventListener("load", function () {
      loaded = true;
      showLoading(false);
      window.setTimeout(function () { try { frame.focus(); } catch (e) {} }, 60);
    });
    stage().insertBefore(frame, curtain());

    /* Tells the shell to stand down its single-key shortcuts — R would
       navigate away from a game in progress, K would cover it. */
    document.body.dataset.gameActive = "1";
    if (window.playAnnounce) window.playAnnounce(game.id);

    curtain().hidden = true;
    window.Store.recordPlay(game.id);
    window.Store.pushRecent(game.id);
    since = Date.now();
    counters();
    $("a-play").textContent = "↻ Reload";

    if (window.Store.settings().autoFullscreen) fullscreen();
    watchdog();
  }

  /* No repo carries this title's files. Say so, rather than loading a frame
     that will only ever 404. */
  function unavailable() {
    var c = curtain();
    c.hidden = false;
    c.dataset.mode = "gone";
    $("c-label").textContent = "Unavailable";
    $("c-title").textContent = "This one isn't hosted anywhere";
    $("c-body").textContent =
      "It's still listed so the index stays honest, but none of the game hosts " +
      "carry its files. Nothing to load.";
    $("c-action").textContent = "⇢ Play something else";
    $("c-alt").hidden = true;

    ["a-play", "a-full", "a-tab"].forEach(function (id) { $(id).disabled = true; });
  }

  function prompt(reason) {
    var c = curtain();
    c.hidden = false;
    c.dataset.mode = "direct";
    $("c-label").textContent = reason ? "Blocked" : "External";
    $("c-title").textContent = reason ? "Can't load in the page" : "This one opens in its own tab";
    $("c-body").textContent = reason ||
      "The game refuses to be framed, so it runs in a fresh tab. Your time still counts.";
    $("c-action").textContent = "↗ Open " + game.title;

    var alt = $("c-alt");
    alt.hidden = false;
    alt.textContent = "Try loading it in the page anyway";
  }

  function newTab() {
    var url = game.directUrl || game.sourceUrl;
    if (!url) { window.UI.toast("No launch URL on file"); return; }
    /* Open the arcade's OWN play wrapper (same origin as this page), not the
       raw game URL. This keeps the game running under the SAME top-level
       origin — and therefore the SAME browser storage partition — whether you
       play it embedded here or in a separate tab, so progress that a game
       writes to its own localStorage/IndexedDB is shared between the two
       instead of splitting into two partitions that never see each other.
       (That split is exactly why Mario/Sonic/flash saves "didn't carry over".)
       For genuinely un-embeddable games we still fall back to the raw URL. */
    var wrapper = "play.html?id=" + encodeURIComponent(game.id) + "&auto=1";
    var target = game.embeddable ? wrapper : url;
    var win = window.open(target, "_blank", "noopener");
    if (!win) { window.UI.toast("Pop-up blocked — allow it and retry"); return; }
    window.Store.recordPlay(game.id);
    window.Store.pushRecent(game.id);
    counters();
  }

  /* Open the game in a URL-less about:blank tab. The address bar and history
     show nothing about the game or the arcade — the reliable way past a filter
     that watches URLs. Falls back to a normal new tab if popups are blocked. */
  function cloakTab() {
    var url = game.directUrl || game.sourceUrl;
    if (!url) { window.UI.toast("No launch URL on file"); return; }
    if (!(window.Cloak && window.Cloak.supported())) { newTab(); return; }
    var win = window.Cloak.open(url, { disguise: window.Store.settings().cloakDisguise });
    if (!win) { window.UI.toast("Pop-up blocked — allow it and retry"); return; }
    window.Store.recordPlay(game.id);
    window.Store.pushRecent(game.id);
    counters();
    window.UI.toast("Opened in a hidden tab");
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  function exitFullscreen() {
    var node = stage();
    if (node.classList.contains("is-pseudo-fullscreen")) {
      node.classList.remove("is-pseudo-fullscreen");
      document.body.classList.remove("game-pseudo-fullscreen");
      syncFullscreenUI();
      return Promise.resolve();
    }
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!exit) return Promise.resolve();
    var out = exit.call(document);
    return out && out.catch ? out : Promise.resolve(out);
  }

  /* Fullscreen only renders descendants of the fullscreen element. Move the
     live call surface into the game stage while it is fullscreen, otherwise a
     call appears to vanish the moment someone starts playing. Restore it to
     its exact previous position on exit. */
  function syncFullscreenUI() {
    var node = stage();
    var active = fullscreenElement() === node || node.classList.contains("is-pseudo-fullscreen");
    node.classList.toggle("is-fullscreen", active);
    var button = $("a-full");
    if (button) {
      button.textContent = active ? "↙ Exit fullscreen" : "⛶ Fullscreen";
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    var title = $("stage-fullscreen-title");
    if (title) title.textContent = game ? game.title : "Playing";

    var calls = document.querySelector(".callroot");
    if (active && calls && calls.parentNode !== node) {
      callRootHome = calls.parentNode;
      callRootNext = calls.nextSibling;
      node.appendChild(calls);
    } else if (!active && calls && callRootHome && calls.parentNode === node) {
      if (callRootNext && callRootNext.parentNode === callRootHome) callRootHome.insertBefore(calls, callRootNext);
      else callRootHome.appendChild(calls);
      callRootHome = null;
      callRootNext = null;
    }
  }

  function fullscreen() {
    var node = stage();
    if (fullscreenElement() === node || node.classList.contains("is-pseudo-fullscreen")) {
      exitFullscreen().catch(function () { window.UI.toast("Fullscreen could not close"); });
      return;
    }
    var req = node.requestFullscreen || node.webkitRequestFullscreen || node.msRequestFullscreen;
    if (!req) {
      /* iPhone/iPad browsers and some managed-school builds expose no element
         Fullscreen API. A fixed immersive stage is a real usable fallback,
         with the same exit button and Escape behavior. */
      node.classList.add("is-pseudo-fullscreen");
      document.body.classList.add("game-pseudo-fullscreen");
      syncFullscreenUI();
      return;
    }
    var out = req.call(node, { navigationUI: "hide" });
    if (out && out.catch) out.catch(function () { window.UI.toast("Fullscreen was blocked"); });
  }

  /* Some of these are large Unity builds on a CDN, so a blank black box for
     ten seconds is normal, not broken. Say so instead of showing nothing. */
  function showLoading(on) {
    var box = $("stage-loading");
    if (!box) return;
    box.hidden = !on;
  }

  /* If a framed game never loads at all, offer the new-tab route.
     This used to read frame.contentDocument, which silently stopped working
     the moment games moved to their own origin — cross-origin access always
     throws, and the catch treated that as success, so the fallback could
     never fire. The load event crosses origins; the document does not. */
  function watchdog() {
    window.setTimeout(function () {
      if (!frame || loaded) return;
      showLoading(false);
      var c = curtain();
      c.hidden = false;
      c.dataset.mode = "direct";
      $("c-label").textContent = "Timed out";
      $("c-title").textContent = "This one is taking too long";
      $("c-body").textContent =
        "It may be blocked on this network, or the host is slow. A separate " +
        "tab usually works — the game keeps loading there.";
      $("c-action").textContent = "↗ Open in a new tab";
      $("c-alt").hidden = false;
      $("c-alt").textContent = "Keep waiting";
    }, 20000);
  }

  /* -------------------------------------------------------------- playtime */

  function flush() {
    if (!since) return;
    var seconds = (Date.now() - since) / 1000;
    since = document.hidden ? 0 : Date.now();
    window.Store.addSeconds(game.id, seconds);
    counters();
  }

  /* ------------------------------------------------------- progress backup */

  /* The game writes its own progress into its origin's localStorage as you
     play. Backing that up only when someone remembers to press a button in
     Settings is how saves get lost, so it happens here instead: once the
     session has been long enough to be worth keeping, and again on the way
     out. Silent — it is not something to interrupt play over. */
  var MIN_SESSION = 15;          // seconds before a backup is worth doing
  var backupTimer = null;
  var lastBackup = 0;

  /* A two-second glance at a game has no progress worth storing, and backing
     up then would only overwrite a good save with an empty one. */
  function playedLongEnough() {
    if (!since) return false;
    return (Date.now() - since) / 1000 >= MIN_SESSION ||
           window.Store.statFor(game.id).seconds >= MIN_SESSION;
  }

  /* The host key to sync under. Self-hosted games (served from the arcade's
     own origin, so no `host` field and a games/ or root-relative source) sync
     under the "self" host, whose bridge is the arcade root. This is what makes
     cloud saves work for the 150+ originals, not just the external hosts. */
  function effectiveHost() {
    if (!game) return null;
    if (game.host) return game.host;
    var src = String(game.source || game.direct || "");
    if (/^https?:/i.test(src)) return null;      // external but hostless: can't map
    return "self";
  }

  function canBackup() {
    return window.Store.settings().autoBackup &&
           window.GameSaves && window.Session && window.Session.user &&
           game && effectiveHost() && !game.unavailable;
  }

  function markSaved(text, tone) {
    var badge = $("save-state");
    if (!badge) return;
    badge.hidden = false;
    badge.textContent = text;
    badge.className = "save-state" + (tone ? " " + tone : "");
  }

  /* What the host's storage looked like when this game opened. Anything that
     moves between here and a backup is this game's doing, which is the only
     reliable way to tell one game's keys from the 144 others sharing the
     origin. Names and values, because a save that changes in place is just as
     much a signal as a new key. */
  var baseline = null;

  function takeBaseline() {
    if (!window.GameSaves || !game || !effectiveHost()) return;
    var origin = (window.SITE.gameHosts || {})[effectiveHost()];
    if (!origin) return;

    window.GameSaves.readAll(window.GameSaves.hostKey(origin))
      .then(function (res) { baseline = flatten(res); })
      .catch(function () { /* no bridge on that host; attribution just waits */ });
  }

  /* One flat name → value map across all three stores, so a diff does not
     have to care which one a game happens to use. */
  function flatten(res) {
    var out = {};
    Object.keys(res.data || {}).forEach(function (k) { out[k] = res.data[k]; });
    Object.keys(res.cookies || {}).forEach(function (k) {
      out["cookie:" + k] = res.cookies[k];
    });
    Object.keys(res.idb || {}).forEach(function (db) {
      out["idb:" + db] = JSON.stringify(res.idb[db]).length;   // size, not contents
    });
    return out;
  }

  function backupProgress(reason) {
    if (!canBackup()) return Promise.resolve();
    if (Date.now() - lastBackup < 10000) return Promise.resolve();
    lastBackup = Date.now();

    var origin = (window.SITE.gameHosts || {})[effectiveHost()];
    if (!origin) return Promise.resolve();

    return window.GameSaves.readAll(window.GameSaves.hostKey(origin))
      .then(function (res) {
        /* Attribute whatever moved while this game was open. */
        if (window.GameKeys && baseline) {
          var now = flatten(res);
          window.GameKeys.learnFromSnapshots(game, res.host, baseline, now);
          baseline = now;
        }

        /* Send all three stores. This used to push res.data alone, which is
           localStorage only — so every game that saves to IndexedDB or a
           cookie, which is most of the ones that save at all, was backed up
           as an empty record. */
        var payload = {
          local: res.data || {},
          idb: res.idb || {},
          cookies: res.cookies || {}
        };
        var count = Object.keys(payload.local).length +
                    Object.keys(payload.idb).length +
                    Object.keys(payload.cookies).length;
        if (!count) return null;

        return window.API.putGameSave(res.host, payload).then(function () {
          markSaved("progress saved", "ok");
          return count;
        });
      })
      .catch(function () {
        /* Offline, bridge not deployed, or storage blocked — say so quietly
           rather than pretending it worked. */
        markSaved("progress not synced", "warn");
      });
  }

  function watchProgress() {
    if (!canBackup()) return;
    markSaved("progress saves automatically", "");
    takeBaseline();
    window.clearInterval(backupTimer);
    /* Save every 45s while the game is in front, plus on tab-hide and on the
       way out (below). Frequent enough that a crash or an accidental close
       loses very little, cheap enough not to matter. */
    backupTimer = window.setInterval(function () {
      if (!document.hidden && frame) backupProgress("interval");
    }, 45000);
  }

  /* --------------------------------------------------------------- actions */

  function actions() {
    $("a-play").addEventListener("click", function () {
      if (game.embeddable && !game.preferDirect) embed();
      else newTab();
    });

    $("c-action").addEventListener("click", function () {
      var mode = curtain().dataset.mode;
      if (mode === "gone") window.Shell.playRandom();
      else if (mode === "embed") embed();
      else newTab();
    });

    $("c-alt").addEventListener("click", function () {
      curtain().dataset.mode = "embed";
      embed();
    });

    $("a-tab").addEventListener("click", function () {
      if (window.Store.settings().confirmExternal &&
          !window.confirm("Open " + game.title + " in a new tab?")) return;
      newTab();
    });

    (function () {
      var cbtn = $("a-cloak");
      if (cbtn) cbtn.addEventListener("click", function () { cloakTab(); });
    })();

    $("a-full").addEventListener("click", function () {
      if (!frame) {
        if (game.embeddable) embed();
        else { newTab(); return; }
      }
      fullscreen();
    });
    var exitFull = $("stage-exit-fullscreen");
    if (exitFull) exitFull.addEventListener("click", fullscreen);
    ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"].forEach(function (name) {
      document.addEventListener(name, syncFullscreenUI);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && stage().classList.contains("is-pseudo-fullscreen")) exitFullscreen();
    });

    $("a-pin").addEventListener("click", function () {
      var on = window.Store.toggleFavorite(game.id);
      pinButton(on);
      window.UI.toast(on ? "Pinned" : "Unpinned");
    });

    var aspect = $("a-aspect");
    aspect.addEventListener("click", function () {
      tall = !tall;
      stage().classList.toggle("tall", tall);
      aspect.textContent = tall ? "16:9" : "4:3";
    });

    $("a-share").addEventListener("click", function () {
      var url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () { window.UI.toast("Link copied"); },
          function () { window.prompt("Copy this link:", url); }
        );
      } else {
        window.prompt("Copy this link:", url);
      }
    });

    /* Single-key shortcuts are off while a game is actually running.
       An iframe only receives keys while it has focus, and focus is lost by
       clicking anywhere outside it — at which point P (a pause key in plenty
       of games) reached this handler and reloaded the game, throwing away
       whatever the player had got to. The buttons still work. */
    document.addEventListener("keydown", function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!window.Store.settings().shortcuts) return;
      if (document.body.dataset.gameActive) return;
      var t = event.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (event.key === "f" || event.key === "F") $("a-pin").click();
      else if (event.key === "p" || event.key === "P") $("a-play").click();
    });
  }

  /* ---------------------------------------------------------------- rating */

  function stars() {
    var host = $("stars");
    host.innerHTML = "";
    var current = window.Store.ratingFor(game.id);
    for (var i = 1; i <= 5; i++) {
      (function (value) {
        var b = window.UI.el("button", value <= current ? "on" : "", value <= current ? "★" : "☆");
        b.type = "button";
        b.setAttribute("aria-label", "Rate " + value + " of 5");
        b.addEventListener("click", function () {
          var next = current === value ? 0 : value;
          window.Store.setRating(game.id, next);
          window.UI.toast(next ? "Rated " + next + "/5" : "Rating cleared");
          stars();
        });
        host.appendChild(b);
      })(i);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
