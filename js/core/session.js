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
      window.Store.importAll(saved || { version: 2, favorites: [], recents: [], stats: {}, ratings: {} }, { silent: true });
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
            refreshBadges();
            window.setInterval(refreshBadges, 45000);
          }
        });
    });
  }

  function login(username, password) {
    return window.API.login(username, password).then(function (res) {
      setUser(res.user);
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
    schedulePush: schedulePush,
    refreshBadges: refreshBadges,
    requireUser: requireUser
  };

  window.Session = Session;

  /* Any local change while signed in eventually reaches the server. */
  document.addEventListener("store:change", function (event) {
    if (event.detail && event.detail.silent) return;
    revision++;
    persistLocal();
    schedulePush();
  });
  window.addEventListener("beforeunload", function () {
    if (user && pushTimer) { window.clearTimeout(pushTimer); pushSave(); }
  });

  window.addEventListener("online", pushSave);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { persistLocal(); pushSave(); }
  });

  boot();
})();
