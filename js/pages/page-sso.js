/* Cross-site sign-in: one account on every one of the hub's domains.

   Each domain keeps its own browser storage, so a sign-in on one never
   reached another. This page does both halves of the hand-over:

   - on a domain where you're signed in, sso.html?to=<origin>&state=<s>
     asks api/sso.js for a one-time login code for <origin> and sends you
     there with it in the URL fragment (never sent to any server);
   - back on <origin>, sso.html#sso=<code>&state=<s> checks that this tab
     started the hand-over (the state it saved), then trades the code for
     a session of its own.

   Codes only ever go to the hub's own domains (checked here and on the
   server), work once, and a state mismatch means the code is thrown away. */
(function () {
  "use strict";

  var KEY = "ach:sso";
  var MAX_AGE = 10 * 60 * 1000;

  function $(id) { return document.getElementById(id); }

  function say(title, text, actions) {
    $("sso-title").textContent = title;
    $("sso-text").textContent = text || "";
    var box = $("sso-actions");
    box.innerHTML = "";
    box.hidden = !actions || !actions.length;
    (actions || []).forEach(function (a, i) {
      var link = window.UI.el("a", "btn" + (i ? " btn-flat" : " btn-cta"), a[0]);
      link.href = a[1];
      box.appendChild(link);
    });
  }

  function isHubSite(origin) {
    return (window.SITE.domains || []).indexOf(origin) !== -1;
  }
  function hostOf(origin) {
    try { return new URL(origin).host; } catch (e) { return origin; }
  }
  function safeNext(next) {
    return /^[a-z0-9_-]+\.html(\?.*)?$/i.test(next || "") ? next : "index.html";
  }

  /* ---- this domain has the session: hand a code to another ---- */
  function give(to, state) {
    if (!isHubSite(to) || to === location.origin || !/^[A-Za-z0-9_-]{16,64}$/.test(state || "")) {
      say("That link isn't right", "It doesn't point at one of the hub's sites, so nothing was shared.",
        [["Go home", "index.html"]]);
      return;
    }
    window.Session.ready.then(function (st) {
      if (!st.backend) {
        say("Accounts are offline", "The account server isn't reachable right now.", [["Back", to + "/login.html"]]);
        return;
      }
      if (!st.user) {
        /* Sign in here first, then carry on. */
        window.location.replace("login.html?next=" + encodeURIComponent("sso.html" + location.search));
        return;
      }
      say("Signing you in on " + hostOf(to), "as @" + st.user.username + "…");
      window.API.ssoIssue(to).then(function (code) {
        window.location.replace(to + "/sso.html#sso=" + encodeURIComponent(code) +
          "&state=" + encodeURIComponent(state));
      }).catch(function (err) {
        say("Couldn't sign you in there", (err && err.message) || "Try again in a moment.",
          [["Back to " + hostOf(to), to + "/login.html"]]);
      });
    });
  }

  /* ---- back on the domain that asked: use the code ---- */
  function take(code, state) {
    /* The code leaves the address bar (and history) straight away. */
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) {}
    try { sessionStorage.removeItem(KEY); } catch (e) {}

    if (!saved || !state || saved.state !== state || !(Date.now() - saved.at < MAX_AGE)) {
      say("That sign-in didn't start here",
        "For your safety it wasn't used. Start again from the sign-in page.", [["Sign in", "login.html"]]);
      return;
    }
    window.Session.ready.then(function (st) {
      if (st.user) { window.location.replace(safeNext(saved.next)); return; }
      return window.Session.ssoLogin(code).then(function () {
        window.location.replace(safeNext(saved.next));
      });
    }).catch(function (err) {
      say("Couldn't sign you in", (err && err.message) || "Try again.", [["Sign in", "login.html"]]);
    });
  }

  function init() {
    var hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get("sso")) { take(hash.get("sso"), hash.get("state")); return; }
    var q = window.UI.params();
    if (q.get("to")) { give(q.get("to"), q.get("state")); return; }
    say("Nothing to do here", "", [["Go home", "index.html"]]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
