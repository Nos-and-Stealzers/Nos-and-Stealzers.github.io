/* Sign-in form. */
(function () {
  "use strict";

  function init() {
    var form = document.getElementById("form");
    var offline = document.getElementById("offline");
    var errorBox = document.getElementById("error");
    var submit = document.getElementById("submit");

    window.wirePasswordToggle("password", "pw-toggle");

    function nextPage() {
      var next = window.UI.params().get("next") || "index.html";
      /* Only ever bounce to a page on this site. */
      if (/^[a-z0-9_-]+\.html(\?.*)?$/i.test(next)) return next;
      return "index.html";
    }

    /* On a mirror domain, borrow the sign-in from the main site instead of
       typing a password again (see sso.html). */
    var hub = window.SITE.ssoHub;
    var hubHost = hub ? new URL(hub).hostname.replace(/^www\./, "") : "";
    var onMirror = hub && (window.SITE.domains || []).indexOf(location.origin) !== -1 &&
      location.hostname.replace(/^www\./, "") !== hubHost;
    if (onMirror) {
      /* Only offer it once the server side is switched on (api/sso.js). */
      fetch("/api/sso", { cache: "no-store", credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (s) { if (s && s.ready) document.getElementById("sso-box").hidden = false; })
        .catch(function () {});
      document.getElementById("sso-hub").textContent = hubHost;
      document.getElementById("sso-go").addEventListener("click", function () {
        var bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        var state = btoa(String.fromCharCode.apply(null, bytes))
          .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        try {
          sessionStorage.setItem("ach:sso", JSON.stringify({ state: state, next: nextPage(), at: Date.now() }));
        } catch (e) {
          fail("This browser is blocking storage, so that shortcut can't work here. Sign in below.");
          return;
        }
        window.location.href = hub + "/sso.html?to=" + encodeURIComponent(location.origin) +
          "&state=" + encodeURIComponent(state);
      });
    }

    window.Session.ready.then(function (state) {
      if (!state.backend) { offline.hidden = false; return; }
      if (state.user) { window.location.replace(nextPage()); return; }
      form.hidden = false;
      document.getElementById("username").focus();
    });

    function fail(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
      submit.disabled = false;
      submit.textContent = "Sign in";
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      errorBox.hidden = true;

      var username = document.getElementById("username").value.trim();
      var password = document.getElementById("password").value;
      if (!username || !password) return fail("Enter your username or email, and your password.");

      submit.disabled = true;
      submit.textContent = "Signing in…";

      window.Session.login(username, password)
        .then(function () { window.location.href = nextPage(); })
        .catch(function (err) { fail(err.message || "Could not sign in."); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
