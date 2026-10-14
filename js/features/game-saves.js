/* Cross-device game progress. */
(function () {
  "use strict";

  var CHANNEL = "ach-save-bridge";
  var TIMEOUT = 8000;

  var frames = {};      // host -> { iframe, ready, queue }
  var seq = 0;
  var waiting = {};     // id -> { resolve, reject, timer }

  /* GitHub Pages serves every repo from ONE origin (arcadecampushub.github.io) — the path (/hd_fnaf… */
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

  /* The config key a catalog entry's `host` field actually uses (e.g. "games-huge"), as opposed to keyFor()'s… */
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

  /* The cloud-row key for an origin. */
  function keyFor(origin) {
    var host;
    try { host = new URL(origin).host; } catch (e) { host = String(origin); }
    /* The hub's own origin changes with whichever mirror domain is open, but
       it's the same games — keep them on one row so saves follow you across. */
    if (host === location.host && SELF_KEY) return SELF_KEY;
    /* play.<domain> serves the same github.io games, so it shares their row. */
    var px = window.SITE && window.SITE.gameProxy;
    if (px && host === hostOf(px.to)) return hostOf(px.from);
    return host.slice(0, 64);
  }
  function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return String(url); }
  }

  /* The sync record belongs to the storage it describes, so two origins that
     share a cloud row (github.io and play.<domain>) each keep their own. */
  function recordIdFor(origin) {
    var key = keyFor(origin);
    var host = hostOf(origin);
    return host === key || key === SELF_KEY ? key : key + "@" + host;
  }
  var SELF_KEY = window.SITE && window.SITE.domain ? "www." + window.SITE.domain : "";

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.channel !== CHANNEL) return;

    /* The reply can only be trusted if it actually came from one of the iframes this module opened at the origin it… */
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
        /* Without this the iframe (and its message listeners inside the bridge document) stayed attached forever after… */
        iframe.remove();
        reject(new Error("Save bridge on " + origin + " did not load"));
      }, TIMEOUT);
    });
    loading[origin] = pending;
    var done = function () { delete loading[origin]; };
    pending.then(done, done);
    return pending;
  }

  /* postMessage's targetOrigin must be a pure web origin (scheme://host[:port]) — never a path. */
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
            reject(new Error("this window is blocking game storage (private window or third-party cookies off). Use a normal window to keep progress"));
          }, TIMEOUT)
        };
        entry.iframe.contentWindow.postMessage(
          Object.assign({ channel: CHANNEL, id: id }, payload), targetOriginOf(origin)
        );
      });
    });
  }

  /* ------------------------------------------------------------- public */

  /* Per account + host, this device remembers what the cloud row looked like at the last sync: its timestamp, a… */
  var SYNC_PREFIX = "ach:gs-sync:";

  function uid() { return window.Session && window.Session.user ? String(window.Session.user.id) : ""; }
  var VERIFY_EVERY = 5 * 60 * 1000;
  var verifiedAt = {};

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
    var recId = recordIdFor(origin);

    return once(recId, function () {
      return window.API.getGameSave(host).then(function (cloud) {
        var stored = normalise(cloud.payload);
        if (isEmpty(stored)) return { host: host, written: 0, empty: true };
        var rec = syncRecord(recId);
        return reconcile(origin, stored, rec, force).then(function (r) {
          var cloudE = entries(stored);
          var local = payloadOf(r.after);
          var same = digest(entries(local)) === digest(cloudE);
          setSyncRecord(recId, {
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
    var recId = recordIdFor(origin);
    var startUser = uid();
    var rec = syncRecord(recId);
    if (rec && rec.hash && rec.hash === digest(payloadOf(res))) {
      /* "Same as last upload" is a local belief. Confirm now and then that the
         cloud still holds that upload; if the row is gone or older, send it. */
      var checked = verifiedAt[recId] || 0;
      if (Date.now() - checked < VERIFY_EVERY) {
        return Promise.resolve({ host: host, unchanged: true });
      }
      return window.API.gameSaveStamp(host).then(function (stamp) {
        if (stamp && stamp >= (rec.at || 0)) {
          verifiedAt[recId] = Date.now();
          return { host: host, unchanged: true };
        }
        setSyncRecord(recId, { at: 0, hash: null, keys: rec.keys || {} });
        return syncUp(origin, res);
      });
    }

    return once(recId, function () {
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
            verifiedAt[recId] = Date.now();
            setSyncRecord(recId, {
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
        /* The bridge sits at the origin root, so it only sees path=/ cookies. */
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
    /* Who the snapshot belongs to is decided before it's read: switching
       accounts mid-read must not upload one person's saves into another's. */
    var startUser = uid();
    return ask(origin, { action: "read" }).then(function (res) {
      if (res.partial) throw new Error("Save snapshot was incomplete; not uploading.");
      if (uid() !== startUser) throw new Error("Account changed during backup; not uploading.");
      return syncUp(origin, res);
    });
  }

  /* Carry this device's storage from one origin into another, filling only
     what's missing there. Used once when games move to a new address.
     Resolves true when the old copy could be read (so it needn't be again). */
  function copyOrigin(from, to) {
    from = from.replace(/\/+$/, "");
    to = to.replace(/\/+$/, "");
    return ask(from, { action: "read" }).then(function (res) {
      var p = payloadOf(res);
      if (isEmpty(p)) return { read: true, written: 0 };
      return reconcile(to, p, null, false).then(function (r) {
        return { read: true, written: r.written };
      });
    });
  }

  /* ------------------------------------------------------ one game
   *
   * The origin rows above back up a whole host. On play.<domain> that is
   * every proxied game at once, sharing one 4 MB row: a big Unity /idbfs or
   * a Minecraft world crowds the rest out, and those databases silently keep
   * an old cloud copy. A one-game row ("game.<id>") holds just this game's
   * keys and rows, compressed, so the Save button always has room.
   *
   * Nothing here deletes or empties a cloud row. A save that would replace
   * another device's newer upload first copies that upload to "<row>.prev".
   */

  var GAME_SYNC = "ach:gs-game:";

  function gameRowKey(game) {
    var id = String(game && game.id || "").replace(/[^A-Za-z0-9._-]/g, "-");
    if (!id) return "";
    var key = "game." + id;
    if (key.length > 59) key = key.slice(0, 50) + "." + digest(id).split(":")[0].slice(0, 8);
    return key;
  }

  function gameRec(rowKey, origin) {
    try { return JSON.parse(window.localStorage.getItem(GAME_SYNC + uid() + ":" + rowKey + "@" + hostOf(origin)) || "null"); }
    catch (e) { return null; }
  }
  function setGameRec(rowKey, origin, rec) {
    try { window.localStorage.setItem(GAME_SYNC + uid() + ":" + rowKey + "@" + hostOf(origin), JSON.stringify(rec)); } catch (e) {}
  }

  /* Unity caches downloaded assets in IndexedDB; that is not a save. */
  var NOT_SAVES = /cache|^EmulatorJS-(core|roms|bios)$/i;

  /* Which of an origin's keys, cookies and databases are this game's. */
  function gameScope(game, index, info, extra) {
    info = info || {};
    var local = index.local || {};
    var have = {};
    Object.keys(local).forEach(function (k) { have[k] = true; });
    (index.cookies || []).forEach(function (c) { have["cookie:" + c] = true; });
    (index.idb || []).forEach(function (d) { have["idb:" + d] = true; });
    var mine = window.GameKeys ? window.GameKeys.forGame(game, have) : { watched: [], guessed: [] };
    var names = mine.watched.concat(mine.guessed);
    /* Plus whatever this game's cloud save already holds: once a key is
       part of its save, it stays part of it on every device. */
    (extra || []).forEach(function (id) {
      var t = id.charAt(0), rest = id.slice(2);
      if (t === "l") names.push(rest);
      else if (t === "c") names.push("cookie:" + rest);
      else if (t === "r") {
        try { var db = JSON.parse(rest)[0]; if (db !== "/idbfs") names.push("idb:" + db); } catch (e) {}
      }
    });

    var scope = { local: [], cookies: [], idb: {} };
    names.forEach(function (n) {
      if (n.indexOf("cookie:") === 0) scope.cookies.push(n.slice(7));
      else if (n.indexOf("idb:") === 0) {
        var db = n.slice(4);
        if (db !== "/idbfs" && !NOT_SAVES.test(db)) scope.idb[db] = true;
      } else if (Object.prototype.hasOwnProperty.call(local, n) && scope.local.indexOf(n) === -1) scope.local.push(n);
    });
    scope.cookies = scope.cookies.filter(function (c, i, all) { return all.indexOf(c) === i; });
    /* Unity games share one /idbfs per origin; take only this game's folder. */
    var dirs = (info.unity || []).filter(function (d) { return /^\/idbfs\/[0-9a-f]{32}$/.test(d); });
    if (dirs.length && (!index.idb || index.idb.indexOf("/idbfs") !== -1)) {
      scope.idb["/idbfs"] = { prefixes: dirs };
    }
    scope.unity = dirs;
    return scope;
  }

  function scopeEmpty(scope) {
    return !scope.local.length && !scope.cookies.length && !Object.keys(scope.idb).length;
  }

  /* Old bridges ignore `scope` and send the whole origin; trim it here. */
  function applyScope(res, scope) {
    if (res.scoped) return res;
    var out = { data: {}, cookies: {}, idb: {}, idbDropped: [] };
    scope.local.forEach(function (k) { if (res.data && k in res.data) out.data[k] = res.data[k]; });
    scope.cookies.forEach(function (k) { if (res.cookies && k in res.cookies) out.cookies[k] = res.cookies[k]; });
    Object.keys(scope.idb).forEach(function (db) {
      if ((res.idbDropped || []).indexOf(db) !== -1) out.idbDropped.push(db);
      var dump = res.idb && res.idb[db];
      if (!dump) return;
      var pick = scope.idb[db];
      if (pick === true) { out.idb[db] = dump; return; }
      var kept = {};
      Object.keys(dump).forEach(function (store) {
        var rows = dump[store].filter(function (row) {
          return typeof row.k === "string" && pick.prefixes.some(function (p) { return row.k.indexOf(p) === 0; });
        });
        if (rows.length) kept[store] = rows;
      });
      if (Object.keys(kept).length) out.idb[db] = kept;
    });
    return out;
  }

  /* Row-level entries so two saves of a shared database compare row by row. */
  function gameEntries(p) {
    var out = {};
    Object.keys(p.local || {}).forEach(function (k) { out["l:" + k] = p.local[k]; });
    Object.keys(p.cookies || {}).forEach(function (k) { out["c:" + k] = p.cookies[k]; });
    Object.keys(p.idb || {}).forEach(function (db) {
      Object.keys(p.idb[db] || {}).forEach(function (store) {
        (p.idb[db][store] || []).forEach(function (row) {
          out["r:" + JSON.stringify([db, store, row.k])] = row.v;
        });
      });
    });
    return out;
  }
  function gameUnentries(map) {
    var out = { local: {}, cookies: {}, idb: {} };
    Object.keys(map).forEach(function (k) {
      var t = k.charAt(0), rest = k.slice(2);
      if (t === "l") out.local[rest] = map[k];
      else if (t === "c") out.cookies[rest] = map[k];
      else if (t === "r") {
        var at = JSON.parse(rest);
        var db = out.idb[at[0]] = out.idb[at[0]] || {};
        (db[at[1]] = db[at[1]] || []).push({ k: at[2], v: map[k] });
      }
    });
    return out;
  }

  /* A save made on another mirror has that play host's Unity folder hash;
     move its rows to this host's folder. */
  function remapUnity(p, fromDirs, toDirs) {
    if (!fromDirs || !toDirs || fromDirs.length !== 1 || toDirs.length !== 1 || fromDirs[0] === toDirs[0]) return p;
    var from = fromDirs[0], to = toDirs[0];
    var fs = p.idb && p.idb["/idbfs"];
    if (!fs) return p;
    Object.keys(fs).forEach(function (store) {
      fs[store].forEach(function (row) {
        if (typeof row.k === "string" && row.k.indexOf(from) === 0) row.k = to + row.k.slice(from.length);
      });
    });
    return p;
  }

  /* gzip + base64 where the browser can; plain JSON otherwise. */
  function pack(obj) {
    var text = JSON.stringify(obj);
    if (typeof CompressionStream !== "function") return Promise.resolve({ j: obj, bytes: text.length });
    var stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Response(stream).arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), bin = "";
      for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { z: btoa(bin), bytes: text.length };
    });
  }
  function unpack(row) {
    if (!row) return Promise.resolve(null);
    if (row.j) return Promise.resolve(row.j);
    if (typeof row.z !== "string") return Promise.resolve(null);
    if (typeof DecompressionStream !== "function") return Promise.reject(new Error("This browser can't open compressed saves."));
    var bin = atob(row.z), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text().then(function (t) { return JSON.parse(t); });
  }

  /* One game's row: 16 MB on the server (supabase/2026-10-14-game-save-size.sql).
     Kept a little under so JSON overhead never trips the server's check. */
  var MAX_ROW = 16 * 1024 * 1024 - 256 * 1024;

  function indexOf(origin) {
    return ask(origin, { action: "index" }).then(function (res) {
      if (res.local) return res;
      throw new Error("old bridge");
    }).catch(function (err) {
      if (err && /blocking game storage/.test(err.message)) throw err;
      /* Bridge from before "index": names come from a full read. */
      return ask(origin, { action: "read" }).then(function (res) {
        var local = {};
        Object.keys(res.data || {}).forEach(function (k) { local[k] = String(res.data[k]).length; });
        return {
          local: local, cookies: Object.keys(res.cookies || {}),
          idb: Object.keys(res.idb || {}).concat(res.idbDropped || []), full: res
        };
      });
    });
  }

  function readScoped(origin, scope, index) {
    var wire = { local: scope.local, cookies: scope.cookies, idb: scope.idb };
    var read = index.full ? Promise.resolve(index.full) : ask(origin, { action: "read", scope: wire });
    return read.then(function (res) {
      var r = applyScope(res, scope);
      return { local: r.data || {}, cookies: r.cookies || {}, idb: r.idb || {}, dropped: r.idbDropped || [] };
    });
  }

  /* Save this one game now. `info` comes from GameCheats.flush (Unity
     folders); `opts.auto` skips the upload when another device saved since
     this one last synced, rather than replacing that save. */
  function saveGame(game, hostOrOrigin, info, opts) {
    opts = opts || {};
    if (!uid()) return Promise.reject(new Error("Sign in to save games to your account."));
    var origin = originFor(hostOrOrigin);
    var rowKey = gameRowKey(game);
    if (!origin || !rowKey) return Promise.reject(new Error("This game can't be cloud-saved."));
    var startUser = uid();

    var known = gameRec(rowKey, origin);
    if (opts.auto && !known) return Promise.resolve({ skipped: true });
    var extra = Object.keys((known && known.keys) || {}).concat((info && info.extraKeys) || []);
    return indexOf(origin).then(function (index) {
      var scope = gameScope(game, index, info, extra);
      if (scopeEmpty(scope)) return { empty: true };
      return readScoped(origin, scope, index).then(function (p) {
        if (p.dropped.length) throw new Error("this game's save is too big to read in one go");
        var entries = gameEntries(p);
        if (!Object.keys(entries).length) return { empty: true };
        var hash = digest(entries);
        var rec = gameRec(rowKey, origin);
        /* Automatic saves only keep up a game someone has saved by hand (or
           loaded such a save of); everything else stays in the host backup. */
        if (opts.auto && !rec) return { skipped: true };
        if (opts.auto && rec.hash === hash) return { unchanged: true };
        if (opts.toPrev) {
          /* A backup of this device's copy before a cloud save replaces it. */
          return pack({ local: p.local, cookies: p.cookies, idb: p.idb, unity: scope.unity,
            unityPages: (info && info.unityPages) || [] }).then(function (packed) {
            var row = { v: 2, game: String(game.id), title: String(game.title || ""), savedAt: Date.now(),
              keys: Object.keys(entries).length, bytes: packed.bytes, from: "device" };
            if (packed.z) row.z = packed.z; else row.j = packed.j;
            if (JSON.stringify(row).length > MAX_ROW) return { tooBig: true };
            return window.API.putGameSave(rowKey + ".prev", row).then(function () { return { uploaded: true, prev: true }; });
          });
        }

        return window.API.gameSaveStamp(rowKey).then(function (stamp) {
          var theirs = stamp && (!rec || stamp > (rec.at || 0));
          if (theirs && opts.auto) return { newerElsewhere: true };
          var keepOld = theirs ? window.API.getGameSave(rowKey).then(function (old) {
            if (!old || !old.payload || (!old.payload.z && !old.payload.j)) return;
            return window.API.putGameSave(rowKey + ".prev", old.payload);
          }) : Promise.resolve();
          return keepOld.then(function () {
            return pack({ local: p.local, cookies: p.cookies, idb: p.idb, unity: scope.unity,
              unityPages: (info && info.unityPages) || [] });
          }).then(function (packed) {
            var row = {
              v: 2, game: String(game.id), title: String(game.title || ""), savedAt: Date.now(),
              keys: Object.keys(entries).length, bytes: packed.bytes
            };
            if (packed.z) row.z = packed.z; else row.j = packed.j;
            if (JSON.stringify(row).length > MAX_ROW) throw new Error("this game's save is too large for a cloud save");
            if (uid() !== startUser) throw new Error("Account changed during save; not uploading.");
            return window.API.putGameSave(rowKey, row).then(function () {
              return window.API.gameSaveStamp(rowKey);
            }).then(function (at) {
              setGameRec(rowKey, origin, { at: at, hash: hash, keys: hashes(entries) });
              return { uploaded: true, keys: row.keys, bytes: row.bytes, at: at };
            });
          });
        });
      });
    });
  }

  /* Bring a game's own cloud save down, before the game starts. Entries
     untouched here since the last sync take the cloud's copy; if this
     device changed any of them too, nothing is written and the caller gets
     `conflict` to ask the player. `force` takes the cloud copy outright. */
  function loadGame(game, hostOrOrigin, info, force) {
    if (!uid()) return Promise.resolve({ none: true });
    var origin = originFor(hostOrOrigin);
    var rowKey = gameRowKey(game);
    if (!origin || !rowKey) return Promise.resolve({ none: true });

    return window.API.getGameSave(rowKey).then(function (cloud) {
      if (!cloud || !cloud.payload || (!cloud.payload.z && !cloud.payload.j)) return { none: true };
      var rec = gameRec(rowKey, origin);
      if (!force && rec && rec.at && cloud.updatedAt <= rec.at) return { current: true };
      return unpack(cloud.payload).then(function (saved) {
        if (!saved) return { none: true };
        /* The game hasn't started yet, so this host's Unity folder comes from
           the page the save was made on, moved onto this origin. */
        var here = null;
        var dirOf = window.GameCheats && window.GameCheats.unityDirOf;
        if (dirOf && saved.unityPages && saved.unityPages.length === 1) {
          try {
            var page = new URL(saved.unityPages[0]);
            here = [dirOf(new URL(origin).origin + page.pathname)];
          } catch (e) { here = null; }
        }
        remapUnity(saved, saved.unity, here);
        var cloudE = gameEntries(saved);
        var scope = { local: Object.keys(saved.local || {}), cookies: Object.keys(saved.cookies || {}), idb: {} };
        Object.keys(saved.idb || {}).forEach(function (db) {
          if (db === "/idbfs") {
            var dirs = here || saved.unity || [];
            if (dirs.length) scope.idb[db] = { prefixes: dirs };
          } else scope.idb[db] = true;
        });
        return ask(origin, { action: "read", scope: scope }).then(function (res) {
          var r = applyScope(res, scope);
          var mineE = gameEntries({ local: r.data, cookies: r.cookies, idb: r.idb });
          var base = rec && rec.keys;
          var plan = {}, conflicts = 0;
          Object.keys(cloudE).forEach(function (k) {
            var ch = digest(cloudE[k]);
            var mh = mineE[k] === undefined ? undefined : digest(mineE[k]);
            if (mh === ch) return;
            if (force || mh === undefined || (base && base[k] === mh)) { plan[k] = cloudE[k]; return; }
            conflicts++;
          });
          var finish = function (written) {
            setGameRec(rowKey, origin, { at: cloud.updatedAt, hash: written === null ? null : digest(cloudE), keys: hashes(cloudE) });
          };
          if (conflicts && !force) {
            return { conflict: true, savedAt: saved.savedAt || cloud.updatedAt, cloudAt: cloud.updatedAt, title: saved.title || "",
              info: { unity: here || saved.unity || [], unityPages: saved.unityPages || [], extraKeys: Object.keys(cloudE) } };
          }
          var n = Object.keys(plan).length;
          if (!n) { finish(0); return { written: 0, current: true }; }
          var todo = gameUnentries(plan);
          return ask(origin, {
            action: "write", data: todo.local, cookies: todo.cookies, idb: todo.idb, overwrite: true
          }).then(function () {
            finish(n);
            return { written: n, savedAt: saved.savedAt || cloud.updatedAt };
          });
        });
      });
    });
  }

  /* The player chose this device's progress over a different cloud save.
     That cloud save is kept as "<row>.prev" and the next save replaces it. */
  function keepLocal(game, hostOrOrigin, cloudAt, ids) {
    var origin = originFor(hostOrOrigin);
    var rowKey = gameRowKey(game);
    if (!uid() || !origin || !rowKey) return Promise.resolve();
    return window.API.getGameSave(rowKey).then(function (old) {
      if (!old || !old.payload || (!old.payload.z && !old.payload.j)) return;
      return window.API.putGameSave(rowKey + ".prev", old.payload);
    }).then(function () {
      /* Remember which keys make up this game's save (with no hash, so none
         counts as "unchanged here"), so the next save includes them. */
      var keys = {};
      (ids || []).forEach(function (id) { keys[id] = ""; });
      setGameRec(rowKey, origin, { at: cloudAt || Date.now(), hash: null, keys: keys });
    });
  }

  window.GameSaves = {
    gameRowKey: gameRowKey,
    keepLocal: keepLocal,
    saveGame: saveGame,
    loadGame: loadGame,
    hosts: hostsFromConfig,
    hostKey: keyFor,
    configKey: configKeyFor,
    backup: backup,
    backupHost: backupHost,
    syncUp: syncUp,
    /* After the cloud row is deleted, so the next sync uploads again. */
    forget: function (host) {
      try {
        var base = recordKey(host);
        for (var i = window.localStorage.length - 1; i >= 0; i--) {
          var k = window.localStorage.key(i);
          if (k === base || (k && k.indexOf(base + "@") === 0)) window.localStorage.removeItem(k);
        }
      } catch (e) {}
    },
    restore: restore,
    restoreHost: restoreHost,
    probe: probe,
    readAll: readAll,
    writeKeys: writeKeys,
    writeCookies: writeCookies,
    removeKeys: removeKeys,
    copyOrigin: copyOrigin
  };
})();
