/* Staff console design switcher.
   "Classic" is the console as it has always been. "Command" restyles the same
   DOM (css/admin-command.css) into a top-bar workspace with a KPI strip and
   dense tables, and adds a Ctrl+K command palette. No admin logic lives here:
   sections, API calls and rank checks all stay in page-admin.js. */
(function () {
  "use strict";

  var KEY = "ach:admin-design";          // { <userId>: "classic" | "command", _last: "..." }
  var DESIGNS = { classic: "Classic", command: "Command" };
  var body = document.body;
  var consoleEl = document.getElementById("console");
  var picker = document.getElementById("admin-design");
  if (!body || !consoleEl || !picker) return;

  function readMap() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function writeMap(map) {
    try { window.localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { /* private mode */ }
  }

  var userId = "";
  var design = "classic";

  function apply(name, remember) {
    if (!DESIGNS[name]) name = "classic";
    design = name;
    body.setAttribute("data-admin-design", name);
    picker.querySelectorAll("[data-design]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.design === name ? "true" : "false");
    });
    if (remember) {
      var map = readMap();
      map._last = name;
      if (userId) map[userId] = name;
      writeMap(map);
    }
    if (name === "command") buildKpis();
    else closePalette();
  }

  /* ----------------------------------------------------------- KPI strip */

  /* Each cell mirrors a number page-admin.js already keeps up to date. */
  var KPIS = [
    { src: "q-reports",  label: "Open reports",  go: "reports",  warn: true },
    { src: "q-support",  label: "Open tickets",  go: "support",  warn: true },
    { src: "q-feedback", label: "New feedback",  go: "feedback" },
    { src: "q-calls",    label: "Calls live",    go: "live" },
    { src: "k-online",   label: "Online now",    go: "live",     good: true },
    { src: "k-users",    label: "Accounts",      go: "users" },
    { src: "k-today",    label: "Messages today", go: "audit" }
  ];
  var kpiBar = null;
  var kpiWatch = null;

  function buildKpis() {
    if (kpiBar) return;
    var top = consoleEl.querySelector(".admin-topbar");
    if (!top) return;
    kpiBar = document.createElement("div");
    kpiBar.className = "cmd-kpis";
    kpiBar.id = "cmd-kpis";
    kpiBar.setAttribute("role", "group");
    kpiBar.setAttribute("aria-label", "Key numbers");
    KPIS.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cmd-kpi";
      b.dataset.kpi = k.src;
      b.title = "Open " + k.label.toLowerCase();
      var n = document.createElement("b");
      n.textContent = "0";
      var l = document.createElement("span");
      l.textContent = k.label;
      b.appendChild(n);
      b.appendChild(l);
      b.addEventListener("click", function () { goTo(k.go); });
      kpiBar.appendChild(b);
    });
    top.parentNode.insertBefore(kpiBar, top.nextSibling);

    function sync() {
      KPIS.forEach(function (k) {
        var src = document.getElementById(k.src);
        var cell = kpiBar.querySelector('[data-kpi="' + k.src + '"]');
        if (!src || !cell) return;
        var text = (src.textContent || "0").trim();
        cell.firstChild.textContent = text;
        var n = Number(text.replace(/[^\d.-]/g, "")) || 0;
        cell.classList.toggle("is-warn", !!k.warn && n > 0);
        cell.classList.toggle("is-good", !!k.good && n > 0);
      });
    }
    sync();
    kpiWatch = new MutationObserver(sync);
    KPIS.forEach(function (k) {
      var src = document.getElementById(k.src);
      if (src) kpiWatch.observe(src, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ----------------------------------------------------------- navigation */

  function goTo(tab) {
    if (window.location.hash.slice(1) === tab) {
      window.dispatchEvent(new Event("hashchange"));
    } else {
      window.location.hash = tab;
    }
  }

  function visibleLinks() {
    var out = [];
    consoleEl.querySelectorAll(".admin-nav-link").forEach(function (a) {
      if (a.hidden || a.closest("[hidden]")) return;
      var lbl = a.querySelector(".lbl");
      var group = "";
      var prev = a.previousElementSibling;
      while (prev && !prev.classList.contains("admin-nav-label")) prev = prev.previousElementSibling;
      if (prev) group = prev.textContent.trim();
      out.push({ tab: a.dataset.tab || "", href: a.getAttribute("href") || "", label: lbl ? lbl.textContent.trim() : a.textContent.trim(), icon: a.dataset.icon || "", group: group });
    });
    return out;
  }

  /* ---------------------------------------------------- command palette */

  var pal = null;      // { root, input, list }
  var items = [];
  var active = 0;
  var returnFocus = null;

  function commands(query) {
    var q = query.trim().toLowerCase();
    var list = visibleLinks().map(function (l) {
      return {
        icon: l.icon || "grid", group: "Go to", label: l.label, hint: l.group,
        run: function () { if (l.tab) goTo(l.tab); else window.location.href = l.href; }
      };
    });
    list.push({ icon: "retry", group: "Actions", label: "Refresh data", hint: "Reload the open section", run: function () { var r = document.getElementById("refresh"); if (r) r.click(); } });
    list.push({ icon: "grid", group: "Actions", label: "Switch to the Classic design", hint: "Saved for your account", run: function () { apply("classic", true); } });
    list.push({ icon: "arrowDown", group: "Actions", label: "Back to the arcade", hint: "Leave the console", run: function () { window.location.href = "index.html"; } });

    var out = list.filter(function (c) {
      return !q || (c.label + " " + c.hint).toLowerCase().indexOf(q) !== -1;
    });
    /* Typing a name offers a straight jump into the Users list, filtered. */
    var usersLink = visibleLinks().some(function (l) { return l.tab === "users"; });
    if (q && usersLink) {
      out.unshift({
        icon: "search", group: "Users", label: "Find user “" + query.trim() + "”", hint: "Search the Users list",
        run: function () {
          goTo("users");
          var box = document.getElementById("user-q");
          if (box) {
            box.value = query.trim();
            box.dispatchEvent(new Event("input", { bubbles: true }));
            box.focus();
          }
        }
      });
    }
    return out;
  }

  function buildPalette() {
    if (pal) return pal;
    var root = document.createElement("div");
    root.className = "cmd-palette";
    root.id = "cmd-palette";
    root.hidden = true;
    root.innerHTML =
      '<div class="cmd-palette-box" role="dialog" aria-modal="true" aria-label="Command palette">' +
      '<div class="cmd-palette-field"><span data-ico="search"></span>' +
      '<input type="text" id="cmd-input" autocomplete="off" spellcheck="false" placeholder="Jump to a section, or type a username" ' +
      'role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-label="Command palette"></div>' +
      '<ul class="cmd-palette-list" id="cmd-list" role="listbox"></ul>' +
      '<div class="cmd-palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>' +
      '</div>';
    document.body.appendChild(root);
    var ico = root.querySelector("[data-ico]");
    if (window.UI && window.UI.icon) ico.appendChild(window.UI.icon("search"));
    pal = { root: root, input: root.querySelector("#cmd-input"), list: root.querySelector("#cmd-list") };

    pal.input.addEventListener("input", function () { active = 0; draw(); });
    pal.input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); run(active); }
      else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
      else if (e.key === "Tab") { e.preventDefault(); }   // focus stays in the dialog
    });
    root.addEventListener("mousedown", function (e) { if (e.target === root) closePalette(); });
    return pal;
  }

  function draw() {
    items = commands(pal.input.value);
    pal.list.innerHTML = "";
    if (!items.length) {
      var none = document.createElement("li");
      none.className = "cmd-none";
      none.textContent = "Nothing matches that.";
      pal.list.appendChild(none);
      pal.input.removeAttribute("aria-activedescendant");
      return;
    }
    var lastGroup = "";
    items.forEach(function (c, i) {
      if (c.group !== lastGroup) {
        var g = document.createElement("li");
        g.className = "cmd-group";
        g.setAttribute("role", "presentation");
        g.textContent = c.group;
        pal.list.appendChild(g);
        lastGroup = c.group;
      }
      var li = document.createElement("li");
      li.id = "cmd-opt-" + i;
      li.className = "cmd-item" + (i === active ? " is-on" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === active ? "true" : "false");
      if (window.UI && window.UI.icon) li.appendChild(window.UI.icon(c.icon));
      var t = document.createElement("span");
      t.className = "cmd-item-label";
      t.textContent = c.label;
      li.appendChild(t);
      var h = document.createElement("span");
      h.className = "cmd-item-hint";
      h.textContent = c.hint || "";
      li.appendChild(h);
      li.addEventListener("mousemove", function () { if (active !== i) { active = i; paint(); } });
      li.addEventListener("click", function () { run(i); });
      pal.list.appendChild(li);
    });
    pal.input.setAttribute("aria-activedescendant", "cmd-opt-" + active);
  }

  function paint() {
    pal.list.querySelectorAll(".cmd-item").forEach(function (li, i) {
      var on = i === active;
      li.classList.toggle("is-on", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
      if (on) li.scrollIntoView({ block: "nearest" });
    });
    pal.input.setAttribute("aria-activedescendant", "cmd-opt-" + active);
  }

  function move(step) {
    if (!items.length) return;
    active = (active + step + items.length) % items.length;
    paint();
  }

  function run(i) {
    var c = items[i];
    if (!c) return;
    closePalette(true);
    c.run();
  }

  function openPalette() {
    if (design !== "command" || consoleEl.hidden) return;
    buildPalette();
    returnFocus = document.activeElement;
    pal.root.hidden = false;
    pal.input.value = "";
    active = 0;
    draw();
    pal.input.focus();
  }

  function closePalette(skipFocus) {
    if (!pal || pal.root.hidden) return;
    pal.root.hidden = true;
    if (!skipFocus && returnFocus && returnFocus.focus) returnFocus.focus();
  }

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
      if (design !== "command") return;
      e.preventDefault();
      if (pal && !pal.root.hidden) closePalette(); else openPalette();
    }
  });

  /* A visible way in, for people who don't know the shortcut. */
  var open = document.createElement("button");
  open.type = "button";
  open.className = "cmd-open";
  open.id = "cmd-open";
  open.setAttribute("aria-label", "Open the command palette");
  if (window.UI && window.UI.icon) open.appendChild(window.UI.icon("search"));
  var openLabel = document.createElement("span");
  openLabel.textContent = "Jump to…";
  open.appendChild(openLabel);
  var hint = document.createElement("kbd");
  hint.textContent = "Ctrl K";
  open.appendChild(hint);
  open.addEventListener("click", openPalette);
  var navEl = document.getElementById("tabs");
  var foot = navEl && navEl.querySelector(".admin-nav-foot");
  if (foot) foot.insertBefore(open, foot.firstChild);

  /* Before the session resolves, use the last choice made on this device so
     the page does not flash the wrong layout; then swap to this admin's own. */
  apply(readMap()._last, false);

  picker.addEventListener("click", function (e) {
    var b = e.target.closest("[data-design]");
    if (b) apply(b.dataset.design, true);
  });

  if (window.Session && window.Session.ready) {
    window.Session.ready.then(function () {
      var u = window.Session.user;
      if (!u || !u.id) return;
      userId = String(u.id);
      var mine = readMap()[userId];
      if (mine && mine !== design) apply(mine, false);
      else if (!mine) apply(design, true);
    });
  }
})();
