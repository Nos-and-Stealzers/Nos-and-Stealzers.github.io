/* Who's signed in, and keeping their local save in step with the server.
   Signed out, the site behaves exactly as it always has — localStorage only. */
(function () {
  "use strict";

  /* Mirrors the server's ordering in db.js. The server is still the authority
     — this only decides what the interface bothers to show. */
  var RANK = { user: 0, mod: 1, admin: 2, owner: 3 };

  var user = null;
  var backend = false;
  var badges = { messages: 0, requests: 0, notifications: 0 };
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });
  var pushTimer = null;

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  var epoch = 0;
  var revision = 0;
  var slots = Object.create(null);
  var OWNER = "ach:save-owner";
  var owner = "guest";
  try { owner = window.localStorage.getItem(OWNER) || "guest"; } catch (e) {}

  function identity(next) { return next ? "user:" + String(next.id) : "guest"; }
  function ownsLocal() {
    try { return (window.localStorage.getItem(OWNER) || "guest") === owner; }
    catch (e) { return true; }
  }
  function persistLocal() {
    if (!ownsLocal()) return;
    var snapshot = window.Store.exportAll();
    slots[owner] = snapshot;
    try { window.localStorage.setItem("ach:save-slot:" + owner, JSON.stringify(snapshot)); }
    catch (e) { emit("session:sync-error", { error: "Local backup storage is unavailable." }); }
  }
  function setUser(next) {
    var nextOwner = identity(next);
    if (nextOwner !== owner) {
      persistLocal();
      window.clearTimeout(pushTimer);
      pushTimer = null;
      epoch++;
      revision++;
      owner = nextOwner;
      var saved = slots[owner];
      try { saved = JSON.parse(window.localStorage.getItem("ach:save-slot:" + owner)) || saved; }
      catch (e) {}
      window.Store.importAll(saved || { version: 2, favorites: [], recents: [], stats: {}, ratings: {}, pins: {} }, { silent: true });
      try { window.localStorage.setItem(OWNER, owner); } catch (e) {}
    }
    user = next || null;
    emit("session:change", { user: user });
    return user;
  }

  /* ------------------------------------------------------------ save sync */

  /* Push the local save up and adopt whatever the server merges back, so a
     second device never wipes what the first one built up. */
  var activePush = null;
  function pushSave() {
    if (!user || !ownsLocal()) return Promise.resolve(null);
    if (activePush && activePush.epoch === epoch) return activePush.promise;
    window.clearTimeout(pushTimer);
    pushTimer = null;
    var started = epoch, changed = revision;
    persistLocal();
    var operation = { epoch: started };
    activePush = operation;
    operation.promise = Promise.resolve().then(function () {
      if (started !== epoch || !ownsLocal()) return null;
      return window.API.putSave(window.Store.exportAll());
    })
      .then(function (res) {
        if (!res || started !== epoch || !ownsLocal()) return null;
        if (changed !== revision) { schedulePush(); return null; }
        window.Store.importAll(res.save, { silent: true });
        persistLocal();
        emit("session:synced", { at: res.updatedAt });
        return res.save;
      })
      .catch(function (err) {
        if (started === epoch) emit("session:sync-error", { error: err.message || "Sync failed; local copy retained." });
        return null;
      }).then(function (result) {
        if (activePush === operation) activePush = null;
        return result;
      });
    return operation.promise;
  }

  /* Coalesce bursts of local changes into one upload. */
  function schedulePush() {
    if (!user) return;
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(pushSave, 2500);
  }

  /* ------------------------------------------------------ display prefs */

  /* Skin, text size, motion etc. live in this origin's localStorage, so a
     mirror domain or another device never saw them. They go up to the
     account too; newest edit wins. */
  var PREFS_AT = "ach:prefs-at";
  var prefsTimer = null;

  /* Settings chosen before this sync existed have no timestamp; give them a
     token one so they beat an untouched default elsewhere, but lose to any
     real edit made since. */
  function prefsAt() {
    var at = 0;
    try { at = Number(window.localStorage.getItem(PREFS_AT)) || 0; } catch (e) {}
    if (!at && Object.keys(window.Store.rawSettings()).some(function (k) { return k !== "_pruned"; })) at = 2;
    return at;
  }
  function setPrefsAt(at) {
    try { window.localStorage.setItem(PREFS_AT, String(at)); } catch (e) {}
  }

  function packPins(pins) {
    var out = {};
    Object.keys(pins).forEach(function (id) { out[id] = pins[id].on ? pins[id].at : -pins[id].at; });
    return out;
  }
  function unpackPins(packed) {
    var out = {};
    Object.keys(packed || {}).forEach(function (id) {
      var n = Number(packed[id]);
      if (n) out[id] = { on: n > 0, at: Math.abs(n) };
    });
    return out;
  }

  function applyPrefs() {
    var s = window.Store.settings();
    var root = document.documentElement;
    root.setAttribute("data-skin", s.skin);
    root.setAttribute("data-lite", s.lite ? "on" : "off");
    root.setAttribute("data-motion", s.motion ? "on" : "off");
    root.setAttribute("data-text", s.textSize);
    emit("session:prefs", { settings: s });
  }

  function pushPrefs() {
    window.clearTimeout(prefsTimer);
    prefsTimer = null;
    if (!user || !window.API.putPrefs || !ownsLocal()) return Promise.resolve();
    var at = prefsAt() || 1;
    return window.API.putPrefs({
      at: at, settings: window.Store.rawSettings(), pins: packPins(window.Store.pins())
    })
      .catch(function () { /* next change retries */ });
  }

  function pullPrefs() {
    if (!user || !window.API.getPrefs) return Promise.resolve();
    var started = epoch;
    return window.API.getPrefs().then(function (remote) {
      if (started !== epoch || !ownsLocal()) return;
      var local = prefsAt();
      var remotePins = unpackPins(remote && remote.pins);
      var mine = window.Store.pins();
      var ahead = Object.keys(mine).some(function (id) {
        return !remotePins[id] || remotePins[id].at < mine[id].at;
      });
      window.Store.mergePins(remotePins);
      if (remote && remote.settings && (remote.at || 0) > local) {
        window.Store.replaceSettings(remote.settings, true);
        setPrefsAt(remote.at);
        applyPrefs();
        if (ahead) return pushPrefs();
      } else if (ahead || local > ((remote && remote.at) || 0)) {
        return pushPrefs();
      }
    }).catch(function () {});
  }

  /* ------------------------------------------------------------- lifecycle */

  function refreshBadges() {
    if (!user) {
      badges = { messages: 0, requests: 0, notifications: 0 };
      return Promise.resolve(badges);
    }
    return window.API.unread()
      .then(function (res) {
        badges = {
          messages: res.messages || 0,
          requests: res.requests || 0,
          notifications: res.notifications || 0
        };
        emit("session:badges", badges);
        return badges;
      })
      .catch(function () { return badges; });
  }

  function boot() {
    return window.API.available().then(function (ok) {
      backend = ok;
      if (!ok) { readyResolve({ user: null, backend: false }); return; }

      return window.API.me()
        .then(function (res) { setUser(res.user); })
        .catch(function () { setUser(null); })
        .then(function () {
          readyResolve({ user: user, backend: true });
          if (user) {
            pushSave();
            pullPrefs();
            refreshBadges();
            window.setInterval(refreshBadges, 45000);
          }
        });
    });
  }

  function login(username, password) {
    return window.API.login(username, password).then(function (res) {
      setUser(res.user);
      pullPrefs();
      return pushSave().then(function () {
        refreshBadges();
        return res.user;
      });
    });
  }

  function signup(username, password, displayName, acceptedTerms, email) {
    return window.API.signup(username, password, displayName, email, acceptedTerms).then(function (res) {
      if (res.needsConfirmation) return res;
      setUser(res.user);
      pushPrefs();
      /* Everything played before signing up comes along. */
      return pushSave().then(function () {
        refreshBadges();
        return res;
      });
    });
  }

  function logout() {
    /* Flush before dropping the session, then keep the local copy as-is. */
    return pushSave()
      .then(function () { return window.API.logout(); })
      .catch(function () { /* log out locally regardless */ })
      .then(function () {
        setUser(null);
        badges = { messages: 0, requests: 0, notifications: 0 };
      });
  }

  /* Send the visitor to the sign-in page, remembering where they were. */
  function requireUser() {
    return ready.then(function () {
      if (user) return user;
      var back = window.location.pathname.split("/").pop() + window.location.search;
      window.location.href = "login.html?next=" + encodeURIComponent(back);
      return null;
    });
  }

  var Session = {
    ready: ready,
    get user() { return user; },
    get backend() { return backend; },
    get badges() { return badges; },
    /* Ranked, not string-matched — adding a rank shouldn't mean hunting for
       every `=== "admin"` in the client. */
    rank: function () { return RANK[user && user.role] || 0; },
    isStaff: function () { return Session.rank() >= RANK.mod; },
    /* Campus+ (a.k.a. Arcade+) membership. Staff always count as members so
       moderators can use and test member-only features. Kept here so pages
       don't each re-derive "isPlus OR staff". */
    isPlus: function () { return !!(user && user.isPlus) || Session.rank() >= RANK.mod; },
    isAdmin: function () { return Session.rank() >= RANK.admin; },
    isOwner: function () { return Session.rank() >= RANK.owner; },
    outranks: function (role) { return Session.rank() > (RANK[role] || 0); },
    login: login,
    signup: signup,
    logout: logout,
    setUser: setUser,
    pushSave: pushSave,
    pullPrefs: pullPrefs,
    schedulePush: schedulePush,
    refreshBadges: refreshBadges,
    requireUser: requireUser
  };

  window.Session = Session;

  /* Any local change while signed in eventually reaches the server. */
  document.addEventListener("store:change", function (event) {
    if (event.detail && event.detail.silent) return;
    if (event.detail && (event.detail.key === "settings" || event.detail.key === "pins")) {
      if (event.detail.key === "settings") setPrefsAt(Date.now());
      if (user) {
        window.clearTimeout(prefsTimer);
        prefsTimer = window.setTimeout(pushPrefs, 1500);
      }
    }
    revision++;
    persistLocal();
    schedulePush();
  });
  window.addEventListener("beforeunload", function () {
    if (user && pushTimer) { window.clearTimeout(pushTimer); pushSave(); }
    if (user && prefsTimer) pushPrefs();
  });

  window.addEventListener("online", pushSave);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { persistLocal(); pushSave(); if (prefsTimer) pushPrefs(); }
    else if (user) { pullPrefs(); pushSave(); }   // pick up what other devices did meanwhile
  });

  boot();
})();
