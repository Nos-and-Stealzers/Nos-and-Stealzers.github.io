/* Friends: search, requests in and out, the friend list and blocks. */
(function () {
  "use strict";

  function init() {
    window.SocialUI.gate(function () {
      var UI = window.UI;
      var S = window.SocialUI;
      var API = window.API;

      /* A person can arrive here from three places — the friend lists, a
         search result, or a friend-code lookup — and only the first of those
         used to carry the edge id. Every accept / decline / cancel / unblock
         button on a search result was therefore firing at
         `/friendships?id=eq.undefined`. The backends now return `edgeId`
         everywhere, and this resolves it from the friend graph as a fallback
         so a stale row on screen still does the right thing. */
      function edgeFor(u) {
        if (u.edgeId != null) return Promise.resolve(u.edgeId);
        return API.friends().then(function (d) {
          var hit = d.friends.concat(d.incoming, d.outgoing, d.blocked)
            .filter(function (p) { return p.username === u.username; })[0];
          if (!hit) throw new Error("That's already been dealt with — reloading.");
          return hit.edgeId;
        });
      }

      function onEdge(u, run) {
        return edgeFor(u).then(run).then(function () { return load(); });
      }

      var handlers = {
        add: function (u) {
          return API.addFriend(u.username).then(function () {
            UI.toast("Request sent to " + u.username);
            return load();
          });
        },
        accept: function (u) {
          return onEdge(u, function (id) {
            return API.acceptFriend(id).then(function () {
              UI.toast("You're now friends with " + u.username);
            });
          });
        },
        remove: function (u) {
          return onEdge(u, function (id) { return API.removeFriend(id); });
        },
        cancel: function (u) {
          return onEdge(u, function (id) {
            return API.removeFriend(id).then(function () { UI.toast("Request cancelled"); });
          });
        },
        unblock: function (u) {
          return onEdge(u, function (id) {
            return API.removeFriend(id).then(function () { UI.toast("Unblocked " + u.username); });
          });
        },
        block: function (u) {
          if (!window.confirm("Block " + u.username + "? They won't be able to message you or see your profile.")) {
            return Promise.resolve();
          }
          return API.blockUser(u.username).then(function () {
            UI.toast("Blocked " + u.username);
            return load();
          });
        },
        /* Open it in the dock rather than navigating away — you can keep
           browsing, or keep playing, with the conversation alongside. The
           dock returns null when it isn't mounted (switched off in settings),
           in which case nothing at all used to happen. */
        message: function (u) {
          if (!window.ChatDock) return goToThread(u.username);
          return window.ChatDock.openWith(u.username).then(function (opened) {
            if (!opened) return goToThread(u.username);
          }).catch(function (err) {
            UI.toast(err.message || "Could not open that conversation");
          });
        },
        call: function (u) {
          return window.Calls.start({ userId: u.id, kind: "audio" });
        }
      };

      function goToThread(username) {
        return API.openThread(username).then(function (res) {
          window.location.href = "messages.html?thread=" + res.threadId;
        });
      }

      /* ---- your code ---- */
      var codeEl = document.getElementById("my-code");

      function showCode(code) { codeEl.textContent = code || "···-···"; }
      showCode(window.Session.user.friendCode);

      document.getElementById("copy-code").addEventListener("click", function () {
        var code = codeEl.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(
            function () { UI.toast("Code copied"); },
            function () { window.prompt("Your friend code:", code); }
          );
        } else {
          window.prompt("Your friend code:", code);
        }
      });

      document.getElementById("new-code").addEventListener("click", function () {
        if (!window.confirm("Get a new code? The old one stops working immediately.")) return;
        API.rotateCode().then(function (res) {
          showCode(res.friendCode);
          UI.toast("New code issued");
        }).catch(function (err) { UI.toast(err.message); });
      });

      /* ---- add someone: one box, username or code ---- */
      var findBox = document.getElementById("find");
      var results = document.getElementById("results");
      var hint = document.getElementById("find-hint");

      var searchSeq = 0;
      function looksLikeCode(v) {
        return /^[A-Za-z0-9]{3}[- ][A-Za-z0-9]{3}$/.test(v.trim());
      }

      function show(users) {
        results.innerHTML = "";
        users.forEach(function (u) {
          results.appendChild(S.person(u, { actions: S.relationActions(u, handlers) }));
        });
      }

      function search() {
        var value = findBox.value.trim();
        var seq = ++searchSeq;
        results.innerHTML = "";
        if (value.replace(/^@/, "").length < 2) {
          hint.textContent = "Type at least two characters, or use a code with a dash: ABC-123.";
          results.removeAttribute("aria-busy");
          return Promise.resolve();
        }
        hint.textContent = "Searching…";
        results.setAttribute("aria-busy", "true");
        var request = looksLikeCode(value)
          ? API.lookupCode(value).then(function (res) {
              return { users: [Object.assign({}, res.user, { relation: res.relation })] };
            })
          : API.searchUsers(value.replace(/^@/, ""));
        return request.then(function (res) {
          if (seq !== searchSeq || value !== findBox.value.trim()) return;
          hint.textContent = res.users.length
            ? res.users.length + " found. Choose who to add below."
            : "No people found. Check the username or try their friend code (ABC-123).";
          show(res.users);
        }).catch(function (err) {
          if (seq === searchSeq) hint.textContent = err.message || "Search failed. Try again.";
        }).then(function () {
          if (seq === searchSeq) results.removeAttribute("aria-busy");
        });
      }
      document.getElementById("add-form").addEventListener("submit", function (event) {
        event.preventDefault();
        search();
      });
      var delayedSearch = UI.debounce(search, 220);
      findBox.addEventListener("input", function () {
        ++searchSeq; // invalidate immediately, not after the debounce delay
        results.innerHTML = "";
        delayedSearch();
      });

      /* ---- lists ---- */
      function load() {
        return API.friends().then(function (data) {
          var online = data.friends.filter(function (u) { return u.online; }).length;
          document.getElementById("r-friends").textContent = data.friends.length;
          document.getElementById("r-online").textContent = online;
          document.getElementById("r-in").textContent = data.incoming.length;
          document.getElementById("r-out").textContent = data.outgoing.length;

          document.getElementById("b-incoming").hidden = data.incoming.length === 0;
          S.renderPeople(document.getElementById("incoming"), data.incoming, function (u) {
            return S.person(u, {
              actions: [
                { label: "Accept", kind: "cta", onClick: function () { return handlers.accept(u); } },
                { label: "Decline", onClick: function () { return handlers.remove(u); } },
                { label: "Block", onClick: function () { return handlers.block(u); } }
              ]
            });
          });

          document.getElementById("b-outgoing").hidden = data.outgoing.length === 0;
          S.renderPeople(document.getElementById("outgoing"), data.outgoing, function (u) {
            return S.person(u, {
              note: "awaiting reply",
              actions: [{ label: "Cancel", onClick: function () { return handlers.cancel(u); } }]
            });
          });

          var canCall = window.Calls && window.Calls.supported();

          S.renderPeople(document.getElementById("friends"), data.friends, function (u) {
            return S.person(u, {
              actions: [
                { label: "Message", kind: "cta", onClick: function () { return handlers.message(u); } },
                /* Calling a friend was reachable from their profile and from
                   the chat dock, but not from the list of friends. */
                canCall ? { label: "☎", onClick: function () { return handlers.call(u); } } : null,
                { label: "Remove", onClick: function () { return handlers.remove(u); } },
                /* Blocking was only offered on an incoming request, so the
                   one case it exists for — someone you already accepted
                   turning unpleasant — had no button anywhere on this page. */
                { label: "Block", onClick: function () { return handlers.block(u); } }
              ].filter(Boolean)
            });
          }, {
            title: "No friends yet",
            body: "Search for someone above and send a request."
          });

          document.getElementById("b-blocked").hidden = data.blocked.length === 0;
          S.renderPeople(document.getElementById("blocked"), data.blocked, function (u) {
            return S.person(u, {
              presence: false,
              actions: [{ label: "Unblock", onClick: function () { return handlers.unblock(u); } }]
            });
          });

          window.Session.refreshBadges();
        });
      }

      load().catch(function (err) { UI.toast(err.message); });
      window.setInterval(load, 30000);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
