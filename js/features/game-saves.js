/* Cross-device game progress.
 *
 * Games keep their progress in localStorage belonging to the origin that
 * serves them — not to this site. The same-origin policy means the hub simply
 * cannot read it, and no amount of cleverness changes that.
 *
 * The way through is a page on that origin: save-bridge.html sits at the root
 * of each game repo. The hub loads it in a hidden iframe and asks it, over
 * postMessage, to hand back a snapshot or put one back. That snapshot is what
 * syncs to the account.
 *
 * Restores merge rather than overwrite, so pulling a save onto a device that
 * has newer progress can't wipe it.
 */
(function () {
  "use strict";

  var CHANNEL = "ach-save-bridge";
  var TIMEOUT = 8000;

  var frames = {};      // host -> { iframe, ready, queue }
  var seq = 0;
  var waiting = {};     // id -> { resolve, reject, timer }

  /* GitHub Pages serves every repo from ONE origin (arcadecampushub.github.io)
     — the path (/hd_fnaf, /eaglercraft, /games-huge …) does NOT create a
     separate storage bucket. localStorage and IndexedDB are scoped to the
     ORIGIN, so all of those games physically share the same storage. Backing
     them up under path-derived keys therefore made SEVEN rows that each held a
     full copy of the same shared bucket and clobbered one another on restore —
     which is exactly why big-save games (FNAF World, every Eaglercraft build)
     "only worked locally". The correct unit is the origin: dedupe hosts to one
     representative base URL per real origin, and key the cloud row by the
     origin host alone. */
  function hostsFromConfig() {
    var out = [];
    var seen = {};
    var map = (window.SITE && window.SITE.gameHosts) || {};
    Object.keys(map).forEach(function (key) {
      var base = String(map[key] || "").replace(/\/+$/, "");
      if (!base) return;
      var origin;
      try { origin = new URL(base).origin; } catch (e) { origin = base; }
      if (seen[origin]) return;          // same origin already covered
      seen[origin] = true;
      out.push(base);                    // keep a real path for bridgeUrl()
    });
    return out;
  }

  /* The config key a catalog entry's `host` field actually uses (e.g.
     "games-huge"), as opposed to keyFor()'s storage key derived from the
     origin's URL. The admin game-data editor filters the catalog by
     `game.host === <config key>`, so it needs this — not keyFor() — or every
     host-scoped game list comes back empty. */
  function configKeyFor(origin) {
    var map = (window.SITE && window.SITE.gameHosts) || {};
    var hit = Object.keys(map).filter(function (key) {
      return String(map[key] || "").replace(/\/+$/, "") === origin;
    })[0];
    return hit || null;
  }

  /* A GitHub Pages project site lives under /<repo>/, so the bridge sits at
     the repo root, not the domain root. Deriving it from the configured game
     base keeps that correct for any host. */
  function bridgeUrl(origin) {
    return origin.replace(/\/+$/, "") + "/save-bridge.html";
  }

  /* The cloud-row key for an origin. Because storage is per-ORIGIN (see
     hostsFromConfig), this is the origin host alone — NOT the repo path.
     Every game served from the same origin therefore shares one save row,
     which matches the single storage bucket they actually share. The result
     still satisfies the server's host validator ([A-Za-z0-9._-]{1,64}). */
  function keyFor(origin) {
    var host;
    try { host = new URL(origin).host; } catch (e) { host = String(origin); }
    /* The hub's own origin changes with whichever mirror domain is open, but
       it's the same games — keep them on one row so saves follow you across. */
    if (host === location.host && SELF_KEY) return SELF_KEY;
    return host.slice(0, 64);
  }
  var SELF_KEY = window.SITE && window.SITE.domain ? "www." + window.SITE.domain : "";

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.channel !== CHANNEL) return;

    /* The reply can only be trusted if it actually came from one of the
       iframes this module opened at the origin it was opened for — otherwise
       any page that can reach this window (or a compromised/rogue frame)
       could forge a "ready" or a save-bridge reply and inject fake save data
       or resolve a pending request early. */
    var known = Object.keys(frames).some(function (origin) {
      return frames[origin].iframe.contentWindow === event.source &&
        event.origin === targetOriginOf(origin);
    });
    if (!known) return;

    if (msg.action === "ready") {
      Object.keys(frames).forEach(function (origin) {
        if (frames[origin].iframe.contentWindow === event.source) frames[origin].ready = true;
      });
      return;
    }

    var pending = waiting[msg.id];
    if (!pending || event.source !== pending.source || event.origin !== pending.origin) return;
    delete waiting[msg.id];
    window.clearTimeout(pending.timer);
    if (msg.ok) pending.resolve(msg);
    else pending.reject(new Error(msg.error || "Bridge refused"));
  });

  var loading = {};      // origin -> promise while its iframe is still loading

  /* Two callers asking at once (restore + baseline on the player page) used
     to create two iframes; the second replaced the first in `frames`, so the
     first one's replies failed the source check and timed out. */
  function frameFor(origin) {
    if (frames[origin]) return Promise.resolve(frames[origin]);
    if (loading[origin]) return loading[origin];

    var pending = new Promise(function (resolve, reject) {
      var iframe = document.createElement("iframe");
      iframe.src = bridgeUrl(origin);
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      iframe.title = "Save bridge";
      iframe.style.cssText =
        "position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;border:0;";

      var settled = false;
      iframe.addEventListener("load", function () {
        if (settled) return;
        settled = true;
        frames[origin] = { iframe: iframe, ready: true };
        resolve(frames[origin]);
      });
      iframe.addEventListener("error", function () {
        if (settled) return;
        settled = true;
        iframe.remove();
        reject(new Error("No save bridge on " + origin));
      });

      document.body.appendChild(iframe);

      window.setTimeout(function () {
        if (settled) return;
        settled = true;
        /* Without this the iframe (and its message listeners inside the
           bridge document) stayed attached forever after a timeout — a
           silent per-attempt leak on every host that lacks a bridge, since
           frameFor() is retried from scratch (frames[origin] was never set)
           on every subsequent backup/restore/probe call. */
        iframe.remove();
        reject(new Error("Save bridge on " + origin + " did not load"));
      }, TIMEOUT);
    });
    loading[origin] = pending;
    var done = function () { delete loading[origin]; };
    pending.then(done, done);
    return pending;
  }

  /* postMessage's targetOrigin must be a pure web origin (scheme://host[:port])
     — never a path. Several hosts here are path-based (jsDelivr:
     https://cdn.jsdelivr.net/gh/<user>/<repo>@main/games, and GitHub Pages
     project sites), and passing the full base URL as targetOrigin makes the
     browser SILENTLY DROP the message, so those games' saves never reached
     their bridge. Reduce any base URL to its real origin for targeting. */
  function targetOriginOf(base) {
    try { return new URL(base).origin; } catch (e) { return base; }
  }

  function ask(origin, payload) {
    return frameFor(origin).then(function (entry) {
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        waiting[id] = {
          source: entry.iframe.contentWindow,
          origin: targetOriginOf(origin),
          resolve: resolve,
          reject: reject,
          timer: window.setTimeout(function () {
            delete waiting[id];
            reject(new Error("Save bridge timed out"));
          }, TIMEOUT)
        };
        entry.iframe.contentWindow.postMessage(
          Object.assign({ channel: CHANNEL, id: id }, payload), targetOriginOf(origin)
        );
      });
    });
  }

  /* ------------------------------------------------------------- public */

  /* Sync state per account + host on this device: the cloud row's timestamp
     and a digest of this origin's storage as of the last agreed sync. With
     those two, each side can tell whether the other has moved on:
       - cloud stamp moved  -> another device uploaded since
       - local digest moved -> a game here wrote since
     which is what decides overwrite vs merge on both download and upload. */
  var SYNC_PREFIX = "ach:gs-sync:";

  function uid() { return window.Session && window.Session.user ? String(window.Session.user.id) : ""; }
  function recordKey(host) { return SYNC_PREFIX + uid() + ":" + host; }
  function syncRecord(host) {
    try { return JSON.parse(window.localStorage.getItem(recordKey(host)) || "null"); }
    catch (e) { return null; }
  }
  function setSyncRecord(host, rec) {
    try { window.localStorage.setItem(recordKey(host), JSON.stringify(rec)); } catch (e) {}
  }

  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (k) {
        return JSON.stringify(k) + ":" + stable(value[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  /* FNV-1a over the canonical JSON. Only ever compared with itself. */
  function digest(payload) {
    var text = stable(payload);
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16) + ":" + text.length;
  }

  function payloadOf(res) {
    return { local: res.data || {}, idb: res.idb || {}, cookies: res.cookies || {} };
  }

  /* Snapshots taken before IndexedDB support were a flat localStorage map. */
  function normalise(stored) {
    stored = stored || {};
    var flat = !stored.local && !stored.idb && !stored.cookies;
    return {
      local: flat ? stored : (stored.local || {}),
      idb: stored.idb || {},
      cookies: stored.cookies || {}
    };
  }

  function isEmpty(p) {
    return !Object.keys(p.local).length && !Object.keys(p.idb).length &&
           !Object.keys(p.cookies).length;
  }

  /* Other device's row plus ours on top. Several games share one origin and
     therefore one row, so a plain replace dropped every other game's keys
     that this device happened not to have. */
  function merge(cloud, mine) {
    return {
      local: Object.assign({}, cloud.local, mine.local),
      idb: Object.assign({}, cloud.idb, mine.idb),
      cookies: Object.assign({}, cloud.cookies, mine.cookies)
    };
  }

  var inflight = {};

  /* Upload one origin's storage if it changed since the last sync. `res` is
     a bridge read (readAll shape or raw). */
  function syncUp(origin, res) {
    if (!uid()) return Promise.reject(new Error("Sign in to sync game progress."));
    var host = keyFor(origin);
    if (inflight[host]) return inflight[host];

    var startUser = uid();
    var mine = payloadOf(res);
    var hash = digest(mine);
    var rec = syncRecord(host);
    var truncated = !!(res.partial || (res.idbDropped && res.idbDropped.length));

    if (rec && rec.hash === hash) return Promise.resolve({ host: host, unchanged: true });
    if (!rec && isEmpty(mine)) return Promise.resolve({ host: host, skipped: true, keys: 0 });

    var job = window.API.gameSaveStamp(host).then(function (stamp) {
      /* Nobody else wrote since we last agreed: this device is the truth,
         deletions included. Otherwise fold the other device's work in. */
      if (rec && stamp <= rec.at && !truncated) return mine;
      return window.API.getGameSave(host).then(function (cloud) {
        return merge(normalise(cloud.payload), mine);
      });
    }).then(function (payload) {
      if (uid() !== startUser) throw new Error("Account changed during backup; not uploading.");
      if (isEmpty(payload)) return { host: host, skipped: true, keys: 0 };
      return window.API.putGameSave(host, payload).then(function () {
        return window.API.gameSaveStamp(host);
      }).then(function (at) {
        setSyncRecord(host, { at: at, hash: digest(payload) === hash ? hash : null });
        return {
          host: host,
          keys: Object.keys(payload.local).length,
          databases: Object.keys(payload.idb).length,
          cookies: Object.keys(payload.cookies).length,
          uploaded: true
        };
      });
    });
    inflight[host] = job;
    var clear = function () { delete inflight[host]; };
    job.then(clear, clear);
    return job;
  }

  /* Bring the account's copy of one origin down into it.
     Cloud wins outright when it moved on and nothing here changed since the
     last sync; if both moved, only the gaps are filled and this device's
     edits go back up on the next sync. `force` overwrites regardless. */
  function restoreHost(hostOrOrigin, force) {
    if (!uid()) return Promise.reject(new Error("Sign in to restore game progress."));
    var origin = originFor(hostOrOrigin);
    if (!origin) return Promise.reject(new Error("Unknown game host."));
    var host = keyFor(origin);

    return Promise.all([
      window.API.getGameSave(host),
      ask(origin, { action: "read" })
    ]).then(function (both) {
      var cloud = both[0];
      var stored = normalise(cloud.payload);
      var mine = payloadOf(both[1]);
      if (isEmpty(stored)) return { host: host, written: 0, empty: true };

      var rec = syncRecord(host);
      var localMoved = !rec || rec.hash !== digest(mine);
      var cloudMoved = !rec || (cloud.updatedAt || 0) > rec.at;
      if (!cloudMoved && !force) return { host: host, written: 0, current: true };
      var overwrite = !!force || !localMoved || isEmpty(mine);

      return ask(origin, {
        action: "write", data: stored.local, idb: stored.idb, cookies: stored.cookies,
        overwrite: overwrite
      }).then(function (out) {
        return ask(origin, { action: "read" }).then(function (after) {
          var now = digest(payloadOf(after));
          /* Anything here the cloud doesn't have leaves the digest unset, so
             the next sync uploads it. */
          setSyncRecord(host, {
            at: cloud.updatedAt || 0,
            hash: now === digest(stored) ? now : null
          });
          return {
            host: host,
            written: (out.written || 0) + (out.idbWritten || 0) + (out.cookiesWritten || 0),
            kept: out.kept,
            overwrote: overwrite
          };
        });
      });
    });
  }

  /* Every host — the Settings buttons. */
  function backup(onProgress) {
    if (!uid()) return Promise.reject(new Error("Sign in to sync game progress."));
    var done = [];
    return hostsFromConfig().reduce(function (chain, origin) {
      return chain.then(function () {
        if (onProgress) onProgress(keyFor(origin), "reading");
        return ask(origin, { action: "read" })
          .then(function (res) {
            return syncUp(origin, res).then(function (out) {
              if (out.unchanged) out.keys = res.keys || 0;
              if (out.skipped && res.idbUnsupported) out.note = "this browser can't list IndexedDB";
              done.push(out);
            });
          })
          .catch(function (err) { done.push({ host: keyFor(origin), error: err.message }); });
      });
    }, Promise.resolve()).then(function () { return done; });
  }

  function restore(force, onProgress) {
    if (!uid()) return Promise.reject(new Error("Sign in to restore game progress."));
    var done = [];
    return hostsFromConfig().reduce(function (chain, origin) {
      return chain.then(function () {
        if (onProgress) onProgress(keyFor(origin), "restoring");
        return restoreHost(origin, force)
          .then(function (out) { done.push(out); })
          .catch(function (err) { done.push({ host: keyFor(origin), error: err.message }); });
      });
    }, Promise.resolve()).then(function () { return done; });
  }

  /* Is the bridge actually deployed on each host? */
  function probe() {
    return Promise.all(hostsFromConfig().map(function (origin) {
      return ask(origin, { action: "ping" })
        .then(function () { return { host: keyFor(origin), ok: true }; })
        .catch(function (err) { return { host: keyFor(origin), ok: false, error: err.message }; });
    }));
  }

  /* ---- direct access, for the admin game-data editor ---- */

  function originFor(hostOrOrigin) {
    if (/^https?:/i.test(hostOrOrigin)) return hostOrOrigin.replace(/\/+$/, "");
    var match = hostsFromConfig().filter(function (o) {
      return keyFor(o) === hostOrOrigin;
    })[0];
    return match || null;
  }

  function readAll(hostOrOrigin) {
    var origin = originFor(hostOrOrigin);
    if (!origin) return Promise.reject(new Error("Unknown game host."));
    return ask(origin, { action: "read" }).then(function (res) {
      return {
        host: keyFor(origin),
        data: res.data || {},
        cookies: res.cookies || {},
        idb: res.idb || {},
        /* The bridge sits at the origin root, so it only sees path=/ cookies.
           A game that sets one with no path scopes it to its own folder, out
           of reach from there — the editor says so rather than showing an
           empty list and letting it read as broken. */
        cookiePath: res.cookiePath || "/",
        idbUnsupported: !!res.idbUnsupported,
        idbDropped: res.idbDropped || [],
        partial: !!res.partial,
        skipped: res.skipped || 0
      };
    });
  }

  /* overwrite defaults true here: the editor exists precisely to change
     values that already exist. */
  function writeKeys(hostOrOrigin, data, overwrite) {
    var origin = originFor(hostOrOrigin);
    if (!origin) return Promise.reject(new Error("Unknown game host."));
    return ask(origin, {
      action: "write", data: data, overwrite: overwrite !== false
    });
  }

  /* Cookies are written on their own path, so they get their own call rather
     than a flag smuggled through the localStorage payload. */
  function writeCookies(hostOrOrigin, data) {
    var origin = originFor(hostOrOrigin);
    if (!origin) return Promise.reject(new Error("Unknown game host."));
    return ask(origin, { action: "write", data: {}, cookies: data, overwrite: true });
  }

  function removeKeys(hostOrOrigin, keys) {
    var origin = originFor(hostOrOrigin);
    if (!origin) return Promise.reject(new Error("Unknown game host."));
    return ask(origin, { action: "remove", keys: keys });
  }

  function backupHost(hostOrOrigin) {
    var origin = originFor(hostOrOrigin);
    if (!origin) return Promise.reject(new Error("Unknown game host."));
    return ask(origin, { action: "read" }).then(function (res) {
      if (res.partial) throw new Error("Save snapshot was incomplete; not uploading.");
      return syncUp(origin, res);
    });
  }

  window.GameSaves = {
    hosts: hostsFromConfig,
    hostKey: keyFor,
    configKey: configKeyFor,
    backup: backup,
    backupHost: backupHost,
    syncUp: syncUp,
    /* After the cloud row is deleted, so the next sync uploads again. */
    forget: function (host) {
      try { window.localStorage.removeItem(recordKey(host)); } catch (e) {}
    },
    restore: restore,
    restoreHost: restoreHost,
    probe: probe,
    readAll: readAll,
    writeKeys: writeKeys,
    writeCookies: writeCookies,
    removeKeys: removeKeys
  };
})();
