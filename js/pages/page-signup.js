/* Account creation, including the strength meter and the "your local save
   comes with you" note. */
(function () {
  "use strict";

  function strengthOf(value) {
    var score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return Math.min(score, 4);
  }

  var LABELS = ["Too short", "Weak", "Okay", "Good", "Strong"];

  function init() {
    var form = document.getElementById("form");
    var offline = document.getElementById("offline");
    var firstRun = document.getElementById("first-run");
    var errorBox = document.getElementById("error");
    var submit = document.getElementById("submit");
    var pass = document.getElementById("password");
    var meter = document.getElementById("strength");

    window.wirePasswordToggle("password", "pw-toggle");
    window.wirePasswordToggle("confirm", "confirm-toggle");
    window.wirePasswordToggle("old-password", "old-pw-toggle");

    window.Session.ready.then(function (state) {
      if (!state.backend) { offline.hidden = false; return; }
      if (state.user) { window.location.replace("index.html"); return; }
      form.hidden = false;
      if (window.API.health && window.API.health.needsSetup) firstRun.hidden = false;
      document.getElementById("username").focus();
    });

    /* Tell them exactly what gets carried over — it's the reason to sign up. */
    var carry = document.getElementById("carry");
    var pins = window.Store.favorites().length;
    var played = Object.keys(window.Store.stats()).length;
    if (pins || played) {
      carry.textContent = "Your " + pins + " pinned title" + (pins === 1 ? "" : "s") +
        " and " + played + " played title" + (played === 1 ? "" : "s") +
        " on this device will be attached to the new account.";
    }

    pass.addEventListener("input", function () {
      var value = pass.value;
      if (!value) { meter.hidden = true; return; }
      var score = strengthOf(value);
      meter.hidden = false;
      meter.dataset.score = score;
      meter.firstElementChild.style.width = ((score / 4) * 100) + "%";
      meter.setAttribute("aria-label", "Password strength: " + LABELS[score]);
      meter.title = LABELS[score];
    });

    function fail(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
      submit.disabled = !document.getElementById("accept").checked;
      submit.textContent = "Create account";
    }

    /* The submit button stays disabled until the box is ticked, so agreement
       is a deliberate act rather than something buried under a button. */
    var accept = document.getElementById("accept");
    accept.addEventListener("change", function () {
      submit.disabled = !accept.checked;
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      errorBox.hidden = true;

      var username = document.getElementById("username").value.trim();
      var display = document.getElementById("display").value.trim();
      var email = document.getElementById("email").value.trim();
      var password = pass.value;
      var confirm = document.getElementById("confirm").value;

      if (!accept.checked) return fail("You need to accept the terms to sign up.");
      if (!username) return fail("Choose a username.");
      if (!display) return fail("Enter a display name.");
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
      if (password !== confirm) return fail("The two passwords don't match.");
      if (password.length < 8) return fail("Password must be at least 8 characters.");
      if (!/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
        return fail("Password needs at least one letter and one number.");
      }

      submit.disabled = true;
      submit.textContent = "Creating…";

      window.Session.signup(username, password, display, true, email)
        .then(function (res) {
          if (res.needsConfirmation) {
            window.UI.toast("Check your email to confirm your account, then sign in.");
            window.location.href = "login.html";
            return;
          }
          window.UI.toast(res.firstAccount ? "Admin account created" : "Welcome, " + username);
          window.location.href = res.firstAccount ? "admin.html" : "verify-email.html";
        })
        .catch(function (err) {
          fail(err.message || "Could not create the account.");
          if (err && err.status === 409 && /email/i.test(err.message || "") && window.API.replaceAccountWithPassword) {
            openReplace(email);
          }
        });
    });

    /* ---- the email is taken: replace that account, with proof it's yours ---- */
    var replace = document.getElementById("replace");
    var replaceError = document.getElementById("replace-error");
    var replaceEmail = "";

    function openReplace(email) {
      replaceEmail = email.toLowerCase();
      replaceError.hidden = true;
      replace.hidden = false;
      document.getElementById("old-password").focus();
    }
    document.getElementById("email").addEventListener("input", function () { replace.hidden = true; });

    function replaceFail(err) {
      replaceError.textContent = (err && err.message) || "That didn't work.";
      replaceError.hidden = false;
      busy(false);
    }
    function busy(on) {
      ["replace-pw", "replace-send", "replace-code-go"].forEach(function (id) { document.getElementById(id).disabled = on; });
    }
    function confirmDelete() {
      var text = "The old account on " + replaceEmail + " and everything in it (friends, messages, cloud saves) " +
        "will be deleted for good. Then your new account is created.";
      return window.Dialogs && window.Dialogs.confirm
        ? window.Dialogs.confirm({ title: "Delete the old account?", body: text, confirmLabel: "Delete it", danger: true })
        : Promise.resolve(window.confirm(text));
    }
    function thenSignup() {
      replace.hidden = true;
      window.UI.toast("Old account deleted");
      busy(false);
      form.requestSubmit();
    }

    document.getElementById("replace-pw").addEventListener("click", function () {
      var pw = document.getElementById("old-password").value;
      if (!pw) return replaceFail({ message: "Enter the old account's password." });
      confirmDelete().then(function (ok) {
        if (!ok) return;
        busy(true);
        window.API.replaceAccountWithPassword(replaceEmail, pw).then(thenSignup, replaceFail);
      });
    });
    document.getElementById("replace-send").addEventListener("click", function () {
      busy(true);
      window.API.requestReplaceCode(replaceEmail).then(function () {
        busy(false);
        replaceError.hidden = true;
        document.getElementById("replace-code-field").hidden = false;
        document.getElementById("replace-code").focus();
        window.UI.toast("If that email has an account, a code is on its way");
      }, replaceFail);
    });
    document.getElementById("replace-code-go").addEventListener("click", function () {
      var code = document.getElementById("replace-code").value.trim();
      if (!/^\d{6}$/.test(code)) return replaceFail({ message: "Enter the 6-digit code from the email." });
      confirmDelete().then(function (ok) {
        if (!ok) return;
        busy(true);
        window.API.replaceAccountWithCode(replaceEmail, code).then(thenSignup, replaceFail);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
