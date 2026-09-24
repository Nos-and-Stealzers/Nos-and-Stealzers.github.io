/* The full messages page: conversations and groups, with image attachments.
   The floating dock covers quick replies; this is where you manage groups. */
(function () {
  "use strict";

  var current = null;      // { id, title, isGroup, owner, members, canSend }
  var lastId = 0;
  var poll = null;
  var pending = null;      // staged image awaiting send
  var drafts = Object.create(null);
  var activeId = null;
  var sending = Object.create(null);
  var openSeq = 0;         // guards against a slow open() landing after a newer one

  function init() {
    window.SocialUI.gate(function () {
      var UI = window.UI;
      var S = window.SocialUI;
      var API = window.API;

      var listHost = document.getElementById("thread-list");
      var log = document.getElementById("log");
      var head = document.getElementById("dm-head");
      var compose = document.getElementById("compose");
      var bodyBox = document.getElementById("body");
      var sendBtn = document.getElementById("send");
      var locked = document.getElementById("locked");
      var searchBox = document.getElementById("thread-search");
      var allThreads = [];

      /* ---------------------------------------------------- thread list */

      function drawList(threads) {
        listHost.innerHTML = "";

        var top = UI.el("div", "dock-actions");
        var mk = UI.el("button", "btn btn-sm btn-cta", "");
        mk.type = "button";
        mk.appendChild(UI.icon("plus"));
        mk.appendChild(UI.el("span", null, "New group"));
        mk.addEventListener("click", newGroup);
        top.appendChild(mk);
        var fr = UI.el("a", "btn btn-sm btn-flat", "Friends");
        fr.href = "friends.html";
        top.appendChild(fr);
        listHost.appendChild(top);

        if (!allThreads.length) {
          var v = UI.el("div", "void");
          v.appendChild(UI.el("strong", null, "No conversations"));
          v.appendChild(UI.el("p", null, "Add a friend, then start one."));
          listHost.appendChild(v);
          return;
        }

        if (!threads.length) {
          var nv = UI.el("div", "void");
          nv.appendChild(UI.el("strong", null, "No matches"));
          nv.appendChild(UI.el("p", null, "No conversations match your search."));
          listHost.appendChild(nv);
          return;
        }

        threads.forEach(function (t) {
          var b = UI.el("button", "dm-item");
          b.type = "button";
          if (current && current.id === t.id) b.classList.add("on");

          if (t.isGroup) {
            var g = UI.el("span", "group-glyph");
            g.appendChild(UI.icon("group"));
            b.appendChild(g);
          } else if (t.with) {
            b.appendChild(S.avatar(t.with));
          }

          var mid = UI.el("span", "dm-item-mid");
          var name = UI.el("span", "dm-item-top");
          name.textContent = t.title;
          mid.appendChild(name);
          var prev = UI.el("span", "dm-item-prev");
          prev.textContent = t.preview
            ? (t.preview.mine ? "You: " : (t.isGroup ? t.preview.who + ": " : "")) + t.preview.body
            : "No messages yet";
          mid.appendChild(prev);
          b.appendChild(mid);

          var right = UI.el("span", "dm-item-right");
          right.appendChild(UI.el("span", "dm-when", UI.formatWhen(t.lastAt)));
          if (t.unread) right.appendChild(UI.el("span", "badge", String(t.unread)));
          b.appendChild(right);

          b.addEventListener("click", function () { open(t.id); });
          listHost.appendChild(b);
        });
      }

      var statusEl = document.getElementById("thread-status");
      var retryEl = document.getElementById("thread-retry");
      if (retryEl) retryEl.addEventListener("click", function () { loadList(); });

      function filteredThreads() {
        var q = (searchBox && searchBox.value || "").trim().toLowerCase();
        if (!q) return allThreads;
        return allThreads.filter(function (t) {
          return (t.title || "").toLowerCase().indexOf(q) !== -1;
        });
      }

      if (searchBox) {
        searchBox.addEventListener("input", function () {
          drawList(filteredThreads());
        });
      }

      function loadList() {
        if (statusEl) { statusEl.hidden = false; statusEl.textContent = "Loading conversations…"; }
        if (retryEl) retryEl.hidden = true;
        return API.threads()
          .then(function (res) {
            if (statusEl) statusEl.hidden = true;   // loaded — hide the notice
            if (retryEl) retryEl.hidden = true;
            allThreads = res.threads;
            drawList(filteredThreads());
            return res.threads;
          })
          .catch(function (err) {
            /* Show the real failure and a working Retry instead of a permanent
               "Loading…" that looks like the whole feature is dead. */
            if (statusEl) {
              statusEl.hidden = false;
              statusEl.textContent = (err && err.message) || "Couldn't load conversations.";
            }
            if (retryEl) retryEl.hidden = false;
            return [];
          });
      }

      /* --------------------------------------------------------- header */

      function drawHead(data) {
        head.innerHTML = "";
        /* The strip lives outside `head`, so clearing head doesn't take it
           with it — and switching conversations quickly used to stack one
           group's members under the next one's title. */
        var stale = head.parentNode.querySelector(".member-strip");
        if (stale) stale.remove();

        if (data.isGroup) {
          var block = UI.el("div", "group-head");
          var glyph = UI.el("span", "group-glyph");
          glyph.appendChild(UI.icon("group"));
          block.appendChild(glyph);
          var names = UI.el("span", "names");
          var n1 = UI.el("span", "n1");
          n1.textContent = data.title;
          names.appendChild(n1);
          var n2 = UI.el("span", "n2");
          n2.textContent = data.memberCount + " people";
          names.appendChild(n2);
          block.appendChild(names);
          head.appendChild(block);
        } else if (data.with) {
          var link = UI.el("a", "dm-who");
          link.href = "profile.html?u=" + encodeURIComponent(data.with.username);
          link.appendChild(S.avatar(data.with));
          link.appendChild(S.nameBlock(data.with, { presence: true }));
          head.appendChild(link);
        }

        var spacer = UI.el("span");
        spacer.style.flex = "1";
        head.appendChild(spacer);

        /* Calling was reachable from the floating dock and from a profile,
           but not from the page whose entire job is this conversation. */
        if (window.Calls && window.Calls.supported()) {
          [["phone", "Call", "audio"], ["video", "Video", "video"]]
            .forEach(function (spec) {
              var b = UI.el("button", "btn btn-sm dm-call-btn");
              b.type = "button";
              b.title = spec[1];
              b.setAttribute("aria-label", spec[1]);
              b.appendChild(UI.icon(spec[0]));
              b.appendChild(UI.el("span", null, spec[1]));
              b.addEventListener("click", function () {
                window.Calls.start({ threadId: data.id, kind: spec[2] });
              });
              head.appendChild(b);
            });
        }

        if (data.isGroup) {
          if (data.owner) {
            head.appendChild(button("Rename", function () {
              var title = window.prompt("Group name (60 characters max)", data.title);
              if (!title || !title.trim()) return;
              title = title.trim();
              if (title.length > 60) {
                title = title.slice(0, 60);
                UI.toast("Trimmed to 60 characters");
              }
              API.renameGroup(data.id, title)
                .then(function () { UI.toast("Renamed"); open(data.id); })
                .catch(function (err) { UI.toast(err.message); });
            }));
            head.appendChild(button("Add", function () { addToGroup(data); }));
          }
          head.appendChild(button("Leave", function () {
            if (!window.confirm("Leave " + data.title + "?")) return;
            API.removeFromGroup(data.id, window.Session.user.id)
              .then(function () {
                UI.toast("Left the group");
                current = null;
                document.getElementById("dm-open").hidden = true;
                document.getElementById("dm-empty").hidden = false;
                loadList();
              })
              .catch(function (err) { UI.toast(err.message); });
          }));
        } else if (data.with) {
          head.appendChild(button("Report", function () {
            var reason = window.prompt("What's wrong with this conversation?");
            if (!reason || reason.trim().length < 4) return;
            API.report("user", data.with.username, reason.trim())
              .then(function () { UI.toast("Report sent to the moderators"); })
              .catch(function (err) { UI.toast(err.message); });
          }));
        }

        if (data.isGroup && data.members && data.members.length) {
          var strip = UI.el("div", "member-strip");
          data.members.forEach(function (m) {
            var chip = UI.el("span", "chip-person");
            chip.appendChild(S.avatar(m));
            var who = UI.el("span");
            who.textContent = m.displayName || m.username;
            chip.appendChild(who);
            if (data.owner) {
              var x = UI.el("button", null, "");
              x.type = "button";
              x.title = "Remove from group";
              x.setAttribute("aria-label", "Remove " + m.username);
              x.appendChild(UI.icon("close"));
              x.addEventListener("click", function () {
                if (!window.confirm("Remove " + m.username + " from the group?")) return;
                API.removeFromGroup(data.id, m.id)
                  .then(function () { open(data.id); })
                  .catch(function (err) { UI.toast(err.message); });
              });
              chip.appendChild(x);
            }
            strip.appendChild(chip);
          });
          head.parentNode.insertBefore(strip, head.nextSibling);
        }
      }

      function button(label, onClick) {
        var b = UI.el("button", "btn btn-sm btn-flat", label);
        b.type = "button";
        b.addEventListener("click", onClick);
        return b;
      }

      /* ------------------------------------------------------- messages */

      function addMessages(list) {
        list.forEach(function (m) {
          if (m.id <= lastId) return;
          lastId = Math.max(lastId, m.id);

          var row = UI.el("div", "bubble-row" + (m.mine ? " mine" : ""));

          if (!m.mine && current && current.isGroup) {
            var who = UI.el("span", "dock-who");
            who.textContent = m.from ? (m.from.displayName || m.from.username) : "";
            row.appendChild(who);
          }

          var bubble = UI.el("div", "bubble" + (m.deleted ? " gone" : ""));
          if (m.image) {
            var img = document.createElement("img");
            img.className = "chat-img";
            img.alt = m.image.kind === "screenshot" ? "Shared screenshot" : "Shared image";
            UI.attachImage(img, m.image);
            img.loading = "lazy";
            img.style.maxWidth = "100%";
            img.style.display = "block";
            img.style.marginBottom = m.body ? "0.4rem" : "0";
            img.style.cursor = "zoom-in";
            bubble.appendChild(img);
          }
          if (m.deleted) bubble.appendChild(document.createTextNode("message removed"));
          else if (m.body) {
            var text = UI.el("span");
            text.textContent = m.body;      // untrusted
            bubble.appendChild(text);
          }
          row.appendChild(bubble);

          var meta = UI.el("span", "bubble-meta");
          meta.textContent = UI.formatWhen(m.at);
          if (m.mine && !m.deleted) {
            var x = UI.el("button", "bubble-x", "×");
            x.type = "button";
            x.title = "Delete this message";
            x.setAttribute("aria-label", "Delete this message");
            x.addEventListener("click", function () {
              API.deleteMessage(m.id).then(function () {
                bubble.classList.add("gone");
                bubble.innerHTML = "";
                bubble.textContent = "message removed";
                x.remove();
              }).catch(function (err) { UI.toast(err.message); });
            });
            meta.appendChild(x);
          }
          row.appendChild(meta);
          log.appendChild(row);
        });
      }

      /* ---------------------------------------------------- realtime */

      /* Instant delivery: subscribe to the open thread's channel. When the
         other side posts, they poke this channel and we pull the new messages
         at once instead of on the next 5s poll. Polling stays as fallback. */
      var threadSub = null;
      var subbedThread = null;
      function subscribeThread(id) {
        if (!window.Realtime) return;
        if (subbedThread === id) return;
        if (threadSub) { threadSub(); threadSub = null; }
        subbedThread = id;
        threadSub = window.Realtime.subscribe("realtime:thread:" + id, {
          msg: function () { tick(); loadList(); }
        });
      }
      function pokeThread(id) {
        if (window.Realtime) window.Realtime.broadcast("realtime:thread:" + id, "msg", {});
      }
      /* Also nudge each OTHER member's personal channel so their notification
         bell / unread badge lights up instantly, even when they don't have this
         thread open. Without this, the message arrived live in an open chat but
         the badge only updated on the 30s poll. */
      function pokeMembers() {
        if (!window.Realtime || !current || !current.members) return;
        var meId = window.Session && window.Session.user && window.Session.user.id;
        current.members.forEach(function (m) {
          if (m && m.id && m.id !== meId) window.Realtime.pokeUser(m.id, "notify");
        });
      }

      function open(id) {
        if (activeId != null) drafts[activeId] = { text: bodyBox.value, image: pending };
        activeId = id;
        var draft = drafts[id] || { text: "", image: null };
        bodyBox.value = draft.text;
        pending = draft.image;
        drawPending();
        current = null;
        compose.hidden = true;
        sendBtn.disabled = !!sending[id];
        window.clearInterval(poll);
        lastId = 0;
        log.innerHTML = "";
        head.innerHTML = "";
        var strip = document.querySelector(".member-strip");
        if (strip) strip.remove();

        document.getElementById("dm-empty").hidden = true;
        document.getElementById("dm-open").hidden = false;
        /* On phones the list and the conversation occupy the same screen; adding
           this class slides the panel into view and reveals the back button. */
        document.getElementById("dm").classList.add("dm-viewing");

        /* A fast click to a second thread must win over a slow response for
           the first one — without this token, switching quickly could paint
           an abandoned thread's messages into the conversation you're now
           actually looking at. */
        var seq = ++openSeq;

        return API.thread(id).then(function (res) {
          if (seq !== openSeq) return;
          current = {
            id: res.threadId, title: res.title, isGroup: res.isGroup,
            owner: res.owner, members: res.members, canSend: res.canSend,
            with: res.with, memberCount: res.memberCount
          };
          drawHead(current);
          addMessages(res.messages);
          log.scrollTop = log.scrollHeight;

          locked.hidden = res.canSend;
          compose.hidden = !res.canSend;
          /* The backend says *why* — a block, a suspension and a friends-only
             setting are three different problems with three different fixes,
             and one generic line told you which of them applied: none. */
          if (!res.canSend) {
            locked.textContent = res.lockedReason ||
              "You can't send messages in this conversation.";
          }

          UI.setParams({ thread: res.threadId }, true);
          loadList();
          window.Session.refreshBadges();
          poll = window.setInterval(tick, 5000);
          subscribeThread(res.threadId);
        }).catch(function (err) {
          if (seq !== openSeq) return;
          UI.toast(err.message);
          current = null;
          head.innerHTML = "";
          var stale = document.querySelector(".member-strip");
          if (stale) stale.remove();
          document.getElementById("dm-open").hidden = true;
          document.getElementById("dm-empty").hidden = false;
        });
      }

      var ticking = null;
      function tick() {
        if (!current || ticking === openSeq || document.hidden) return;
        var seq = openSeq;
        ticking = seq;
        API.thread(current.id, lastId).then(function (res) {
          if (seq !== openSeq || !current) return;
          if (!res.messages.length) return;
          var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
          addMessages(res.messages);
          if (atBottom) log.scrollTop = log.scrollHeight;
          loadList();
          window.Session.refreshBadges();
        }).catch(function () { /* retry on next poll */ }).then(function () {
          if (ticking === seq) ticking = null;
        });
      }

      /* ------------------------------------------------------ attaching */

      function stage(grab) {
        grab().then(function (shot) {
          pending = shot;
          drawPending();
        }).catch(function (err) {
          if (err && /cancel|Permission|denied|abort/i.test(err.message || "")) return;
          UI.toast(err.message || "Capture failed");
        });
      }

      function drawPending() {
        var old = document.querySelector(".dm-pending");
        if (old) old.remove();
        if (!pending) return;

        var wrap = UI.el("div", "dock-pending dm-pending");
        var img = document.createElement("img");
        img.src = pending.dataUrl;
        img.alt = "Attachment preview";
        wrap.appendChild(img);
        var x = UI.el("button", "dock-pending-x", "");
        x.type = "button";
        x.setAttribute("aria-label", "Remove attachment");
        x.appendChild(UI.icon("close"));
        x.addEventListener("click", function () { pending = null; drawPending(); });
        wrap.appendChild(x);
        compose.parentNode.insertBefore(wrap, compose);
      }

      var tools = UI.el("div", "dock-tools");
      [
        ["screenshot", "Screenshot", function () { return window.Capture.screenshot(); }],
        ["camera", "Photo", function () { return window.Capture.cameraDialog(); }],
        ["image", "Image", function () { return window.Capture.fromFile(); }]
      ].forEach(function (spec) {
        var b = UI.el("button", "dock-tool");
        b.type = "button";
        b.title = spec[1];
        b.setAttribute("aria-label", spec[1]);
        b.appendChild(UI.icon(spec[0]));
        b.appendChild(UI.el("span", "dock-tool-lbl", spec[1]));
        b.addEventListener("click", function () { stage(spec[2]); });
        tools.appendChild(b);
      });
      compose.insertBefore(tools, compose.firstChild);

      /* -------------------------------------------------------- sending */

      function submit(event) {
        if (event) event.preventDefault();
        var text = bodyBox.value.trim();
        if ((!text && !pending) || !current || !current.canSend || sending[current.id]) return;

        var id = current.id;
        var original = bodyBox.value;
        var image = pending;
        sending[id] = true;
        sendBtn.disabled = true;

        API.send(id, text, image).then(function (res) {
          pokeThread(id);
          pokeMembers();
          var saved = drafts[id];
          if (saved && saved.text === original) saved.text = "";
          if (saved && saved.image === image) saved.image = null;
          if (activeId === id) {
            if (bodyBox.value === original) bodyBox.value = "";
            if (pending === image) pending = null;
            drawPending();
            if (current && current.id === id) {
              addMessages([res.message]);
              log.scrollTop = log.scrollHeight;
            }
          }
          loadList();
        }).catch(function (err) {
          UI.toast(err.message);
        }).then(function () {
          delete sending[id];
          if (activeId === id) sendBtn.disabled = false;
        });
      }

      compose.addEventListener("submit", submit);
      bodyBox.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(); }
      });
      bodyBox.addEventListener("input", function () {
        bodyBox.style.height = "auto";
        bodyBox.style.height = Math.min(bodyBox.scrollHeight, 160) + "px";
      });

      /* --------------------------------------------------------- groups */

      /* Shared by "New group" and "Add to group": pick one or more friends
         from a sheet rather than typing a raw username blind. `opts.showName`
         adds the group-name field new-group needs; `opts.exclude` drops
         friends already in the group so add-to-group only offers people who
         can actually be added. */
      function pickFriends(title, onDone, opts) {
        opts = opts || {};
        var exclude = opts.exclude || [];
        API.friends().then(function (data) {
          var available = data.friends.filter(function (u) {
            return exclude.indexOf(u.username) === -1;
          });
          if (!data.friends.length) {
            UI.toast("Add a friend first — groups are friends only");
            return;
          }
          if (!available.length) {
            UI.toast("Everyone you can add is already in this group");
            return;
          }
          var chosen = [];
          var sheet = UI.el("div", "sheet");
          var card = UI.el("div", "sheet-card");

          var h = UI.el("div", "sheet-head");
          h.appendChild(UI.el("span", "label", title));
          var close = UI.el("button", "btn btn-sq", "");
          close.type = "button";
          close.setAttribute("aria-label", "Close");
          close.appendChild(UI.icon("close"));
          close.addEventListener("click", function () { sheet.remove(); });
          h.appendChild(close);
          card.appendChild(h);

          var body = UI.el("div", "sheet-body");
          var nameInput = null;
          if (opts.showName) {
            var nameField = UI.el("div", "field");
            var label = UI.el("label", null, "Group name");
            label.setAttribute("for", "group-name");
            nameField.appendChild(label);
            nameInput = UI.el("input");
            nameInput.id = "group-name";
            nameInput.type = "text";
            nameInput.maxLength = 60;
            nameInput.placeholder = "Squad";
            nameField.appendChild(nameInput);
            body.appendChild(nameField);
          }

          var picked = UI.el("div", "picker");
          body.appendChild(picked);

          var people = UI.el("div", "people");
          available.forEach(function (u) {
            people.appendChild(S.person(u, {
              presence: false,
              actions: [{
                label: "Add", onClick: function () {
                  if (chosen.indexOf(u.username) !== -1) return;
                  chosen.push(u.username);
                  redrawPicked();
                }
              }]
            }));
          });
          body.appendChild(people);

          function redrawPicked() {
            picked.innerHTML = "";
            chosen.forEach(function (name) {
              var chip = UI.el("span", "chip-person");
              var who = UI.el("span");
              who.textContent = name;
              chip.appendChild(who);
              var x = UI.el("button", null, "");
              x.type = "button";
              x.setAttribute("aria-label", "Remove " + name);
              x.appendChild(UI.icon("close"));
              x.addEventListener("click", function () {
                chosen = chosen.filter(function (n) { return n !== name; });
                redrawPicked();
              });
              chip.appendChild(x);
              picked.appendChild(chip);
            });
          }

          var go = UI.el("button", "btn btn-cta", opts.buttonLabel || "Create group");
          go.type = "button";
          go.style.width = "100%";
          go.style.marginTop = "0.9rem";
          go.addEventListener("click", function () {
            if (!chosen.length) { UI.toast("Pick at least one friend"); return; }
            go.disabled = true;
            onDone(nameInput ? nameInput.value.trim() : "", chosen,
                   function () { sheet.remove(); },
                   function () { go.disabled = false; });
          });
          body.appendChild(go);

          card.appendChild(body);
          sheet.appendChild(card);
          sheet.addEventListener("click", function (e) { if (e.target === sheet) sheet.remove(); });
          document.body.appendChild(sheet);
          (nameInput || go).focus();
        }).catch(function (err) { UI.toast(err.message); });
      }

      function newGroup() {
        pickFriends("New group", function (title, usernames, done, fail) {
          API.createGroup(title, usernames).then(function (res) {
            done();
            UI.toast("Group created");
            loadList().then(function () { open(res.thread.id); });
          }).catch(function (err) { UI.toast(err.message); fail(); });
        }, { showName: true, buttonLabel: "Create group" });
      }

      function addToGroup(data) {
        var existing = (data.members || []).map(function (m) { return m.username; });
        pickFriends("Add to " + data.title, function (title, usernames, done, fail) {
          usernames.reduce(function (chain, name) {
            return chain.then(function () { return API.addToGroup(data.id, name); });
          }, Promise.resolve()).then(function () {
            done();
            UI.toast(usernames.length > 1 ? "Added " + usernames.length + " people" : "Added");
            open(data.id);
          }).catch(function (err) { UI.toast(err.message); fail(); });
        }, { showName: false, buttonLabel: "Add to group", exclude: existing });
      }

      /* ----------------------------------------------------------- boot */

      /* Mobile back button: return to the conversation list without dropping
         the open conversation's poll — just re-show the list pane. */
      var backBtn = document.getElementById("dm-back");
      if (backBtn) {
        backBtn.addEventListener("click", function () {
          document.getElementById("dm").classList.remove("dm-viewing");
        });
      }

      loadList().then(function () {
        var params = UI.params();
        if (params.get("new") === "group") { newGroup(); return; }
        var wanted = params.get("thread");
        var who = params.get("u");
        if (wanted) return open(Number(wanted));
        if (who) {
          return API.openThread(who)
            .then(function (res) { return open(res.threadId); })
            .catch(function (err) { UI.toast(err.message); });
        }
      });

      window.setInterval(loadList, 20000);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
