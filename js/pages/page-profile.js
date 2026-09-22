/* A player's profile. No ?u= means your own. */
(function () {
  "use strict";

  function init() {
    window.SocialUI.gate(function (me) {
      var UI = window.UI;
      var S = window.SocialUI;
      var API = window.API;

      var wanted = UI.params().get("u") || me.username;

      function load() {
        return API.user(wanted).then(draw).catch(function () {
          document.getElementById("missing").hidden = false;
        });
      }

      function draw(res) {
        var user = res.user;
        var mine = user.relation === "self";

        document.getElementById("view").hidden = false;
        document.title = (user.displayName || user.username) + " — " + window.SITE.name;

        var who = document.getElementById("who");
        who.innerHTML = "";
        var av = S.avatar(user, "lg");
        who.appendChild(av);
        /* Own profile: click the avatar to upload/change a picture. */
        if (mine) {
          av.classList.add("avatar-editable");
          av.title = "Change your picture";
          av.setAttribute("role", "button");
          av.setAttribute("tabindex", "0");
          var cam = UI.el("span", "avatar-edit-badge");
          cam.appendChild(UI.icon("camera"));
          av.appendChild(cam);
          var pick = function () { chooseAvatar(user, av); };
          av.addEventListener("click", pick);
          av.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
          });
        }
        var block = UI.el("div");
        var h1 = UI.el("h1");
        h1.textContent = user.displayName || user.username;
        block.appendChild(h1);
        var handle = UI.el("p", "handle");
        handle.textContent = "@" + user.username;
        if (user.role !== "user") handle.appendChild(UI.el("span", "role", user.role));
        if (user.isPlus) handle.appendChild(UI.el("span", "role plus", "Campus+"));
        if (user.state === "suspended") handle.appendChild(UI.el("span", "role bad", "suspended"));
        block.appendChild(handle);
        var presence = UI.el("p", "tiny dimmer");
        presence.textContent = user.online ? "● online now" : "last seen " + UI.formatWhen(user.lastSeen);
        block.appendChild(presence);
        who.appendChild(block);

        if (user.bio) {
          var bio = document.getElementById("bio");
          bio.textContent = user.bio;      // untrusted text
          bio.hidden = false;
        }

        /* ---- actions ---- */
        var acts = document.getElementById("acts");
        acts.innerHTML = "";

        function button(label, kind, onClick) {
          var b = UI.el("button", "btn" + (kind ? " " + kind : ""));
          b.type = "button";
          /* label can be a plain string, or [iconName, text] for an icon + label. */
          if (Array.isArray(label)) {
            b.appendChild(UI.icon(label[0]));
            b.appendChild(UI.el("span", null, label[1]));
          } else {
            b.textContent = label;
          }
          b.addEventListener("click", function () {
            b.disabled = true;
            Promise.resolve(onClick())
              .catch(function (err) { UI.toast(err.message || "That didn't work"); })
              .then(function () { b.disabled = false; });
          });
          acts.appendChild(b);
          return b;
        }

        if (mine) {
          var edit = UI.el("a", "btn btn-cta", "Edit profile");
          edit.href = "settings.html";
          acts.appendChild(edit);
          var lib = UI.el("a", "btn", "My shelf");
          lib.href = "library.html";
          acts.appendChild(lib);
        } else {
          S.relationActions(user, {
            add: function () { return API.addFriend(user.username).then(after("Request sent")); },
            accept: function () { return API.friends().then(function (d) {
              var edge = d.incoming.filter(function (u) { return u.username === user.username; })[0];
              return edge ? API.acceptFriend(edge.edgeId).then(after("You're now friends")) : null;
            }); },
            remove: function () { return API.friends().then(function (d) {
              var all = d.friends.concat(d.incoming, d.outgoing);
              var edge = all.filter(function (u) { return u.username === user.username; })[0];
              return edge ? API.removeFriend(edge.edgeId).then(after("Removed")) : null;
            }); },
            cancel: function () { return API.friends().then(function (d) {
              var edge = d.outgoing.filter(function (u) { return u.username === user.username; })[0];
              return edge ? API.removeFriend(edge.edgeId).then(after("Request cancelled")) : null;
            }); },
            unblock: function () { return API.friends().then(function (d) {
              var edge = d.blocked.filter(function (u) { return u.username === user.username; })[0];
              return edge ? API.removeFriend(edge.edgeId).then(after("Unblocked")) : null;
            }); },
            message: openConversation
          }).forEach(function (a) {
            button(a.label, a.kind === "cta" ? "btn-cta" : "", a.onClick);
          });

          /* Not a friend yet, but their DMs are open? Then there is still a
             conversation to start. relationActions already gives friends a
             Message button, so adding one unconditionally — as this used to —
             put two identical buttons side by side on every friend's page. */
          if (user.relation !== "friends" && user.relation !== "blocked" &&
              user.relation !== "blocked-by") {
            button("Message", "", openConversation);
          }

          /* Calling is friends-only, and the server says so too — no point
             offering a button that will come back 400. */
          if (user.relation === "friends" && window.Calls && window.Calls.supported()) {
            button(["phone", "Call"], "btn-call", function () {
              return window.Calls.start({ userId: user.id, kind: "audio" });
            });
            button(["video", "Video"], "btn-call", function () {
              return window.Calls.start({ userId: user.id, kind: "video" });
            });
          }

          if (user.relation !== "blocked") {
            button(["block", "Block"], "btn-flat", function () {
              if (!window.confirm("Block " + user.username + "?")) return Promise.resolve();
              return API.blockUser(user.username).then(after("Blocked"));
            });
          }

          button(["flag", "Report"], "btn-flat", function () {
            var reason = window.prompt("Why are you reporting " + user.username + "?");
            if (!reason || reason.trim().length < 4) return Promise.resolve();
            return API.report("user", user.username, reason.trim())
              .then(function () { UI.toast("Report sent"); });
          });
        }

        function after(message) {
          return function () { UI.toast(message); return load(); };
        }

        /* Pick, downscale and upload a profile picture. Uses the shared capture
           pipeline (already downscales/encodes to a reasonable JPEG) then
           uploads the blob. Clear messaging if the server isn't set up yet. */
        function chooseAvatar(currentUser, avEl) {
          if (!window.Capture || !window.Capture.fromFile) {
            UI.toast("Image picker unavailable here.");
            return;
          }
          (window.Capture.avatarFromFile || window.Capture.fromFile)().then(function (shot) {
            if (!shot || !shot.dataUrl) return;
            avEl.classList.add("avatar-busy");
            var blob = dataUrlToBlob(shot.dataUrl);
            return API.uploadAvatar(blob, blob.type, shot.dataUrl).then(function (res) {
              if (window.Session && res.user) window.Session.setUser(res.user);
              UI.toast("Profile picture updated");
              return load();
            });
          }).catch(function (err) {
            if (err && /cancel|no file/i.test(err.message || "")) return;
            UI.toast(err.message || "Couldn't update your picture.");
          }).then(function () {
            avEl.classList.remove("avatar-busy");
          });
        }

        function dataUrlToBlob(dataUrl) {
          var parts = dataUrl.split(",");
          var mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/jpeg";
          var bin = atob(parts[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type: mime });
        }

        /* The dock when it is there, the messages page when it isn't — the
           same rule the friends page follows, so "Message" behaves the same
           way wherever you press it. */
        function openConversation() {
          if (!window.ChatDock) return goToThread();
          return window.ChatDock.openWith(user.username).then(function (opened) {
            if (!opened) return goToThread();
          });
        }

        function goToThread() {
          return API.openThread(user.username).then(function (r) {
            window.location.href = "messages.html?thread=" + r.threadId;
          });
        }

        /* ---- activity ---- */
        var metrics = document.getElementById("metrics");
        if (res.user.activity) {
          var a = res.user.activity;
          metrics.hidden = false;
          document.getElementById("m-time").textContent = UI.formatDuration(a.totalSeconds);
          document.getElementById("m-games").textContent = a.gamesPlayed;
          document.getElementById("m-since").textContent =
            new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" });
          document.getElementById("m-seen").textContent =
            user.online ? "now" : UI.formatWhen(user.lastSeen);

          var games = a.recent.map(function (id) { return window.Catalog.byId(id); }).filter(Boolean);
          if (games.length) {
            document.getElementById("b-recent").hidden = false;
            UI.render(document.getElementById("g-recent"), games, { desc: false });
          }
        } else if (!mine) {
          document.getElementById("private").hidden = false;
        }
      }

      load();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
