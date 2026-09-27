/* Chat engine shared by the floating dock and the full Messages page.

   Both surfaces used to carry their own copy of "render a conversation,
   poll it, send into it" and the two drifted apart (different bugs in each).
   Everything conversation-shaped now lives here once:

     ChatCore.conversation(opts)  — a live conversation view: message log,
                                    typing indicator, composer, attachments.
     ChatCore.threadList(host, …) — the conversation list rows.
     ChatCore.newChat()           — "start a conversation" friend picker.
     ChatCore.ask / .confirm      — small in-page dialogs (no window.prompt).

   Every value that came from another user is written with textContent or as
   a text node — never innerHTML — so names and messages can't inject markup. */
(function () {
  "use strict";

  var POLL_LIVE = 5000;          // open conversation, realtime not connected
  var POLL_SOCKET = 15000;       // open conversation, realtime connected (safety net only)
  var GROUP_GAP = 5 * 60 * 1000; // consecutive messages within this join one group
  var TYPING_SEND_EVERY = 2500;
  var TYPING_SHOW_FOR = 4000;
  var MAX_LEN = 2000;

  function UI() { return window.UI; }
  function el(tag, cls, text) { return window.UI.el(tag, cls, text); }
  function icon(name, cls) { return window.UI.icon(name, cls); }
  function me() { return (window.Session && window.Session.user) || {}; }

  /* ------------------------------------------------------------ helpers */

  function sameDay(a, b) {
    var x = new Date(a), y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() &&
           x.getDate() === y.getDate();
  }

  function dayLabel(ts) {
    var now = Date.now();
    if (sameDay(ts, now)) return "Today";
    if (sameDay(ts, now - 86400000)) return "Yesterday";
    var d = new Date(ts);
    var opts = { weekday: "long", month: "short", day: "numeric" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString(undefined, opts);
  }

  function clock(ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  /* Short relative stamp for the conversation list. */
  function listWhen(ts) {
    if (!ts) return "";
    if (sameDay(ts, Date.now())) return clock(ts);
    if (Date.now() - ts < 6 * 86400000) {
      return new Date(ts).toLocaleDateString(undefined, { weekday: "short" });
    }
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  /* Text with bare http(s) links made clickable. Built from text nodes and
     anchors only; the href is re-checked so nothing but http(s) gets through. */
  var URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  function richText(body) {
    var frag = document.createDocumentFragment();
    var last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(body))) {
      if (m.index > last) frag.appendChild(document.createTextNode(body.slice(last, m.index)));
      var a = document.createElement("a");
      a.textContent = m[0];
      try {
        var u = new URL(m[0]);
        if (u.protocol === "http:" || u.protocol === "https:") {
          a.href = u.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer nofollow";
        }
      } catch (e) { /* leave as plain text-looking anchor with no href */ }
      frag.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < body.length) frag.appendChild(document.createTextNode(body.slice(last)));
    return frag;
  }

  /* One to three emoji and nothing else reads better big. */
  function emojiOnly(body) {
    if (!body || body.length > 16) return false;
    try {
      return /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(body) &&
             !/^[\d#*\s]+$/.test(body);
    } catch (e) { return false; }
  }

  function avatarFor(user, size) {
    if (window.SocialUI && window.SocialUI.avatar) return window.SocialUI.avatar(user || {}, size);
    var s = el("span", "avatar" + (size ? " avatar-" + size : ""));
    s.appendChild(window.Art.avatar((user && user.username) || "?"));
    return s;
  }

  function groupAvatar(size) {
    var g = el("span", "chat-group-av" + (size ? " is-" + size : ""));
    g.appendChild(icon("group"));
    return g;
  }

  /* Drafts survive a reload and follow you between the dock and the page. */
  var drafts = {
    get: function (id) {
      try { return window.localStorage.getItem("ach:draft:" + id) || ""; } catch (e) { return ""; }
    },
    set: function (id, text) {
      try {
        if (text) window.localStorage.setItem("ach:draft:" + id, text);
        else window.localStorage.removeItem("ach:draft:" + id);
      } catch (e) { /* private mode */ }
    }
  };

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* nothing */ }
    ta.remove();
    return Promise.resolve();
  }

  /* ------------------------------------------------------------ dialogs */

  function sheet(title) {
    var root = el("div", "sheet chat-sheet");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", title);
    var card = el("div", "sheet-card");
    var head = el("div", "sheet-head");
    head.appendChild(el("strong", "chat-sheet-title", title));
    var x = el("button", "btn btn-sq btn-flat");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.appendChild(icon("close"));
    head.appendChild(x);
    card.appendChild(head);
    var body = el("div", "sheet-body");
    card.appendChild(body);
    root.appendChild(card);

    var closed = false;
    var onClose = null;
    var lastFocus = document.activeElement;
    function close() {
      if (closed) return;
      closed = true;
      root.remove();
      document.removeEventListener("keydown", onKey, true);
      if (onClose) onClose();
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    }
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    }
    x.addEventListener("click", close);
    root.addEventListener("mousedown", function (e) { if (e.target === root) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(root);
    return {
      root: root, body: body, close: close,
      onClose: function (fn) { onClose = fn; }
    };
  }

  /* Promise<string|null> — a single text field. */
  function ask(opts) {
    return new Promise(function (resolve) {
      var s = sheet(opts.title || "");
      var done = false;
      s.onClose(function () { if (!done) resolve(null); });
      var form = el("form", "chat-ask");
      if (opts.hint) form.appendChild(el("p", "dim chat-ask-hint", opts.hint));
      var input = document.createElement(opts.multiline ? "textarea" : "input");
      if (!opts.multiline) input.type = "text";
      else input.rows = 3;
      input.className = "chat-ask-input";
      input.value = opts.value || "";
      input.maxLength = opts.maxLength || 200;
      input.placeholder = opts.placeholder || "";
      input.setAttribute("aria-label", opts.label || opts.title || "");
      form.appendChild(input);
      var row = el("div", "btn-row chat-ask-row");
      var cancel = el("button", "btn btn-flat", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", function () { s.close(); });
      var ok = el("button", "btn btn-cta", opts.confirmLabel || "Save");
      ok.type = "submit";
      row.appendChild(cancel);
      row.appendChild(ok);
      form.appendChild(row);
      function sync() {
        var v = input.value.trim();
        ok.disabled = v.length < (opts.minLength || 1);
      }
      input.addEventListener("input", sync);
      sync();
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var v = input.value.trim();
        if (v.length < (opts.minLength || 1)) return;
        done = true;
        s.close();
        resolve(v);
      });
      s.body.appendChild(form);
      input.focus();
      if (input.select) input.select();
    });
  }

  /* Promise<boolean>. */
  function confirmBox(opts) {
    return new Promise(function (resolve) {
      var s = sheet(opts.title || "Are you sure?");
      var done = false;
      s.onClose(function () { if (!done) resolve(false); });
      if (opts.body) s.body.appendChild(el("p", "dim chat-ask-hint", opts.body));
      var row = el("div", "btn-row chat-ask-row");
      var cancel = el("button", "btn btn-flat", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", function () { s.close(); });
      var ok = el("button", "btn " + (opts.danger ? "btn-danger" : "btn-cta"), opts.confirmLabel || "OK");
      ok.type = "button";
      ok.addEventListener("click", function () { done = true; s.close(); resolve(true); });
      row.appendChild(cancel);
      row.appendChild(ok);
      s.body.appendChild(row);
      ok.focus();
    });
  }

  /* ---------------------------------------------------- friend picker */

  /* Pick one or more friends. Resolves { usernames, title } or null.
     opts: { title, confirmLabel, exclude:[usernames], groupName:bool, single:bool } */
  function pickFriends(opts) {
    opts = opts || {};
    return window.API.friends().then(function (data) {
      var exclude = opts.exclude || [];
      var all = (data.friends || []).filter(function (u) { return exclude.indexOf(u.username) === -1; });
      if (!(data.friends || []).length) {
        return confirmBox({
          title: "No friends yet",
          body: "Chats are between friends. Find someone by username or friend code first.",
          confirmLabel: "Find friends"
        }).then(function (go) {
          if (go) window.location.href = "friends.html";
          return null;
        });
      }
      if (!all.length) { UI().toast("Everyone you can add is already here"); return null; }

      return new Promise(function (resolve) {
        var s = sheet(opts.title || "New conversation");
        var done = false;
        s.onClose(function () { if (!done) resolve(null); });
        var chosen = [];

        var nameInput = null;
        if (opts.groupName) {
          nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.maxLength = 60;
          nameInput.className = "chat-ask-input chat-group-name";
          nameInput.placeholder = "Group name (optional)";
          nameInput.setAttribute("aria-label", "Group name");
          nameInput.hidden = true;
          s.body.appendChild(nameInput);
        }

        var search = document.createElement("input");
        search.type = "search";
        search.className = "chat-ask-input";
        search.placeholder = "Search friends";
        search.setAttribute("aria-label", "Search friends");
        s.body.appendChild(search);

        var list = el("div", "chat-pick-list");
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-multiselectable", opts.single ? "false" : "true");
        s.body.appendChild(list);

        var go = el("button", "btn btn-cta chat-pick-go");
        go.type = "button";
        s.body.appendChild(go);

        function label() {
          if (opts.confirmLabel) return opts.confirmLabel + (chosen.length > 1 ? " (" + chosen.length + ")" : "");
          if (chosen.length <= 1) return "Start chat";
          return "Create group (" + (chosen.length + 1) + " people)";
        }
        function sync() {
          go.textContent = label();
          go.disabled = !chosen.length;
          if (nameInput) nameInput.hidden = chosen.length < 2;
        }

        function draw() {
          var q = search.value.trim().toLowerCase();
          list.innerHTML = "";
          var shown = all.filter(function (u) {
            return !q || u.username.toLowerCase().indexOf(q) !== -1 ||
                   (u.displayName || "").toLowerCase().indexOf(q) !== -1;
          });
          if (!shown.length) { list.appendChild(el("p", "dim chat-pick-empty", "No friends match that.")); return; }
          shown.forEach(function (u) {
            var row = el("button", "chat-pick");
            row.type = "button";
            row.setAttribute("role", "option");
            var on = chosen.indexOf(u.username) !== -1;
            row.setAttribute("aria-selected", on ? "true" : "false");
            row.appendChild(avatarFor(u));
            var names = el("span", "chat-pick-names");
            var n1 = el("span", "chat-pick-n1", u.displayName || u.username);
            n1.appendChild(window.UI.userTags(u, { compact: true, noPlus: true }));
            names.appendChild(n1);
            names.appendChild(el("span", "chat-pick-n2", "@" + u.username + (u.online ? " · online" : "")));
            row.appendChild(names);
            var tick = el("span", "chat-pick-tick");
            tick.appendChild(icon("check"));
            row.appendChild(tick);
            row.addEventListener("click", function () {
              if (opts.single) chosen = [u.username];
              else if (on) chosen = chosen.filter(function (n) { return n !== u.username; });
              else chosen.push(u.username);
              draw();
              sync();
              if (opts.single) finish();
            });
            list.appendChild(row);
          });
        }

        function finish() {
          if (!chosen.length) return;
          done = true;
          s.close();
          resolve({ usernames: chosen.slice(), title: nameInput ? nameInput.value.trim() : "" });
        }

        search.addEventListener("input", draw);
        go.addEventListener("click", finish);
        draw();
        sync();
        search.focus();
      });
    });
  }

  /* Start a conversation: one friend opens (or reuses) the DM, several make
     a group. Resolves the thread id, or null when cancelled. */
  function newChat() {
    return pickFriends({ groupName: true }).then(function (pick) {
      if (!pick) return null;
      if (pick.usernames.length === 1) {
        return window.API.openThread(pick.usernames[0]).then(function (r) { return r.threadId; });
      }
      return window.API.createGroup(pick.title, pick.usernames).then(function (r) {
        UI().toast("Group created");
        return r.thread.id;
      });
    }).catch(function (err) {
      UI().toast((err && err.message) || "Couldn't start that conversation");
      return null;
    });
  }

  /* ------------------------------------------------------- thread list */

  /* Renders conversation rows into `host`.
     opts: { activeId, query, onPick(thread), compact } */
  function threadList(host, threads, opts) {
    opts = opts || {};
    host.innerHTML = "";
    var q = (opts.query || "").trim().toLowerCase();
    var shown = !q ? threads : threads.filter(function (t) {
      if ((t.title || "").toLowerCase().indexOf(q) !== -1) return true;
      return (t.members || []).some(function (m) {
        return (m.username || "").toLowerCase().indexOf(q) !== -1;
      });
    });

    if (!threads.length) {
      var empty = el("div", "chat-empty");
      var art = el("span", "chat-empty-art");
      art.appendChild(icon("chat"));
      empty.appendChild(art);
      empty.appendChild(el("strong", null, "No conversations yet"));
      empty.appendChild(el("p", null, "Say hi to a friend — start a chat or make a group."));
      if (opts.onNew) {
        var b = el("button", "btn btn-cta btn-sm", "");
        b.type = "button";
        b.appendChild(icon("plus"));
        b.appendChild(el("span", null, "New chat"));
        b.addEventListener("click", opts.onNew);
        empty.appendChild(b);
      }
      host.appendChild(empty);
      return;
    }
    if (!shown.length) {
      var none = el("div", "chat-empty is-small");
      none.appendChild(el("strong", null, "No matches"));
      none.appendChild(el("p", null, "Nothing matches “" + opts.query.trim() + "”."));
      host.appendChild(none);
      return;
    }

    shown.forEach(function (t) {
      var row = el("button", "chat-row" + (t.unread ? " is-unread" : "") +
                   (opts.activeId === t.id ? " is-active" : ""));
      row.type = "button";
      row.dataset.thread = t.id;
      if (opts.activeId === t.id) row.setAttribute("aria-current", "true");

      row.appendChild(t.isGroup ? groupAvatar() : avatarFor(t.with));

      var mid = el("span", "chat-row-mid");
      var top = el("span", "chat-row-top");
      var nm = el("span", "chat-row-name");
      nm.appendChild(el("span", "chat-row-title", t.title));
      if (!t.isGroup && t.with) nm.appendChild(window.UI.userTags(t.with, { compact: true, noPlus: true }));
      top.appendChild(nm);
      top.appendChild(el("span", "chat-row-when", listWhen(t.lastAt)));
      mid.appendChild(top);

      var bottom = el("span", "chat-row-bottom");
      var prev = el("span", "chat-row-prev");
      if (t.preview) {
        var who = t.preview.mine ? "You: " : (t.isGroup && t.preview.who ? t.preview.who + ": " : "");
        prev.textContent = who + (t.preview.body || "Sent a photo");
      } else {
        prev.textContent = t.isGroup ? t.memberCount + " people" : "Say hi 👋";
        prev.classList.add("is-muted");
      }
      bottom.appendChild(prev);
      if (t.unread) {
        var n = el("span", "chat-unread", t.unread > 99 ? "99+" : String(t.unread));
        n.setAttribute("aria-label", t.unread + " unread");
        bottom.appendChild(n);
      }
      mid.appendChild(bottom);
      row.appendChild(mid);

      row.addEventListener("click", function () { if (opts.onPick) opts.onPick(t); });
      host.appendChild(row);
    });
  }

  /* ----------------------------------------------------- conversation */

  /* A live conversation view.
     opts: {
       compact: bool             — dock styling (smaller)
       onMeta(meta)              — thread details loaded (title, members, canSend…)
       onGone(err)               — thread not found / no access
       onActivity()              — something arrived or was sent (refresh lists)
     }
     Returns { el, open(id), close(), focus(), id() } */
  function conversation(opts) {
    opts = opts || {};

    var root = el("div", "chat-convo" + (opts.compact ? " is-compact" : ""));

    var scroller = el("div", "chat-log");
    scroller.setAttribute("role", "log");
    scroller.setAttribute("aria-label", "Messages");
    scroller.setAttribute("aria-live", "polite");
    scroller.tabIndex = 0;
    root.appendChild(scroller);

    var jump = el("button", "chat-jump");
    jump.type = "button";
    jump.hidden = true;
    jump.appendChild(icon("arrowDown"));
    var jumpText = el("span", null, "Latest");
    jump.appendChild(jumpText);
    jump.addEventListener("click", function () { toBottom(true); });
    root.appendChild(jump);

    var typingEl = el("div", "chat-typing");
    typingEl.hidden = true;
    typingEl.setAttribute("aria-live", "polite");
    root.appendChild(typingEl);

    var locked = el("div", "chat-locked");
    locked.hidden = true;
    root.appendChild(locked);

    /* --- composer --- */
    var form = el("form", "chat-compose");
    var pendingWrap = el("div", "chat-pending");
    pendingWrap.hidden = true;
    form.appendChild(pendingWrap);

    var bar = el("div", "chat-compose-bar");
    var attach = el("button", "chat-icon-btn chat-attach");
    attach.type = "button";
    attach.title = "Add a picture";
    attach.setAttribute("aria-label", "Add a picture");
    attach.setAttribute("aria-haspopup", "menu");
    attach.appendChild(icon("plus"));
    bar.appendChild(attach);

    var menu = el("div", "chat-attach-menu");
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    var cap = window.Capture && window.Capture.supported ? window.Capture.supported() : { file: true };
    [
      ["image", "Photo or image", "fromFile", true],
      ["camera", "Take a photo", "cameraDialog", cap.camera],
      ["screenshot", "Screenshot", "screenshot", cap.screen]
    ].forEach(function (spec) {
      if (!spec[3]) return;
      var b = el("button", "chat-attach-item");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.appendChild(icon(spec[0]));
      b.appendChild(el("span", null, spec[1]));
      b.addEventListener("click", function () {
        menu.hidden = true;
        stage(function () { return window.Capture[spec[2]](); });
      });
      menu.appendChild(b);
    });
    bar.appendChild(menu);
    attach.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      attach.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
    });
    document.addEventListener("click", function (e) {
      if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true;
    });

    var input = document.createElement("textarea");
    input.className = "chat-input";
    input.rows = 1;
    input.maxLength = MAX_LEN;
    input.placeholder = "Message";
    input.setAttribute("aria-label", "Message");
    input.setAttribute("enterkeyhint", "send");
    bar.appendChild(input);

    var sendBtn = el("button", "chat-send");
    sendBtn.type = "submit";
    sendBtn.title = "Send (Enter)";
    sendBtn.setAttribute("aria-label", "Send");
    sendBtn.appendChild(icon("send"));
    bar.appendChild(sendBtn);
    form.appendChild(bar);

    var counter = el("div", "chat-counter");
    counter.hidden = true;
    form.appendChild(counter);

    root.appendChild(form);

    /* --- state --- */
    var state = null;           // { id, isGroup, members, canSend }
    var lastId = 0;
    var lastMsg = null;         // { senderKey, at } of the newest rendered message
    var rendered = {};          // server id -> row
    var optimistic = [];        // { row, body, hasImage, image, id|null }
    var pending = null;         // staged image
    var seq = 0;
    var timer = null;
    var ticking = false;
    var unsub = null;
    var unseen = 0;
    var typers = {};            // username -> { name, until }
    var typingTimer = null;
    var lastTypingSent = 0;

    function nearBottom() {
      return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    }
    function toBottom(smooth) {
      if (smooth && scroller.scrollTo) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
      else scroller.scrollTop = scroller.scrollHeight;
      unseen = 0;
      jump.hidden = true;
    }
    scroller.addEventListener("scroll", function () {
      if (nearBottom()) { unseen = 0; jump.hidden = true; }
    });

    /* ---------- rendering ---------- */

    function senderKey(m) { return m.mine ? "__me" : ((m.from && m.from.username) || "?"); }

    function addDayIfNeeded(at) {
      if (!lastMsg || !sameDay(lastMsg.at, at)) {
        var d = el("div", "chat-day");
        d.appendChild(el("span", null, dayLabel(at)));
        scroller.appendChild(d);
        lastMsg = null;          // a new day always starts a new group
      }
    }

    function buildRow(m) {
      var key = senderKey(m);
      addDayIfNeeded(m.at);
      var cont = lastMsg && lastMsg.key === key && m.at - lastMsg.at < GROUP_GAP;

      var row = el("div", "chat-msg" + (m.mine ? " is-mine" : "") + (cont ? " is-cont" : ""));
      if (!m.mine && state && state.isGroup && !cont) {
        row.appendChild(el("span", "chat-msg-who", m.from ? (m.from.displayName || m.from.username) : ""));
      }

      var bubble = el("div", "chat-bubble");
      fillBubble(bubble, m);
      row.appendChild(bubble);

      var acts = el("div", "chat-msg-acts");
      if (m.body && !m.deleted) {
        acts.appendChild(actBtn("copy", "Copy text", function () {
          copyText(m.body).then(function () { UI().toast("Copied"); });
        }));
      }
      if (m.mine && !m.deleted) {
        acts.appendChild(actBtn("trash", "Delete for everyone", function () {
          confirmBox({
            title: "Delete this message?",
            body: "It will be removed for everyone in the conversation.",
            confirmLabel: "Delete", danger: true
          }).then(function (yes) {
            if (!yes || !row._id) return;
            window.API.deleteMessage(row._id).then(function () {
              fillBubble(bubble, { deleted: true, at: m.at });
              acts.remove();
            }).catch(function (err) { UI().toast(err.message || "Couldn't delete that"); });
          });
        }));
      }
      if (acts.childNodes.length) row.appendChild(acts);

      lastMsg = { key: key, at: m.at };
      return row;
    }

    function actBtn(name, label, fn) {
      var b = el("button", "chat-act");
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.appendChild(icon(name));
      b.addEventListener("click", fn);
      return b;
    }

    function fillBubble(bubble, m) {
      bubble.innerHTML = "";
      bubble.className = "chat-bubble";
      if (m.deleted) {
        bubble.classList.add("is-gone");
        bubble.appendChild(document.createTextNode("Message deleted"));
      } else {
        if (m.image) {
          var img = document.createElement("img");
          img.className = "chat-img";
          img.alt = m.image.kind === "screenshot" ? "Shared screenshot" : "Shared image";
          img.loading = "lazy";
          if (m.image.width && m.image.height) {
            img.width = m.image.width;
            img.height = m.image.height;
          }
          if (m.image.dataUrl) img.src = m.image.dataUrl;
          else UI().attachImage(img, m.image);
          bubble.appendChild(img);
          bubble.classList.add("has-img");
        }
        if (m.body) {
          var text = el("span", "chat-text");
          text.appendChild(richText(m.body));
          bubble.appendChild(text);
          if (!m.image && emojiOnly(m.body)) bubble.classList.add("is-emoji");
        }
      }
      var t = el("span", "chat-time", clock(m.at || Date.now()));
      t.title = new Date(m.at || Date.now()).toLocaleString();
      bubble.appendChild(t);
    }

    function addServerMessages(list, opts2) {
      var atBottom = nearBottom();
      var fresh = 0;
      list.forEach(function (m) {
        if (m.id > lastId) lastId = m.id;
        if (rendered[m.id]) return;
        /* Our own message coming back from the server before send() resolved:
           adopt the optimistic bubble instead of drawing a duplicate. */
        if (m.mine) {
          for (var i = 0; i < optimistic.length; i++) {
            var o = optimistic[i];
            if (o.id == null && !o.failed && o.body === (m.body || "") && o.hasImage === !!m.image) {
              adopt(o, m.id);
              return;
            }
          }
        }
        var row = buildRow(m);
        row._id = m.id;
        rendered[m.id] = row;
        scroller.appendChild(row);
        if (!m.mine) fresh++;
      });
      if (opts2 && opts2.initial) { toBottom(false); return; }
      if (atBottom) toBottom(false);
      else if (fresh) {
        unseen += fresh;
        jumpText.textContent = unseen === 1 ? "1 new message" : unseen + " new messages";
        jump.hidden = false;
      }
      if (fresh) clearTyping();
    }

    function adopt(o, id) {
      o.id = id;
      o.row._id = id;
      o.row.classList.remove("is-sending");
      rendered[id] = o.row;
      optimistic = optimistic.filter(function (x) { return x !== o; });
    }

    function skeleton() {
      scroller.innerHTML = "";
      var sk = el("div", "chat-skeleton");
      for (var i = 0; i < 5; i++) {
        var r = el("div", "chat-skel-row" + (i % 2 ? " is-mine" : ""));
        r.appendChild(el("span", "chat-skel", ""));
        sk.appendChild(r);
      }
      scroller.appendChild(sk);
    }

    function intro(meta) {
      var box = el("div", "chat-intro");
      box.appendChild(meta.isGroup ? groupAvatar("lg") : avatarFor(meta.with, "lg"));
      box.appendChild(el("strong", null, meta.title));
      box.appendChild(el("p", null, meta.isGroup
        ? "This is the start of the group. " + meta.memberCount + " people are here."
        : "This is the start of your conversation with " + meta.title + "."));
      return box;
    }

    /* ---------- loading ---------- */

    function open(id) {
      close();
      var my = ++seq;
      state = { id: Number(id) };
      skeleton();
      input.value = drafts.get(state.id);
      autosize();
      syncSend();
      form.hidden = false;
      locked.hidden = true;

      return window.API.thread(state.id).then(function (res) {
        if (my !== seq) return null;
        state = {
          id: res.threadId, isGroup: res.isGroup, members: res.members || [],
          canSend: res.canSend !== false
        };
        scroller.innerHTML = "";
        var meta = {
          id: res.threadId, title: res.title, isGroup: res.isGroup, with: res.with,
          members: res.members || [], memberCount: res.memberCount, owner: res.owner,
          canSend: res.canSend !== false, lockedReason: res.lockedReason || ""
        };
        if (res.messages.length < 200) scroller.appendChild(intro(meta));
        addServerMessages(res.messages, { initial: true });

        form.hidden = !meta.canSend;
        locked.hidden = meta.canSend;
        if (!meta.canSend) {
          locked.textContent = meta.lockedReason || "You can't send messages in this conversation.";
        }

        subscribe(state.id);
        retime();
        if (opts.onMeta) opts.onMeta(meta);
        if (window.Session && window.Session.refreshBadges) window.Session.refreshBadges();
        return meta;
      }).catch(function (err) {
        if (my !== seq) return null;
        state = null;
        scroller.innerHTML = "";
        if (opts.onGone) opts.onGone(err);
        return null;
      });
    }

    function close() {
      seq++;
      if (state && state.id) drafts.set(state.id, input.value);
      window.clearInterval(timer);
      timer = null;
      if (unsub) { unsub(); unsub = null; }
      state = null;
      lastId = 0;
      lastMsg = null;
      rendered = {};
      optimistic = [];
      pending = null;
      drawPending();
      unseen = 0;
      jump.hidden = true;
      typers = {};
      renderTyping();
      scroller.innerHTML = "";
    }

    function socketUp() { return !!(window.Realtime && window.Realtime.connected); }

    function retime() {
      window.clearInterval(timer);
      if (!state) return;
      timer = window.setInterval(tick, socketUp() ? POLL_SOCKET : POLL_LIVE);
    }

    function tick() {
      if (!state || !state.id || ticking || document.hidden) return;
      var my = seq;
      ticking = true;
      window.API.thread(state.id, lastId).then(function (res) {
        if (my !== seq || !state) return;
        if (res.messages && res.messages.length) {
          addServerMessages(res.messages);
          if (opts.onActivity) opts.onActivity();
          if (window.Session && window.Session.refreshBadges) window.Session.refreshBadges();
        }
      }).catch(function (err) {
        if (my === seq && err && err.status === 404 && opts.onGone) opts.onGone(err);
      }).then(function () { ticking = false; });
    }

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && state) tick();
    });

    /* ---------- realtime ---------- */

    function subscribe(id) {
      if (!window.Realtime || !window.Realtime.subscribe) return;
      unsub = window.Realtime.subscribe("realtime:thread:" + id, {
        msg: function () { tick(); },
        typing: function (p) {
          if (!p || !p.u || p.u === me().username) return;
          if (p.stop) { delete typers[p.u]; renderTyping(); return; }
          typers[p.u] = { name: p.n || p.u, until: Date.now() + TYPING_SHOW_FOR };
          renderTyping();
        }
      });
    }

    function renderTyping() {
      window.clearTimeout(typingTimer);
      var now = Date.now();
      var names = Object.keys(typers).filter(function (k) {
        if (typers[k].until > now) return true;
        delete typers[k];
        return false;
      }).map(function (k) { return typers[k].name; });
      typingEl.innerHTML = "";
      if (!names.length) { typingEl.hidden = true; return; }
      var dots = el("span", "chat-typing-dots");
      dots.appendChild(el("i"));
      dots.appendChild(el("i"));
      dots.appendChild(el("i"));
      typingEl.appendChild(dots);
      var who = names.length === 1 ? names[0] + " is typing"
        : names.length === 2 ? names[0] + " and " + names[1] + " are typing"
        : "Several people are typing";
      typingEl.appendChild(el("span", null, who));
      typingEl.hidden = false;
      typingTimer = window.setTimeout(renderTyping, 1000);
    }

    function clearTyping() { typers = {}; renderTyping(); }

    function sendTyping(stop) {
      if (!state || !window.Realtime || !window.Realtime.broadcast) return;
      var now = Date.now();
      if (!stop && now - lastTypingSent < TYPING_SEND_EVERY) return;
      lastTypingSent = stop ? 0 : now;
      var u = me();
      window.Realtime.broadcast("realtime:thread:" + state.id, "typing", {
        u: u.username, n: u.displayName || u.username, stop: !!stop
      });
    }

    function pokeOthers(id) {
      if (!window.Realtime) return;
      if (window.Realtime.broadcast) window.Realtime.broadcast("realtime:thread:" + id, "msg", {});
      var mine = me().id;
      ((state && state.members) || []).forEach(function (m) {
        if (m && m.id && m.id !== mine && window.Realtime.pokeUser) window.Realtime.pokeUser(m.id, "notify");
      });
    }

    /* ---------- composing ---------- */

    function autosize() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, opts.compact ? 110 : 170) + "px";
    }
    function syncSend() {
      var n = input.value.length;
      sendBtn.disabled = !input.value.trim() && !pending;
      counter.hidden = n < MAX_LEN - 200;
      counter.textContent = (MAX_LEN - n) + " characters left";
    }

    input.addEventListener("input", function () {
      autosize();
      syncSend();
      if (state) drafts.set(state.id, input.value);
      if (input.value.trim()) sendTyping(false);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        submit();
      }
    });
    input.addEventListener("blur", function () { if (lastTypingSent) sendTyping(true); });
    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    /* Paste or drop an image straight into the conversation. */
    input.addEventListener("paste", function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === "file" && /^image\//.test(items[i].type)) {
          var f = items[i].getAsFile();
          e.preventDefault();
          stage(function () { return window.Capture.fromBlob(f); });
          return;
        }
      }
    });
    root.addEventListener("dragover", function (e) {
      if (!state || form.hidden) return;
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1) {
        e.preventDefault();
        root.classList.add("is-drop");
      }
    });
    root.addEventListener("dragleave", function (e) {
      if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove("is-drop");
    });
    root.addEventListener("drop", function (e) {
      root.classList.remove("is-drop");
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f || !state || form.hidden) return;
      e.preventDefault();
      stage(function () { return window.Capture.fromBlob(f); });
    });

    function stage(grab) {
      if (!window.Capture) return;
      grab().then(function (shot) {
        pending = shot;
        drawPending();
        syncSend();
        input.focus();
      }).catch(function (err) {
        if (err && /cancel|permission|denied|abort|no file/i.test(err.message || "")) return;
        UI().toast((err && err.message) || "Couldn't add that picture");
      });
    }

    function drawPending() {
      pendingWrap.innerHTML = "";
      pendingWrap.hidden = !pending;
      if (!pending) return;
      var img = document.createElement("img");
      img.src = pending.dataUrl;
      img.alt = "Picture to send";
      pendingWrap.appendChild(img);
      var x = el("button", "chat-pending-x");
      x.type = "button";
      x.setAttribute("aria-label", "Remove picture");
      x.appendChild(icon("close"));
      x.addEventListener("click", function () { pending = null; drawPending(); syncSend(); input.focus(); });
      pendingWrap.appendChild(x);
    }

    function submit() {
      if (!state || !state.canSend) return;
      var text = input.value.trim();
      var image = pending;
      if (!text && !image) return;
      if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);

      input.value = "";
      pending = null;
      drafts.set(state.id, "");
      drawPending();
      autosize();
      syncSend();
      sendTyping(true);
      input.focus();

      var tempMsg = {
        mine: true, body: text, at: Date.now(), deleted: false,
        image: image ? { dataUrl: image.dataUrl, width: image.width, height: image.height, kind: image.kind } : null
      };
      var row = buildRow(tempMsg);
      row.classList.add("is-sending");
      scroller.appendChild(row);
      toBottom(false);
      var o = { row: row, body: text, hasImage: !!image, image: image, id: null, failed: false };
      optimistic.push(o);
      deliver(o, state.id);
    }

    function deliver(o, threadId) {
      var my = seq;
      o.failed = false;
      o.row.classList.remove("is-failed");
      o.row.classList.add("is-sending");
      var old = o.row.querySelector(".chat-fail");
      if (old) old.remove();

      window.API.send(threadId, o.body, o.image).then(function (res) {
        if (my !== seq) return;
        var id = res && res.message && res.message.id;
        if (id != null && rendered[id] && rendered[id] !== o.row) {
          /* The poll already drew it; drop the optimistic copy. */
          o.row.remove();
          optimistic = optimistic.filter(function (x) { return x !== o; });
        } else if (id != null && o.id == null) {
          adopt(o, id);
          if (id > lastId) lastId = id;
        }
        pokeOthers(threadId);
        if (opts.onActivity) opts.onActivity();
      }).catch(function (err) {
        if (my !== seq) return;
        o.failed = true;
        o.row.classList.remove("is-sending");
        o.row.classList.add("is-failed");
        var fail = el("div", "chat-fail");
        fail.appendChild(el("span", null, (err && err.message) || "Not sent"));
        var retry = el("button", "chat-fail-btn");
        retry.type = "button";
        retry.appendChild(icon("retry"));
        retry.appendChild(el("span", null, "Retry"));
        retry.addEventListener("click", function () { deliver(o, threadId); });
        var drop = el("button", "chat-fail-btn");
        drop.type = "button";
        drop.textContent = "Discard";
        drop.addEventListener("click", function () {
          o.row.remove();
          optimistic = optimistic.filter(function (x) { return x !== o; });
        });
        fail.appendChild(retry);
        fail.appendChild(drop);
        o.row.appendChild(fail);
      });
    }

    return {
      el: root,
      open: open,
      close: close,
      id: function () { return state && state.id; },
      focus: function () { if (!form.hidden) input.focus(); },
      refresh: tick,
      setMembers: function (members) { if (state) state.members = members || []; }
    };
  }

  /* The dialogs are generic; other pages use them through this name. */
  window.Dialogs = { ask: ask, confirm: confirmBox, sheet: sheet };

  window.ChatCore = {
    conversation: conversation,
    threadList: threadList,
    newChat: newChat,
    pickFriends: pickFriends,
    ask: ask,
    confirm: confirmBox,
    avatar: avatarFor,
    groupAvatar: groupAvatar,
    listWhen: listWhen
  };
})();
