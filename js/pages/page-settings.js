/* Settings. The display half works with no account and no backend; the account
   half appears only once you're signed in. */
(function () {
  "use strict";

  /* In-page confirm when the dialogs are loaded, the browser's otherwise. */
  function ask(title, body, label, danger) {
    if (window.Dialogs && window.Dialogs.confirm) {
      return window.Dialogs.confirm({ title: title, body: body, confirmLabel: label || "OK", danger: !!danger });
    }
    return Promise.resolve(window.confirm(title + (body ? "\n\n" + body : "")));
  }

  /* ------------------------------------------------------------ sections */

  /* One pane at a time, picked from the side menu and kept in the URL hash so
     a reload or a shared link (settings.html#privacy) lands in the same place. */
  function panes() {
    var signedIn = false;
    /* What was asked for (link or hash), kept separately from what is shown,
       so #profile survives the moment before the session has loaded. */
    var requested = window.location.hash.slice(1);
    var links = Array.prototype.slice.call(document.querySelectorAll(".set-link"));
    function paintAccount() {
      links.forEach(function (l) { if (l.hasAttribute("data-account")) l.hidden = !signedIn; });
    }
    paintAccount();
    function paneEl(name) {
      return document.getElementById(name === "staff" ? "staff-block" : "pane-" + name);
    }
    function usable(name) {
      var link = links.filter(function (l) { return l.dataset.pane === name; })[0];
      return link && !link.hidden;
    }
    function show(name, focus) {
      if (!usable(name)) name = signedIn ? "profile" : "appearance";
      links.forEach(function (l) {
        var on = l.dataset.pane === name;
        l.classList.toggle("is-active", on);
        if (on) l.setAttribute("aria-current", "page"); else l.removeAttribute("aria-current");
        var pane = paneEl(l.dataset.pane);
        if (pane) pane.hidden = !on;
      });
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "#" + name);
      }
      var active = links.filter(function (l) { return l.dataset.pane === name; })[0];
      if (active && active.scrollIntoView && window.innerWidth <= 760) {
        active.scrollIntoView({ block: "nearest", inline: "center" });
      }
      if (focus) {
        var h = paneEl(name) && paneEl(name).querySelector("h2");
        if (h) { h.tabIndex = -1; h.focus({ preventScroll: window.innerWidth > 760 }); }
      }
    }
    links.forEach(function (l) {
      l.addEventListener("click", function () { requested = l.dataset.pane; show(requested, true); });
    });
    window.addEventListener("hashchange", function () { requested = window.location.hash.slice(1); show(requested); });
    return {
      show: show,
      refresh: function () { show(requested); },
      signIn: function () { signedIn = true; paintAccount(); }
    };
  }

  /* ------------------------------------------------------------- display */

  function displaySection() {
    var UI = window.UI;
    var Store = window.Store;
    var s = Store.settings();

    /* A gallery of real previews rather than two colour chips — each card is
       painted with that skin's own tokens, so you see what you're choosing. */
    var skins = document.getElementById("skins");
    window.SITE.skins.forEach(function (skin) {
      var card = UI.el("button", "skin-card");
      card.type = "button";
      card.dataset.skin = skin.id;
      card.setAttribute("aria-pressed", s.skin === skin.id ? "true" : "false");
      card.setAttribute("aria-label", skin.label + " skin");

      var preview = UI.el("span", "skin-preview");
      preview.style.background = skin.chips[0];
      var bar = UI.el("span", "skin-bar");
      bar.style.background = skin.chips[1];
      preview.appendChild(bar);
      ["68%", "45%", "80%"].forEach(function (w) {
        var line = UI.el("span", "skin-line");
        line.style.width = w;
        line.style.background = skin.chips[1];
        line.style.opacity = "0.35";
        preview.appendChild(line);
      });
      card.appendChild(preview);

      var foot = UI.el("span", "skin-foot");
      foot.appendChild(UI.el("span", "skin-name", skin.label));
      foot.appendChild(UI.el("span", "skin-mode", skin.dark ? "dark" : "light"));
      card.appendChild(foot);

      function apply() {
        Store.setSetting("skin", skin.id);
        document.documentElement.setAttribute("data-skin", skin.id);
        skins.querySelectorAll(".skin-card").forEach(function (n) {
          n.setAttribute("aria-pressed", n === card ? "true" : "false");
        });
      }

      /* Hovering previews it live; leaving puts your real choice back. */
      card.addEventListener("mouseenter", function () {
        document.documentElement.setAttribute("data-skin", skin.id);
      });
      card.addEventListener("mouseleave", function () {
        document.documentElement.setAttribute("data-skin", Store.settings().skin);
      });
      card.addEventListener("focus", function () {
        document.documentElement.setAttribute("data-skin", skin.id);
      });
      card.addEventListener("blur", function () {
        document.documentElement.setAttribute("data-skin", Store.settings().skin);
      });
      card.addEventListener("click", function () {
        apply();
        UI.toast("Skin · " + skin.label);
      });

      skins.appendChild(card);
    });

    function bindToggle(id, key, onChange) {
      var box = document.getElementById(id);
      box.checked = !!s[key];
      box.addEventListener("change", function () {
        Store.setSetting(key, box.checked);
        if (onChange) onChange(box.checked);
      });
    }

    bindToggle("lite", "lite", function (on) {
      document.documentElement.setAttribute("data-lite", on ? "on" : "off");
    });
    bindToggle("motion", "motion", function (on) {
      document.documentElement.setAttribute("data-motion", on ? "on" : "off");
    });
    bindToggle("autofull", "autoFullscreen");
    bindToggle("confirm-ext", "confirmExternal");

    /* Behaviour switches. The dock and shortcuts ones only take effect on the
       next page load, so say so rather than leaving people wondering. */
    bindToggle("shortcuts", "shortcuts");
    bindToggle("dock", "dock", function () {
      UI.toast("Applies on the next page you open");
    });
    bindToggle("autobackup", "autoBackup");
    bindToggle("hide-gone", "hideUnavailable");

    var sortPick = document.getElementById("default-sort");
    if (sortPick) {
      sortPick.value = s.sort;
      sortPick.addEventListener("change", function () {
        Store.setSetting("sort", sortPick.value);
        UI.toast("Default sort saved");
      });
    }

    /* Text size */
    var textButtons = document.querySelectorAll("[data-textsize]");
    function paintText() {
      var now = Store.settings().textSize;
      textButtons.forEach(function (b) {
        b.setAttribute("aria-pressed", b.dataset.textsize === now ? "true" : "false");
      });
    }
    textButtons.forEach(function (b) {
      b.addEventListener("click", function () {
        Store.setSetting("textSize", b.dataset.textsize);
        document.documentElement.setAttribute("data-text", b.dataset.textsize);
        paintText();
      });
    });
    paintText();

    var grid = document.getElementById("view-grid");
    var list = document.getElementById("view-list");
    function paintView() {
      var view = Store.settings().view;
      grid.setAttribute("aria-pressed", view === "grid" ? "true" : "false");
      list.setAttribute("aria-pressed", view === "list" ? "true" : "false");
    }
    grid.addEventListener("click", function () { Store.setSetting("view", "grid"); paintView(); });
    list.addEventListener("click", function () { Store.setSetting("view", "list"); paintView(); });
    paintView();
  }

  /* ---------------------------------------------------------- local data */

  function dataSection(user) {
    var UI = window.UI;
    var note = document.getElementById("data-note");
    var syncState = document.getElementById("sync-state");
    var syncBtn = document.getElementById("sync-now");

    note.textContent = user
      ? "Your pins, history and playtime sync to the hub while you're signed in. You can still keep an offline copy."
      : "Everything is stored in this browser only. Export a copy if you want it somewhere safe.";

    if (user) {
      syncBtn.hidden = false;
      syncBtn.addEventListener("click", function () {
        window.Session.pushSave().then(function (save) {
          if (save) { UI.toast("Synced"); showSync(Date.now()); }
          else UI.toast("Could not reach the server");
        });
      });

      window.API.getSave().then(function (res) {
        if (res.updatedAt) showSync(res.updatedAt);
      }).catch(function () { /* non-critical */ });

      document.addEventListener("session:synced", function (e) { showSync(e.detail.at); });
    }

    function showSync(at) {
      syncState.textContent = "Last synced " + (at ? UI.formatWhen(at) : "just now") + ".";
    }

    document.getElementById("export").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(window.Store.exportAll(), null, 2)],
        { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "arcade-hub-" + (user ? user.username + "-" : "") +
        new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
      UI.toast("Save exported");
    });

    document.getElementById("import").addEventListener("click", function () {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            window.Store.importAll(JSON.parse(String(reader.result)));
            if (user) {
              window.Session.pushSave().then(function () { UI.toast("Imported and synced"); });
            } else {
              UI.toast("Save imported");
            }
            window.setTimeout(function () { window.location.reload(); }, 700);
          } catch (err) { UI.toast("Could not read that file"); }
        };
        reader.readAsText(file);
      });
      input.click();
    });

    document.getElementById("wipe-local").addEventListener("click", function () {
      ask("Clear this device?", "Pins, history and playtime stored in this browser are erased." +
          (user ? " Your synced copy in your account is kept." : " There's no other copy."), "Clear it", true)
        .then(function (yes) {
          if (!yes) return;
          window.Store.resetAll();
          window.location.reload();
        });
    });
  }

  /* "Mozilla/5.0 (Windows NT 10.0…) Chrome/…" → "Chrome on Windows". */
  function deviceName(agent) {
    var a = String(agent || "");
    if (!a || a === "This device") return a || "Unknown device";
    var browser = /Edg\//.test(a) ? "Edge" : /OPR\//.test(a) ? "Opera" : /Firefox\//.test(a) ? "Firefox"
      : /CrOS/.test(a) && /Chrome\//.test(a) ? "Chrome" : /Chrome\//.test(a) ? "Chrome"
      : /Safari\//.test(a) ? "Safari" : "";
    var os = /CrOS/.test(a) ? "Chromebook" : /Windows/.test(a) ? "Windows" : /iPhone|iPad/.test(a) ? "iOS"
      : /Mac OS X/.test(a) ? "Mac" : /Android/.test(a) ? "Android" : /Linux/.test(a) ? "Linux" : "";
    if (browser && os) return browser + " on " + os;
    return (browser || os || a).slice(0, 60);
  }

  function listRow(iconName, title, sub, tone, action) {
    var UI = window.UI;
    var row = UI.el("div", "set-item" + (tone ? " is-" + tone : ""));
    var ico = UI.el("span", "set-item-ico");
    ico.appendChild(UI.icon(iconName));
    row.appendChild(ico);
    var text = UI.el("span", "set-item-text");
    text.appendChild(UI.el("strong", null, title));
    if (sub) text.appendChild(UI.el("span", null, sub));
    row.appendChild(text);
    if (action) row.appendChild(action);
    return row;
  }

  /* ------------------------------------------------------------- account */

  function accountSection(user) {
    var UI = window.UI;
    var API = window.API;

    /* Who you are, at the top of the menu. */
    var meCard = document.getElementById("me-card");
    function drawMe(u) {
      meCard.innerHTML = "";
      meCard.appendChild(window.SocialUI ? window.SocialUI.avatar(u) : UI.el("span"));
      var names = UI.el("span", "set-me-names");
      var n1 = UI.el("strong", null, u.displayName || u.username);
      n1.appendChild(UI.userTags(u, { compact: true }));
      names.appendChild(n1);
      names.appendChild(UI.el("span", null, "@" + u.username +
        (u.createdAt ? " · since " + new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "")));
      meCard.appendChild(names);
      meCard.hidden = false;
    }
    drawMe(user);
    document.getElementById("handle-hint").textContent = "@" + user.username;
    document.getElementById("view-profile").href = "profile.html?u=" + encodeURIComponent(user.username);

    /* ---- profile ---- */
    var display = document.getElementById("display");
    var bio = document.getElementById("bio");
    var bioCount = document.getElementById("bio-count");

    var saveBtn = document.getElementById("profile-save");
    var saved = { display: user.displayName || "", bio: user.bio || "" };
    display.value = saved.display;
    bio.value = saved.bio;
    /* Save lights up only when something actually changed. */
    function dirty() {
      var changed = display.value.trim() !== saved.display || bio.value.trim() !== saved.bio;
      saveBtn.disabled = !changed;
      bioCount.textContent = bio.value.length;
    }
    display.addEventListener("input", dirty);
    bio.addEventListener("input", dirty);
    dirty();

    /* ---- profile picture ---- */
    var pfpPreview = document.getElementById("pfp-preview");
    var pfpUpload = document.getElementById("pfp-upload");
    var pfpCamera = document.getElementById("pfp-camera");
    var pfpRemove = document.getElementById("pfp-remove");
    var pfpHint = document.getElementById("pfp-hint");

    function drawPfp(u) {
      if (!pfpPreview) return;
      pfpPreview.innerHTML = "";
      if (window.SocialUI) {
        var a = window.SocialUI.avatar(u, "lg");
        // move its inner content into our preview span (keep our sizing class)
        while (a.firstChild) pfpPreview.appendChild(a.firstChild);
      }
      if (pfpRemove) pfpRemove.hidden = !u.avatarUrl;
    }
    drawPfp(user);

    function savePfp(shot, button) {
      if (!shot || !shot.dataUrl) return Promise.resolve();
      if (button) button.disabled = true;
      var parts = shot.dataUrl.split(",");
      var mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/jpeg";
      var bin = atob(parts[1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var blob = new Blob([arr], { type: mime });
      return API.uploadAvatar(blob, mime, shot.dataUrl).then(function (res) {
        window.Session.setUser(res.user);
        drawPfp(res.user);
        drawMe(res.user);
        if (res.shared === false) {
          pfpHint.textContent = "Saved, but only you can see it right now: the site's avatar storage " +
            "isn't set up. It will be shared automatically once it is.";
          pfpHint.classList.add("is-warn");
          UI.toast("Only you can see this picture for now", 4000);
        } else {
          pfpHint.classList.remove("is-warn");
          UI.toast("Profile picture updated — everyone can see it");
        }
      }).finally(function () { if (button) button.disabled = false; });
    }

    function avatarError(err) {
      if (err && /cancel|no file/i.test(err.message || "")) return;
      UI.toast((err && err.message) || "Couldn't upload that.");
    }

    if (pfpUpload && window.API && window.API.uploadAvatar) {
      pfpUpload.addEventListener("click", function () {
        if (!window.Capture) { UI.toast("Image picker unavailable."); return; }
        (window.Capture.avatarFromFile || window.Capture.fromFile)()
          .then(function (shot) { return savePfp(shot, pfpUpload); }).catch(avatarError);
      });
    }
    if (pfpCamera) {
      var cameraOK = !!(window.Capture && window.Capture.supported && window.Capture.supported().camera && window.Capture.avatarFromCamera);
      pfpCamera.hidden = !cameraOK;
      if (cameraOK) pfpCamera.addEventListener("click", function () {
        window.Capture.avatarFromCamera()
          .then(function (shot) { return savePfp(shot, pfpCamera); }).catch(avatarError);
      });
    }
    if (pfpRemove) {
      pfpRemove.addEventListener("click", function () {
        pfpRemove.disabled = true;
        API.removeAvatar().then(function (res) {
          window.Session.setUser(res.user);
          drawPfp(res.user);
          drawMe(res.user);
          UI.toast("Picture removed");
        }).catch(function (err) { UI.toast(err.message); })
          .then(function () { pfpRemove.disabled = false; });
      });
    }

    document.getElementById("profile-form").addEventListener("submit", function (event) {
      event.preventDefault();
      saveBtn.disabled = true;
      API.updateProfile({ displayName: display.value.trim(), bio: bio.value.trim() })
        .then(function (res) {
          window.Session.setUser(res.user);
          saved = { display: res.user.displayName || "", bio: res.user.bio || "" };
          drawMe(res.user);
          UI.toast("Profile saved");
        })
        .catch(function (err) { UI.toast(err.message); })
        .then(dirty);
    });

    /* ---- privacy ---- */
    var privacy = document.getElementById("privacy");

    function toggleRow(key, title, hint, value) {
      var row = UI.el("div", "set-row");
      var text = UI.el("div", "set-text");
      text.appendChild(UI.el("strong", null, title));
      text.appendChild(UI.el("span", "set-hint", hint));
      row.appendChild(text);

      var wrap = UI.el("label", "toggle");
      var input = UI.el("input");
      input.type = "checkbox";
      input.setAttribute("aria-label", title);
      input.checked = !!value;
      input.addEventListener("change", function () {
        var patch = {};
        patch[key] = input.checked;
        API.updateProfile(patch)
          .then(function (res) { window.Session.setUser(res.user); UI.toast("Saved"); })
          .catch(function (err) { input.checked = !input.checked; UI.toast(err.message); });
      });
      wrap.appendChild(input);
      wrap.appendChild(UI.el("i"));
      row.appendChild(wrap);
      privacy.appendChild(row);
    }

    toggleRow("acceptsDms", "Accept messages from anyone",
      "Off means only friends can start a conversation with you.", user.acceptsDms);
    toggleRow("showActivity", "Share activity with friends",
      "Your playtime and recent titles on your profile, friends only.", user.showActivity);

    /* ---- password ---- */
    var pwError = document.getElementById("pw-error");
    document.getElementById("password-form").addEventListener("submit", function (event) {
      event.preventDefault();
      pwError.hidden = true;

      var current = document.getElementById("current").value;
      var next = document.getElementById("next").value;
      var next2 = document.getElementById("next2").value;

      if (next !== next2) {
        pwError.textContent = "The new passwords don't match.";
        pwError.hidden = false;
        return;
      }

      API.changePassword(current, next)
        .then(function () {
          UI.toast("Password changed — other devices signed out");
          event.target.reset();
          loadSessions();
        })
        .catch(function (err) {
          pwError.textContent = err.message;
          pwError.hidden = false;
        });
    });

    /* ---- sessions ---- */
    function loadSessions() {
      API.sessions().then(function (res) {
        var host = document.getElementById("sessions");
        host.innerHTML = "";
        res.sessions.forEach(function (s) {
          host.appendChild(listRow("screen", deviceName(s.agent),
            s.current ? "This device" : "Signed in " + UI.formatWhen(s.createdAt), s.current ? "good" : ""));
        });
      }).catch(function () { /* non-critical */ });
    }
    loadSessions();

    /* ---- recent sign-in history (security) ---- */
    function loadLoginHistory() {
      if (!API.myLogins) return;
      API.myLogins().then(function (rows) {
        var host = document.getElementById("login-history");
        if (!host) return;
        host.innerHTML = "";
        if (!rows || !rows.length) {
          host.appendChild(UI.el("p", "tiny dimmer", "No sign-ins recorded yet."));
          return;
        }
        rows.forEach(function (l) {
          var failed = l.outcome === "failed";
          host.appendChild(listRow(failed ? "block" : "check", deviceName(l.agent),
            (failed ? "Failed attempt · " : "") + UI.formatWhen(new Date(l.at).getTime()), failed ? "bad" : ""));
        });
      }).catch(function () { /* non-critical */ });
    }
    loadLoginHistory();

    /* ---- email verification ---- */
    var evPill = document.getElementById("ev-pill");
    function pill(ok) {
      evPill.hidden = false;
      evPill.textContent = ok ? "Verified" : "Not verified";
      evPill.className = "set-pill " + (ok ? "is-good" : "is-warn");
    }
    (function emailVerify() {
      var statusEl = document.getElementById("ev-status");
      var actions = document.getElementById("ev-actions");
      var codeInput = document.getElementById("ev-code");
      var sendBtn = document.getElementById("ev-send");
      var checkBtn = document.getElementById("ev-check");
      var msg = document.getElementById("ev-msg");
      if (!statusEl || !API.myEmailVerified) return;

      function say(t) { if (msg) { msg.textContent = t; msg.hidden = false; } }

      API.myEmailVerified().then(function (ok) {
        statusEl.textContent = (user.email || "Your email") + (ok ? "" : " — verify it to use chat, friends and calls.");
        pill(!!ok);
        if (actions) actions.hidden = !!ok;
      }).catch(function () { statusEl.textContent = ""; });

      if (sendBtn) sendBtn.addEventListener("click", function () {
        sendBtn.disabled = true; sendBtn.textContent = "Sending…";
        API.requestEmailCode().then(function (res) {
          say("Code sent to " + ((res && res.sentTo) || "your email") + ". Enter it below.");
          codeInput.hidden = false; checkBtn.hidden = false;
          sendBtn.textContent = "Resend"; sendBtn.disabled = false;
          codeInput.focus();
        }).catch(function (err) {
          say(err.message || "Couldn't send a code.");
          sendBtn.textContent = "Send code"; sendBtn.disabled = false;
        });
      });

      if (checkBtn) checkBtn.addEventListener("click", function () {
        var code = (codeInput.value || "").trim();
        if (!/^[0-9]{6}$/.test(code)) { say("Enter the 6-digit code."); return; }
        checkBtn.disabled = true;
        API.verifyEmailCode(code).then(function () {
          UI.toast("Email verified 🎉");
          statusEl.textContent = user.email || "Your email";
          pill(true);
          actions.hidden = true;
        }).catch(function (err) {
          say(err.message || "That code didn't work.");
          checkBtn.disabled = false;
        });
      });
    })();

    document.getElementById("signout-all").addEventListener("click", function () {
      ask("Sign out other devices?", "Every other browser signed into this account will need to sign in again.", "Sign them out")
        .then(function (yes) {
          if (!yes) return;
          API.signOutEverywhere()
            .then(function () { UI.toast("Other devices signed out"); loadSessions(); })
            .catch(function (err) { UI.toast(err.message); });
        });
    });

    /* ---- delete ---- */
    var delError = document.getElementById("del-error");
    document.getElementById("delete-form").addEventListener("submit", function (event) {
      event.preventDefault();
      delError.hidden = true;

      var typed = document.getElementById("confirm-name").value.trim();
      if (typed !== user.username) {
        delError.textContent = "That doesn't match your username.";
        delError.hidden = false;
        return;
      }
      ask("Delete @" + user.username + " forever?", "Your profile, friends, messages and synced saves are erased. This cannot be undone.", "Delete forever", true)
        .then(function (yes) {
          if (!yes) return;
          API.deleteAccount(typed)
            .then(function () {
              window.Session.setUser(null);
              window.location.href = "index.html";
            })
            .catch(function (err) {
              delError.textContent = err.message;
              delError.hidden = false;
            });
        });
    });
  }

  /* -------------------------------------------------- third-party saves */

  function gameProgressSection() {
    if (!window.GameSaves) return;
    var UI = window.UI;
    var section = document.getElementById("game-progress");
    var state = document.getElementById("gs-state");
    var list = document.getElementById("gs-list");
    section.hidden = false;

    function say(text) { state.textContent = text; }

    function draw(keepMessage) {
      window.API.listGameSaves().then(function (res) {
        list.innerHTML = "";
        if (!res.hosts.length) {
          if (!keepMessage) say("Nothing backed up yet.");
          return;
        }
        res.hosts.forEach(function (h) {
          var drop = UI.el("button", "btn btn-sm btn-flat", "Forget");
          drop.type = "button";
          list.appendChild(listRow("image", h.host, "Backed up " + UI.formatWhen(h.updatedAt), "", drop));
          drop.addEventListener("click", function () {
            ask("Forget the backup for " + h.host + "?", "The copy in your account is deleted. Progress on this device isn't touched.", "Forget it", true)
              .then(function (yes) { if (yes) return forget(); });
          });
          function forget() {
            return window.API.dropGameSave(h.host)
              .then(function () {
                if (window.GameSaves.forget) window.GameSaves.forget(h.host);
                UI.toast("Removed");
                draw();
              })
              .catch(function (err) { UI.toast(err.message); });
          }
        });
        if (!keepMessage) say("Last backed up " + UI.formatWhen(
          Math.max.apply(null, res.hosts.map(function (h) { return h.updatedAt; }))) + ".");
      }).catch(function () { say("Could not read your backups."); });
    }

    function report(results) {
      var ok = results.filter(function (r) { return !r.error; });
      var bad = results.filter(function (r) { return r.error; });
      var parts = [];
      ok.forEach(function (r) {
        if (r.uploaded) parts.push(r.host + ": saved");
        else if (r.unchanged) parts.push(r.host + ": up to date");
        else if (r.current) parts.push(r.host + ": already current");
        else if (r.empty || r.skipped) return;
        else if (r.written !== undefined) parts.push(r.host + ": " + r.written + " restored" +
          (r.kept ? ", " + r.kept + " kept" : ""));
      });
      bad.forEach(function (r) { parts.push(r.host + ": " + r.error); });
      say(parts.join(" · ") || "Nothing to do.");
    }

    function run(label, fn) {
      say(label + "…");
      return fn().then(function (results) {
        report(results);
        draw(true);
      }).catch(function (err) { say(err.message); });
    }

    document.getElementById("gs-backup").addEventListener("click", function () {
      run("Reading game storage", function () {
        return window.GameSaves.backup(function (host, phase) { say(phase + " " + host + "…"); });
      });
    });

    document.getElementById("gs-restore").addEventListener("click", function () {
      run("Restoring", function () { return window.GameSaves.restore(false); });
    });

    document.getElementById("gs-force").addEventListener("click", function () {
      ask("Overwrite this device?", "This device's game progress is replaced with the backed-up copy. Anything newer here is lost.", "Overwrite", true)
        .then(function (yes) {
          if (yes) run("Overwriting", function () { return window.GameSaves.restore(true); });
        });
    });

    draw();
  }

  /* ---------------------------------------------------------------- boot */

  /* ------------------------------------------------------------- staff */

  /* Admin and above only. A moderator can reach the console, but changing how
     it opens is an owner/admin concern and there is no point showing everyone
     else a control that would do nothing for them.

     This is presentation, not protection — the console checks rank on the
     server. All this setting decides is which key *you* press. */
  function staffSection(user) {
    var Store = window.Store;
    var UI = window.UI;
    if (!window.Session.isAdmin()) return;

    var block = document.getElementById("staff-block");
    if (!block) return;
    document.getElementById("staff-link").hidden = false;
    document.getElementById("staff-role").textContent = user.role === "owner" ? "the owner and admins" : "admins";

    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
    document.getElementById("combo-mod").textContent = mac ? "⌘" : "Ctrl";

    /* Keys the browser wants for itself. The split that matters is not "is it
       used" but "can a page take it": most of these the hub overrides fine,
       but a few are browser chrome and never reach the page at all, so there
       is nothing for preventDefault to stop. Those say so plainly rather than
       letting someone pick a combo that silently does nothing. */
    var UNAVAILABLE = {
      l: "focuses the address bar, and browsers do not let a page take that",
      n: "opens a new window",
      t: "opens a new tab",
      w: "closes the tab",
      q: "quits the browser on some platforms"
    };
    var CONTESTED = {
      p: "the print dialog",
      s: "save page",
      f: "find on page",
      d: "bookmark this page",
      r: "reload",
      a: "select all",
      j: "downloads",
      o: "open a file",
      k: "the search bar in Firefox"
    };
    function claimedBy(ch) { return UNAVAILABLE[ch] || CONTESTED[ch]; }

    var select = document.getElementById("admin-key");
    var warn = document.getElementById("admin-key-warn");
    var warnText = document.getElementById("admin-key-warn-text");
    var toggle = document.getElementById("admin-key-on");

    "abcdefghijklmnopqrstuvwxyz0123456789".split("").forEach(function (ch) {
      var tag = UNAVAILABLE[ch] ? "  ·  won't work"
              : CONTESTED[ch]   ? "  ·  taken"
              : "";
      var o = UI.el("option", null, ch.toUpperCase() + tag);
      o.value = ch;
      select.appendChild(o);
    });

    var DEFAULT_KEY = (window.SITE.defaults && window.SITE.defaults.adminKey) || "k";
    var saved = Store.settings().adminKey;
    var enabled = !!saved;
    select.value = (saved || DEFAULT_KEY).toLowerCase();
    toggle.checked = enabled;
    select.disabled = !enabled;

    function comboLabel() {
      return (mac ? "⌘" : "Ctrl") + " + " + select.value.toUpperCase();
    }

    function paintWarning() {
      var key = select.value;
      if (select.disabled || !claimedBy(key)) { warn.hidden = true; return; }

      warnText.textContent = UNAVAILABLE[key]
        ? comboLabel() + " " + UNAVAILABLE[key] + ". The key never reaches this " +
          "page, so the shortcut will not fire at all. The sidebar still works — " +
          "but pick another letter if you want the shortcut."
        : comboLabel() + " is normally " + CONTESTED[key] + ". The hub takes it over " +
          "on its own pages, which works, though a game that has grabbed the key " +
          "for itself may get there first.";
      warn.hidden = false;
    }

    select.addEventListener("change", function () {
      Store.setSetting("adminKey", select.value);
      paintWarning();
      UI.toast("Console shortcut · " + comboLabel());
    });

    toggle.addEventListener("change", function () {
      /* An empty string is the off state — shell.js treats a falsy adminKey
         as "no shortcut", so there is no second flag to keep in step. */
      Store.setSetting("adminKey", toggle.checked ? select.value : "");
      select.disabled = !toggle.checked;
      paintWarning();
      UI.toast(toggle.checked ? "Shortcut on" : "Shortcut off — use the sidebar");
    });

    paintWarning();
  }

  function init() {
    /* Display preferences must not wait on — or require — the backend. */
    displaySection();
    var nav = panes();
    nav.refresh();

    window.Session.ready.then(function (state) {
      if (!state.backend) {
        document.getElementById("no-backend").hidden = false;
        dataSection(null);
        return;
      }
      if (!state.user) {
        document.getElementById("signed-out").hidden = false;
        dataSection(null);
        return;
      }
      nav.signIn();
      /* Each section is built independently, so one throwing cannot take the
         rest of the page down with it. They used to run as four bare calls in
         a row: anything that threw — and the two backends do not fail
         identically — silently skipped everything after it, as an unhandled
         rejection with nothing shown on screen. The staff section was last,
         so it was the one that vanished.

         Staff goes first now: it is local, cheap, and cannot fail on a
         backend quirk the way the others can. */
      section("staff", function () { staffSection(state.user); });
      section("data", function () { dataSection(state.user); });
      section("account", function () { accountSection(state.user); });
      section("game progress", gameProgressSection);
      nav.refresh();
    });
  }

  function section(name, build) {
    try {
      build();
    } catch (err) {
      /* Loud in the console, quiet on the page — a broken panel should not
         look like a broken site. */
      if (window.console) console.error("settings: " + name + " section failed", err);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
