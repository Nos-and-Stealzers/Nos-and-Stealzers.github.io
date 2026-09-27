/* The full Messages page: conversation list on the left, the open chat on
   the right, and a details panel for group members / profile actions.
   The conversation itself is ChatCore's (shared with the floating dock). */
(function () {
  "use strict";

  var LIST_POLL = 20000;

  function init() {
    window.SocialUI.gate(function () {
      var UI = window.UI;
      var API = window.API;
      var Core = window.ChatCore;
      var el = UI.el;

      var shell = document.getElementById("msgs");
      var listHost = document.getElementById("thread-list");
      var searchBox = document.getElementById("thread-search");
      var statusBox = document.getElementById("thread-status");
      var statusText = document.getElementById("thread-status-text");
      var retry = document.getElementById("thread-retry");
      var welcome = document.getElementById("dm-empty");
      var openBox = document.getElementById("dm-open");
      var head = document.getElementById("dm-head");
      var info = document.getElementById("info");

      document.getElementById("search-wrap").insertBefore(UI.icon("search"), searchBox);
      document.getElementById("welcome-art").appendChild(UI.icon("chat"));

      var threads = [];
      var current = null;
      var loaded = false;

      var convo = Core.conversation({
        onMeta: function (meta) {
          current = meta;
          convo.setMembers(meta.members);
          drawHead();
          if (!info.hidden) drawInfo();
          loadList();
        },
        onGone: function (err) {
          UI.toast((err && err.message) || "That conversation isn't available");
          closeThread();
        },
        onActivity: function () { loadList(); }
      });
      document.getElementById("convo-host").appendChild(convo.el);

      /* ------------------------------------------------------ list */

      function loadList() {
        return API.threads().then(function (res) {
          threads = res.threads || [];
          loaded = true;
          statusBox.hidden = true;
          draw();
          return threads;
        }).catch(function (err) {
          if (!loaded) {
            statusText.textContent = (err && err.message) || "Couldn't load your conversations.";
            statusBox.hidden = false;
            listHost.innerHTML = "";
          }
          return threads;
        });
      }

      function draw() {
        Core.threadList(listHost, threads, {
          query: searchBox.value,
          activeId: current && current.id,
          onPick: function (t) { openThread(t.id, t); },
          onNew: startNew
        });
      }

      function skeletonList() {
        listHost.innerHTML = "";
        for (var i = 0; i < 6; i++) {
          var r = el("div", "chat-row is-skel");
          r.appendChild(el("span", "chat-skel chat-skel-av"));
          var mid = el("span", "chat-row-mid");
          mid.appendChild(el("span", "chat-skel chat-skel-line"));
          mid.appendChild(el("span", "chat-skel chat-skel-line is-short"));
          r.appendChild(mid);
          listHost.appendChild(r);
        }
      }

      searchBox.addEventListener("input", draw);
      retry.addEventListener("click", function () { skeletonList(); statusBox.hidden = true; loadList(); });

      function startNew() {
        Core.newChat().then(function (id) {
          if (id) loadList().then(function () { openThread(id); });
        });
      }
      document.getElementById("new-chat").addEventListener("click", startNew);
      document.getElementById("welcome-new").addEventListener("click", startNew);

      /* ----------------------------------------------- conversation */

      function openThread(id, hint) {
        id = Number(id);
        current = {
          id: id, title: (hint && hint.title) || "", isGroup: hint && hint.isGroup,
          with: hint && hint.with, memberCount: hint && hint.memberCount, members: (hint && hint.members) || []
        };
        welcome.hidden = true;
        openBox.hidden = false;
        shell.classList.add("is-viewing");
        drawHead();
        draw();
        UI.setParams({ thread: id, u: null, "new": null }, true);
        var p = convo.open(id);
        if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) convo.focus();
        return p;
      }

      function closeThread() {
        convo.close();
        current = null;
        openBox.hidden = true;
        welcome.hidden = false;
        info.hidden = true;
        shell.classList.remove("is-viewing");
        UI.setParams({ thread: null }, true);
        draw();
      }

      function headBtn(name, label, onClick, cls) {
        var b = el("button", "chat-icon-btn" + (cls ? " " + cls : ""));
        b.type = "button";
        b.title = label;
        b.setAttribute("aria-label", label);
        b.appendChild(UI.icon(name));
        b.addEventListener("click", onClick);
        return b;
      }

      function drawHead() {
        head.innerHTML = "";
        if (!current) return;

        head.appendChild(headBtn("back", "Back to chats", closeThread, "msgs-back"));

        var who = el(current.isGroup || !current.with ? "div" : "a", "msgs-who");
        if (!current.isGroup && current.with) {
          who.href = "profile.html?u=" + encodeURIComponent(current.with.username);
        }
        who.appendChild(current.isGroup ? Core.groupAvatar() : Core.avatar(current.with));
        var names = el("span", "msgs-who-names");
        var nameLine = el("strong", "msgs-who-name", current.title || "…");
        if (!current.isGroup && current.with) nameLine.appendChild(UI.userTags(current.with, { compact: true }));
        names.appendChild(nameLine);
        var sub = el("span", "msgs-who-sub");
        if (current.isGroup) {
          sub.textContent = current.memberCount ? current.memberCount + " people" : "";
        } else if (current.with) {
          if (current.with.online) { sub.textContent = "Online"; sub.classList.add("is-online"); }
          else sub.textContent = current.with.lastSeen ? "Active " + UI.formatWhen(current.with.lastSeen) : "@" + current.with.username;
        }
        names.appendChild(sub);
        who.appendChild(names);
        head.appendChild(who);

        var acts = el("div", "msgs-head-acts");
        if (window.Calls && window.Calls.supported && window.Calls.supported()) {
          acts.appendChild(headBtn("phone", "Voice call", function () {
            window.Calls.start({ threadId: current.id, kind: "audio" });
          }, "is-call"));
          acts.appendChild(headBtn("video", "Video call", function () {
            window.Calls.start({ threadId: current.id, kind: "video" });
          }, "is-call"));
        }
        var infoBtn = headBtn("info", "Details", function () {
          info.hidden = !info.hidden;
          infoBtn.setAttribute("aria-pressed", info.hidden ? "false" : "true");
          if (!info.hidden) drawInfo();
        });
        infoBtn.setAttribute("aria-pressed", info.hidden ? "false" : "true");
        acts.appendChild(infoBtn);
        head.appendChild(acts);
      }

      /* ------------------------------------------------ details */

      function action(iconName, label, onClick, danger) {
        var b = el("button", "msgs-info-act" + (danger ? " is-danger" : ""));
        b.type = "button";
        b.appendChild(UI.icon(iconName));
        b.appendChild(el("span", null, label));
        b.addEventListener("click", onClick);
        return b;
      }

      function drawInfo() {
        info.innerHTML = "";
        if (!current) return;
        var close = headBtn("close", "Close details", function () { info.hidden = true; drawHead(); }, "msgs-info-x");
        info.appendChild(close);

        var top = el("div", "msgs-info-top");
        top.appendChild(current.isGroup ? Core.groupAvatar("lg") : Core.avatar(current.with, "lg"));
        top.appendChild(el("strong", null, current.title));
        if (!current.isGroup && current.with) top.appendChild(el("span", "dim", "@" + current.with.username));
        info.appendChild(top);

        var acts = el("div", "msgs-info-acts");
        if (current.isGroup) {
          if (current.owner) {
            acts.appendChild(action("edit", "Rename group", renameGroup));
            acts.appendChild(action("userPlus", "Add people", addPeople));
          }
          acts.appendChild(action("logout", "Leave group", leaveGroup, true));
        } else if (current.with) {
          var prof = el("a", "msgs-info-act");
          prof.href = "profile.html?u=" + encodeURIComponent(current.with.username);
          prof.appendChild(UI.icon("user"));
          prof.appendChild(el("span", null, "View profile"));
          acts.appendChild(prof);
          acts.appendChild(action("flag", "Report", reportUser, true));
        }
        info.appendChild(acts);

        if (current.isGroup && current.members && current.members.length) {
          info.appendChild(el("span", "label msgs-info-label", "Members · " + current.memberCount));
          var list = el("div", "msgs-members");
          var meRow = el("div", "msgs-member");
          var self = window.Session.user || {};
          meRow.appendChild(Core.avatar(self, "sm"));
          meRow.appendChild(el("span", "msgs-member-name", (self.displayName || self.username || "You") + " (you)"));
          list.appendChild(meRow);
          current.members.forEach(function (m) {
            var row = el("div", "msgs-member");
            var link = el("a", "msgs-member-link");
            link.href = "profile.html?u=" + encodeURIComponent(m.username);
            link.appendChild(Core.avatar(m, "sm"));
            var mn = el("span", "msgs-member-name", m.displayName || m.username);
            mn.appendChild(UI.userTags(m, { compact: true, noPlus: true }));
            link.appendChild(mn);
            row.appendChild(link);
            if (current.owner) {
              var x = headBtn("close", "Remove " + (m.displayName || m.username), function () {
                Core.confirm({
                  title: "Remove " + (m.displayName || m.username) + "?",
                  body: "They'll stop getting messages from this group.",
                  confirmLabel: "Remove", danger: true
                }).then(function (yes) {
                  if (!yes) return;
                  API.removeFromGroup(current.id, m.id)
                    .then(function () { UI.toast("Removed"); openThread(current.id); })
                    .catch(function (err) { UI.toast(err.message); });
                });
              }, "msgs-member-x");
              row.appendChild(x);
            }
            list.appendChild(row);
          });
          info.appendChild(list);
        }
      }

      function renameGroup() {
        Core.ask({ title: "Rename group", value: current.title, maxLength: 60, confirmLabel: "Rename" })
          .then(function (title) {
            if (!title) return;
            var id = current.id;
            API.renameGroup(id, title)
              .then(function () { UI.toast("Renamed"); openThread(id); })
              .catch(function (err) { UI.toast(err.message); });
          });
      }

      function addPeople() {
        var id = current.id;
        var existing = (current.members || []).map(function (m) { return m.username; });
        Core.pickFriends({ title: "Add people", confirmLabel: "Add", exclude: existing }).then(function (pick) {
          if (!pick) return;
          pick.usernames.reduce(function (chain, name) {
            return chain.then(function () { return API.addToGroup(id, name); });
          }, Promise.resolve()).then(function () {
            UI.toast(pick.usernames.length > 1 ? "Added " + pick.usernames.length + " people" : "Added");
            openThread(id);
          }).catch(function (err) { UI.toast(err.message); openThread(id); });
        });
      }

      function leaveGroup() {
        var id = current.id;
        Core.confirm({
          title: "Leave " + current.title + "?",
          body: "You won't get new messages from this group unless someone adds you back.",
          confirmLabel: "Leave", danger: true
        }).then(function (yes) {
          if (!yes) return;
          API.removeFromGroup(id, window.Session.user.id).then(function () {
            UI.toast("You left the group");
            closeThread();
            loadList();
          }).catch(function (err) { UI.toast(err.message); });
        });
      }

      function reportUser() {
        var name = current.with.username;
        Core.ask({
          title: "Report @" + name,
          hint: "Tell the moderators what's wrong. They'll see this conversation's context.",
          multiline: true, maxLength: 500, minLength: 4, confirmLabel: "Send report",
          placeholder: "What happened?"
        }).then(function (reason) {
          if (!reason) return;
          API.report("user", name, reason)
            .then(function () { UI.toast("Report sent. Thanks for letting us know."); })
            .catch(function (err) { UI.toast(err.message); });
        });
      }

      /* ----------------------------------------------------- boot */

      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || document.querySelector(".chat-sheet, .shot-view")) return;
        if (!info.hidden) { info.hidden = true; drawHead(); return; }
        if (current && shell.classList.contains("is-viewing") && window.innerWidth <= 760) closeThread();
      });

      skeletonList();
      loadList().then(function () {
        var params = UI.params();
        var wanted = params.get("thread");
        var who = params.get("u");
        if (params.get("new") === "group" || params.get("new") === "1") { startNew(); return; }
        if (wanted) {
          var t = threads.filter(function (x) { return x.id === Number(wanted); })[0];
          return openThread(wanted, t);
        }
        if (who) {
          return API.openThread(who)
            .then(function (res) { return loadList().then(function () { return res; }); })
            .then(function (res) {
              var t2 = threads.filter(function (x) { return x.id === res.threadId; })[0];
              return openThread(res.threadId, t2);
            })
            .catch(function (err) { UI.toast(err.message); });
        }
      });

      window.setInterval(function () { if (!document.hidden) loadList(); }, LIST_POLL);
      document.addEventListener("session:badges", function () { loadList(); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
