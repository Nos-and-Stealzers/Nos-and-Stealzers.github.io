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

  /* Per account + host, this device remembers what the cloud row looked like
     at the last sync: its timestamp, a digest of each entry, and a digest of
     local storage at that moment. That's enough for a per-key three-way merge:
       - entry unchanged here since the sync -> take the cloud's version
       - entry changed here                  -> keep it, it goes up next
     so two devices playing different games on one shared origin never
     overwrite each other, and a newer save from another device replaces an
     older one here. */
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
  function digest(value) {
    var text = stable(value);
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

  /* One flat map across the three stores: "l:key", "i:db", "c:cookie". */
  var STORES = { l: "local", i: "idb", c: "cookies" };
  function entries(p) {
    var out = {};
    Object.keys(STORES).forEach(function (tag) {
      var src = p[STORES[tag]] || {};
      Object.keys(src).forEach(function (k) { out[tag + ":" + k] = src[k]; });
    });
    return out;
  }
  function toPayload(map) {
    var out = { local: {}, idb: {}, cookies: {} };
    Object.keys(map).forEach(function (k) { out[STORES[k.charAt(0)]][k.slice(2)] = map[k]; });
    return out;
  }
  function hashes(map) {
    var out = {};
    Object.keys(map).forEach(function (k) { out[k] = digest(map[k]); });
    return out;
  }

  /* Pull the cloud's newer entries into this origin, keeping anything changed
     here since the last sync. `force` takes the cloud's copy for everything. */
  function reconcile(origin, cloudPayload, rec, force) {
    var cloudE = entries(cloudPayload);
    var base = rec && rec.keys ? rec.keys : null;

    return ask(origin, { action: "read" }).then(function (res) {
      var mineE = entries(payloadOf(res));
      var mineH = hashes(mineE);
      var plan = {}, removes = [], kept = 0;

      Object.keys(cloudE).forEach(function (k) {
        var ch = digest(cloudE[k]);
        if (mineH[k] === ch) return;
        if (force) { plan[k] = cloudE[k]; return; }
        if (mineH[k] === undefined) {
          /* Absent here: new from elsewhere, unless it was deleted here. */
          if (base && base[k] === ch) return;
          plan[k] = cloudE[k];
          return;
        }
        if (base && mineH[k] === base[k]) { plan[k] = cloudE[k]; return; }
        kept++;
      });

      /* Deleted elsewhere and untouched here — localStorage only; the bridge
         has no per-row delete for the other stores. */
      if (base && !force) {
        Object.keys(base).forEach(function (k) {
          if (k.charAt(0) === "l" && cloudE[k] === undefined && mineH[k] === base[k]) {
            removes.push(k.slice(2));
          }
        });
      }

      if (!Object.keys(plan).length && !removes.length) {
        return { written: 0, kept: kept, overwrote: false, after: res };
      }

      /* A game may have written while the cloud copy was downloading. Look
         again and leave alone anything that moved. */
      return ask(origin, { action: "read" }).then(function (again) {
        var nowH = hashes(entries(payloadOf(again)));
        Object.keys(plan).forEach(function (k) {
          if (nowH[k] !== mineH[k]) { delete plan[k]; kept++; }
        });
        removes = removes.filter(function (key) {
          return nowH["l:" + key] === mineH["l:" + key];
        });

        var todo = toPayload(plan);
        var n = Object.keys(plan).length;
        var write = n ? ask(origin, {
          action: "write", data: todo.local, idb: todo.idb, cookies: todo.cookies,
          overwrite: true
        }) : Promise.resolve({});
        return write.then(function () {
          return removes.length ? ask(origin, { action: "remove", keys: removes }) : null;
        }).then(function () {
          return ask(origin, { action: "read" });
        }).then(function (after) {
          return { written: n + removes.length, kept: kept, overwrote: n > 0, after: after };
        });
      });
    });
  }

  var inflight = {};
  function once(host, fn) {
    if (inflight[host]) return inflight[host];
    var job = fn();
    inflight[host] = job;
    var clear = function () { delete inflight[host]; };
    job.then(clear, clear);
    return job;
  }

  /* Bring the account's copy of one origin down into it. */
  function restoreHost(hostOrOrigin, force) {
    if (!uid()) return Promise.reject(new Error("Sign in to restore game progress."));
    var origin = originFor(hostOrOrigin);
    if (!origin) return Promise.reject(new Error("Unknown game host."));
    var host = keyFor(origin);

    return once(host, function () {
      return window.API.getGameSave(host).then(function (cloud) {
        var stored = normalise(cloud.payload);
        if (isEmpty(stored)) return { host: host, written: 0, empty: true };
        var rec = syncRecord(host);
        return reconcile(origin, stored, rec, force).then(function (r) {
          var cloudE = entries(stored);
          var local = payloadOf(r.after);
          var same = digest(entries(local)) === digest(cloudE);
          setSyncRecord(host, {
            at: cloud.updatedAt || 0,
            /* Only "in sync" if this device holds exactly the cloud copy;
               otherwise what's here still needs to go up. */
            hash: same ? digest(local) : null,
            keys: hashes(cloudE)
          });
          return {
            host: host, written: r.written, kept: r.kept, overwrote: r.overwrote,
            current: !r.written
          };
        });
      });
    });
  }

  /* Upload one origin's storage if it changed since the last sync, pulling
     in anything newer from other devices first. `res` is a bridge read. */
  function syncUp(origin, res) {
    if (!uid()) return Promise.reject(new Error("Sign in to sync game progress."));
    var host = keyFor(origin);
    var startUser = uid();
    var rec = syncRecord(host);
    if (rec && rec.hash && rec.hash === digest(payloadOf(res))) {
      return Promise.resolve({ host: host, unchanged: true });
    }

    return once(host, function () {
      var cloudCopy = null;
      return window.API.gameSaveStamp(host).then(function (stamp) {
        if (!stamp || (rec && stamp <= rec.at)) return res;
        return window.API.getGameSave(host).then(function (cloud) {
          cloudCopy = normalise(cloud.payload);
          return reconcile(origin, cloudCopy, rec, false).then(function (r) { return r.after; });
        });
      }).then(function (latest) {
        var payload = payloadOf(latest);
        var dropped = latest.idbDropped || [];
        /* Databases that didn't fit this read keep the cloud's copy rather
           than being deleted from the account. */
        var fill = !dropped.length ? Promise.resolve() :
          (cloudCopy ? Promise.resolve(cloudCopy) :
            window.API.getGameSave(host).then(function (c) { return normalise(c.payload); }))
            .then(function (c) {
              dropped.forEach(function (db) { if (c && c.idb[db]) payload.idb[db] = c.idb[db]; });
            });
        return fill.then(function () {
          if (uid() !== startUser) throw new Error("Account changed during backup; not uploading.");
          if (isEmpty(payload)) return { host: host, skipped: true, keys: 0 };
          return window.API.putGameSave(host, payload).then(function () {
            return window.API.gameSaveStamp(host);
          }).then(function (at) {
            setSyncRecord(host, {
              at: at,
              hash: dropped.length ? null : digest(payloadOf(latest)),
              keys: hashes(entries(payload))
            });
            return {
              host: host,
              keys: Object.keys(payload.local).length,
              databases: Object.keys(payload.idb).length,
              cookies: Object.keys(payload.cookies).length,
              uploaded: true
            };
          });
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
