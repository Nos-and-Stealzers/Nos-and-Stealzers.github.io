/* Floating chat, bottom-right on every page — including while a game runs. */
(function () {
  "use strict";

  var LIST_POLL = 20000;
  var KEY = "ach:dock";

  var root, launcher, badge, panel, titleEl, subEl, headAv, backBtn, callBtns = [],
      listView, listHost, searchBox, convoView, convo, fullLink;
  var open = false;
  var threads = [];
  var current = null;
  var listTimer = null;

  function el(t, c, x) { return window.UI.el(t, c, x); }
  function icon(n, c) { return window.UI.icon(n, c); }

  function remembered() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function remember(patch) {
    try { window.localStorage.setItem(KEY, JSON.stringify(Object.assign(remembered(), patch))); } catch (e) {}
  }

  function iconBtn(name, label, cls) {
    var b = el("button", "cdock-icon" + (cls ? " " + cls : ""));
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(icon(name));
    return b;
  }

  /* ------------------------------------------------------------ build */

  function build() {
    root = el("div", "cdock");

    launcher = el("button", "cdock-launch");
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open chat");
    launcher.setAttribute("aria-expanded", "false");
    launcher.appendChild(icon("chat", "cdock-launch-ico"));
    launcher.appendChild(el("span", "cdock-launch-txt", "Chat"));
    badge = el("span", "cdock-badge");
    badge.hidden = true;
    launcher.appendChild(badge);
    launcher.addEventListener("click", function () { setOpen(!open); });

    panel = el("section", "cdock-panel");
    panel.setAttribute("aria-label", "Chat");
    panel.hidden = true;

    /* header */
    var head = el("header", "cdock-head");
    backBtn = iconBtn("back", "Back to conversations", "cdock-back");
    backBtn.hidden = true;
    backBtn.addEventListener("click", showList);
    head.appendChild(backBtn);

    headAv = el("span", "cdock-head-av");
    headAv.hidden = true;
    head.appendChild(headAv);

    var titles = el("div", "cdock-titles");
    titleEl = el("strong", "cdock-title", "Chats");
    subEl = el("span", "cdock-sub", "");
    subEl.hidden = true;
    titles.appendChild(titleEl);
    titles.appendChild(subEl);
    head.appendChild(titles);

    [["phone", "Voice call", "audio"], ["video", "Video call", "video"]].forEach(function (spec) {
      var b = iconBtn(spec[0], spec[1], "cdock-call");
      b.hidden = true;
      b.addEventListener("click", function () {
        if (current && window.Calls) window.Calls.start({ threadId: current.id, kind: spec[2] });
      });
      head.appendChild(b);
      callBtns.push(b);
    });

    fullLink = el("a", "cdock-icon");
    fullLink.href = "messages.html";
    fullLink.title = "Open in Messages";
    fullLink.setAttribute("aria-label", "Open in Messages");
    fullLink.appendChild(icon("popout"));
    head.appendChild(fullLink);

    var shut = iconBtn("close", "Close chat");
    shut.addEventListener("click", function () { setOpen(false); launcher.focus(); });
    head.appendChild(shut);
    panel.appendChild(head);

    /* list view */
    listView = el("div", "cdock-listview");
    var tools = el("div", "cdock-tools");
    var sWrap = el("label", "chat-search");
    sWrap.appendChild(icon("search"));
    searchBox = document.createElement("input");
    searchBox.type = "search";
    searchBox.placeholder = "Search";
    searchBox.setAttribute("aria-label", "Search conversations");
    sWrap.appendChild(searchBox);
    tools.appendChild(sWrap);
    var mk = iconBtn("edit", "New chat", "cdock-new");
    mk.addEventListener("click", startNew);
    tools.appendChild(mk);
    listView.appendChild(tools);
    listHost = el("div", "chat-rows");
    listView.appendChild(listHost);
    searchBox.addEventListener("input", draw);
    panel.appendChild(listView);

    /* conversation view */
    convoView = el("div", "cdock-convoview");
    convoView.hidden = true;
    convo = window.ChatCore.conversation({
      compact: true,
      onMeta: function (meta) {
        current = meta;
        convo.setMembers(meta.members);
        drawHead();
        loadList();
      },
      onGone: function (err) {
        window.UI.toast((err && err.message) || "That conversation isn't available");
        showList();
      },
      onActivity: function () { loadList(); }
    });
    convoView.appendChild(convo.el);
    panel.appendChild(convoView);

    root.appendChild(panel);
    root.appendChild(launcher);
    document.body.appendChild(root);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !open) return;
      if (document.querySelector(".chat-sheet, .shot-view")) return;
      if (!panel.contains(document.activeElement)) return;
      setOpen(false);
      launcher.focus();
    });
  }

  /* ------------------------------------------------------ open / close */

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    root.classList.toggle("is-open", open);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    launcher.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    remember({ open: open });
    if (open) {
      loadList();
      if (current) convo.focus();
      else searchBox.focus({ preventScroll: true });
    }
    retime();
  }

  function retime() {
    window.clearInterval(listTimer);
    listTimer = window.setInterval(function () {
      if (open && !current && !document.hidden) loadList();
    }, LIST_POLL);
  }

  function showList() {
    convo.close();
    current = null;
    convoView.hidden = true;
    listView.hidden = false;
    backBtn.hidden = true;
    headAv.hidden = true;
    subEl.hidden = true;
    titleEl.textContent = "Chats";
    fullLink.href = "messages.html";
    callBtns.forEach(function (b) { b.hidden = true; });
    remember({ thread: null });
    loadList();
  }

  function drawHead() {
    if (!current) return;
    titleEl.textContent = current.title;
    if (!current.isGroup && current.with) titleEl.appendChild(window.UI.userTags(current.with, { compact: true, noPlus: true }));
    headAv.innerHTML = "";
    headAv.appendChild(current.isGroup ? window.ChatCore.groupAvatar("sm")
                                       : window.ChatCore.avatar(current.with, "sm"));
    headAv.hidden = false;
    var sub = "";
    if (current.isGroup) sub = current.memberCount + " people";
    else if (current.with) {
      sub = current.with.online ? "Online" : (current.with.lastSeen ? "Active " + window.UI.formatWhen(current.with.lastSeen) : "");
    }
    subEl.textContent = sub;
    subEl.hidden = !sub;
    subEl.classList.toggle("is-online", !!(current.with && current.with.online));
    var canCall = window.Calls && window.Calls.supported && window.Calls.supported();
    callBtns.forEach(function (b) { b.hidden = !canCall; });
    fullLink.href = "messages.html?thread=" + encodeURIComponent(current.id);
  }

  /* -------------------------------------------------------------- list */

  function loadList() {
    if (!open) return Promise.resolve(threads);
    return window.API.threads().then(function (res) {
      threads = res.threads || [];
      draw();
      return threads;
    }).catch(function () { return threads; });
  }

  function draw() {
    window.ChatCore.threadList(listHost, threads, {
      query: searchBox.value,
      activeId: current && current.id,
      onPick: function (t) { openThread(t.id, t); },
      onNew: startNew
    });
  }

  function startNew() {
    window.ChatCore.newChat().then(function (id) {
      if (id) loadList().then(function () { openThread(id); });
    });
  }

  /* ----------------------------------------------------- conversation */

  function openThread(id, hint) {
    current = { id: Number(id), title: (hint && hint.title) || "Chat", isGroup: hint && hint.isGroup,
                with: hint && hint.with, memberCount: hint && hint.memberCount };
    listView.hidden = true;
    convoView.hidden = false;
    backBtn.hidden = false;
    drawHead();
    remember({ thread: current.id, open: true });
    var p = convo.open(id);
    convo.focus();
    return p;
  }

  /* --------------------------------------------------------------- boot */

  function mount() {
    if (!window.Session || !window.API || !window.UI || !window.ChatCore) return;
    /* The Messages page is the full-size version of this; two copies of the
       same conversation on one screen just doubles every request. */
    if (/(^|\/)messages\.html$/.test(window.location.pathname)) return;

    window.Session.ready.then(function (state) {
      if (!state.backend || !state.user) return;
      if (window.Store && window.Store.settings && !window.Store.settings().dock) return;

      build();
      retime();

      var saved = remembered();
      if (saved.open) {
        setOpen(true);
        if (saved.thread) openThread(saved.thread);
      }

      document.addEventListener("session:badges", function (e) {
        var n = (e.detail && e.detail.messages) || 0;
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.hidden = n === 0;
        root.classList.toggle("has-unread", !!n && !open);
        if (open && !current) loadList();
      });
      document.addEventListener("session:change", function (e) {
        if (!(e.detail && e.detail.user) && root) { convo.close(); root.remove(); }
      });
    });
  }

  window.ChatDock = {
    /* Resolves true when the conversation is showing in the dock, false when
       the dock isn't mounted (turned off in settings) so the caller can fall
       back to the Messages page. */
    openWith: function (username) {
      return window.API.openThread(username).then(function (res) {
        if (!root) return false;
        setOpen(true);
        return loadList().then(function (list) {
          var t = (list || []).filter(function (x) { return x.id === res.threadId; })[0];
          openThread(res.threadId, t || { title: username });
          return true;
        });
      });
    },
    openThread: function (id) {
      if (!root) return false;
      setOpen(true);
      openThread(id);
      return true;
    },
    close: function () { if (root) setOpen(false); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
