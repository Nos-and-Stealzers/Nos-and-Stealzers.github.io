/* Campus+ mod menu for the player.

   Works on every game: looks (rainbow, invert, retro, mirror, wobble, zoom…)
   are applied to the game frame from outside, so they need nothing from the
   game itself.

   Arcade originals (served from this site) also get game-speed control and
   pause, by retiming the game's clock from inside its frame. Games loaded
   from other sites can't be reached that way: the browser keeps their
   insides off-limits, so those controls say so instead of pretending. */
(function () {
  "use strict";

  var KEY = "ach:mods";
  var CONFIG_KEY = "ach:mods-config";
  var MAX_PRESETS = 8;
  var LOOKS = [
    { id: "rainbow",  label: "Rainbow" },
    { id: "invert",   label: "Invert" },
    { id: "retro",    label: "Retro" },
    { id: "neon",     label: "Neon" },
    { id: "mono",     label: "Black & white" },
    { id: "night",    label: "Night" },
    { id: "mirror",   label: "Mirror" },
    { id: "flip",     label: "Upside down" },
    { id: "wobble",   label: "Wobble" },
    { id: "spin",     label: "Slow spin" }
  ];

  function el(t, c, x) { return window.UI.el(t, c, x); }

  function load() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function save(s) {
    try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function member() {
    var S = window.Session;
    var u = S && S.user;
    if (!u) return false;
    return !!(u.isPlus || (S.isPlus && S.isPlus()) || (S.isStaff && S.isStaff()));
  }

  /* How the menu itself is set up, edited from the Campus+ page. */
  function config() {
    var c = {};
    try { c = JSON.parse(window.localStorage.getItem(CONFIG_KEY) || "{}") || {}; } catch (e) {}
    return {
      shown: Array.isArray(c.shown) ? c.shown : LOOKS.map(function (l) { return l.id; }),
      presets: Array.isArray(c.presets) ? c.presets.slice(0, MAX_PRESETS) : [],
      remember: c.remember !== false,
      hotkey: c.hotkey !== false,
      side: c.side === "left" ? "left" : "right"
    };
  }
  function saveConfig(c) {
    try { window.localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch (e) {}
  }

  /* ---- clock control inside a same-origin game frame ---- */

  function sameOrigin(frame) {
    try {
      /* A frame still loading is a blank page on our origin; wait for the game. */
      var href = frame && frame.contentWindow && frame.contentWindow.location.href;
      return !!href && href !== "about:blank" && !!frame.contentWindow.document;
    } catch (e) { return false; }
  }

  function timeControl(w) {
    if (w.__achClock) return w.__achClock;
    var perf = w.performance;
    var realNow = perf.now.bind(perf);
    var realDate = w.Date.now.bind(w.Date);
    var raf = w.requestAnimationFrame.bind(w);
    var caf = w.cancelAnimationFrame.bind(w);
    var st = w.setTimeout.bind(w);
    var si = w.setInterval.bind(w);
    var state = { speed: 1, paused: false };
    var last = realNow();
    var virt = last;
    var dateOffset = realDate() - last;

    function tick() {
      var t = realNow();
      if (!state.paused) virt += (t - last) * state.speed;
      last = t;
      return virt;
    }

    perf.now = function () { return tick(); };
    w.Date.now = function () { return Math.round(dateOffset + tick()); };

    /* While paused, frames are held back rather than delivered. */
    var live = {};
    var seq = 0;
    w.requestAnimationFrame = function (cb) {
      var id = ++seq;
      function run() {
        if (!live[id]) return;
        if (state.paused) { live[id] = raf(run); return; }
        delete live[id];
        cb(tick());
      }
      live[id] = raf(run);
      return id;
    };
    w.cancelAnimationFrame = function (id) {
      if (live[id]) { caf(live[id]); delete live[id]; }
    };
    w.setTimeout = function (fn, ms) {
      var args = Array.prototype.slice.call(arguments, 2);
      return st.apply(w, [fn, Math.max(0, (Number(ms) || 0) / state.speed)].concat(args));
    };
    w.setInterval = function (fn, ms) {
      var args = Array.prototype.slice.call(arguments, 2);
      return si.apply(w, [fn, Math.max(4, (Number(ms) || 0) / state.speed)].concat(args));
    };

    w.__achClock = state;
    return state;
  }

  /* ---- the menu ---- */

  function attach(opts) {
    var getFrame = opts.frame;
    var stage = opts.stage;
    var anchor = opts.anchor;
    var cfg = config();
    var settings = cfg.remember ? load() : {};
    settings.looks = settings.looks || {};
    settings.zoom = settings.zoom || 1;
    settings.speed = settings.speed || 1;

    var btn = el("button", "btn mod-btn");
    btn.type = "button";
    btn.appendChild(window.UI.icon("star"));
    btn.appendChild(el("span", null, "Mods"));
    btn.title = "Campus+ mod menu";
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);

    var panel = el("div", "mod-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Mod menu");
    stage.appendChild(panel);

    function frame() { return getFrame(); }

    function applyLooks() {
      var f = frame();
      if (!f) return;
      var L = settings.looks;
      var filters = [];
      if (L.invert) filters.push("invert(1) hue-rotate(180deg)");
      if (L.retro) filters.push("sepia(0.65) contrast(1.15) saturate(1.3)");
      if (L.neon) filters.push("saturate(2.4) contrast(1.25) brightness(1.08)");
      if (L.mono) filters.push("grayscale(1) contrast(1.1)");
      if (L.night) filters.push("brightness(0.6) contrast(1.1)");
      f.style.filter = filters.join(" ");
      var t = [];
      if (settings.zoom !== 1) t.push("scale(" + settings.zoom + ")");
      if (L.mirror) t.push("scaleX(-1)");
      if (L.flip) t.push("scaleY(-1)");
      f.style.transform = t.join(" ");
      f.style.transformOrigin = "center center";
      f.classList.toggle("mod-rainbow", !!L.rainbow);
      f.classList.toggle("mod-wobble", !!L.wobble);
      f.classList.toggle("mod-spin", !!L.spin);
      stage.classList.toggle("mod-zoomed", settings.zoom !== 1 || !!L.spin || !!L.wobble);
    }

    function applySpeed() {
      var f = frame();
      if (!f || !sameOrigin(f)) return false;
      try {
        var clock = timeControl(f.contentWindow);
        clock.speed = settings.speed;
        clock.paused = !!settings.paused;
        return true;
      } catch (e) { return false; }
    }

    function applyAll() { applyLooks(); applySpeed(); }

    function persist() {
      if (cfg.remember) save({ looks: settings.looks, zoom: settings.zoom, speed: settings.speed });
    }

    function draw() {
      panel.innerHTML = "";
      var head = el("div", "mod-head");
      var title = el("strong", null, "Mod menu");
      head.appendChild(title);
      head.appendChild(el("span", "mod-tag", "Campus+"));
      var x = el("button", "chat-icon-btn mod-x");
      x.type = "button";
      x.setAttribute("aria-label", "Close mod menu");
      x.appendChild(window.UI.icon("close"));
      x.addEventListener("click", function () { toggle(false); });
      head.appendChild(x);
      panel.appendChild(head);

      cfg = config();
      panel.classList.toggle("is-left", cfg.side === "left");

      if (cfg.presets.length) {
        panel.appendChild(el("span", "mod-label", "Presets"));
        var pr = el("div", "mod-presets");
        cfg.presets.forEach(function (p) {
          var b = el("button", "mod-chip mod-preset", p.name);
          b.type = "button";
          b.addEventListener("click", function () {
            settings.looks = Object.assign({}, p.looks || {});
            settings.zoom = p.zoom || 1;
            applyLooks();
            persist();
            draw();
          });
          pr.appendChild(b);
        });
        panel.appendChild(pr);
      }

      panel.appendChild(el("span", "mod-label", "Looks · every game"));
      var grid = el("div", "mod-grid");
      LOOKS.filter(function (l) { return cfg.shown.indexOf(l.id) !== -1; }).forEach(function (l) {
        var b = el("button", "mod-chip", l.label);
        b.type = "button";
        b.setAttribute("aria-pressed", settings.looks[l.id] ? "true" : "false");
        b.addEventListener("click", function () {
          settings.looks[l.id] = !settings.looks[l.id];
          b.setAttribute("aria-pressed", settings.looks[l.id] ? "true" : "false");
          applyLooks();
          persist();
        });
        grid.appendChild(b);
      });
      panel.appendChild(grid);

      panel.appendChild(slider("Zoom", 1, 2, 0.05, settings.zoom, function (v) {
        settings.zoom = v;
        applyLooks();
        persist();
      }, function (v) { return Math.round(v * 100) + "%"; }));

      var reach = sameOrigin(frame());
      panel.appendChild(el("span", "mod-label", "Game · Arcade originals"));
      if (reach) {
        panel.appendChild(slider("Speed", 0.25, 3, 0.25, settings.speed, function (v) {
          settings.speed = v;
          applySpeed();
          persist();
        }, function (v) { return v + "×"; }));
        var pause = el("button", "btn btn-sm mod-pause", settings.paused ? "Resume" : "Pause");
        pause.type = "button";
        pause.addEventListener("click", function () {
          settings.paused = !settings.paused;
          applySpeed();
          pause.textContent = settings.paused ? "Resume" : "Pause";
        });
        panel.appendChild(pause);
      } else {
        panel.appendChild(el("p", "mod-note",
          "Speed and pause work on Arcade originals. This game is loaded from another site, " +
          "which browsers keep off-limits, so only looks apply here."));
      }

      var foot = el("div", "mod-foot");
      var keep = el("button", "btn btn-sm mod-save", "Save as preset");
      keep.type = "button";
      keep.addEventListener("click", function () {
        var ask = window.Dialogs && window.Dialogs.ask
          ? window.Dialogs.ask({ title: "Name this preset", maxLength: 24, confirmLabel: "Save", placeholder: "e.g. Retro party" })
          : Promise.resolve(window.prompt("Name this preset"));
        ask.then(function (name) {
          if (!name) return;
          var c = config();
          c.presets = c.presets.filter(function (p) { return p.name !== name; });
          c.presets.unshift({ name: name, looks: Object.assign({}, settings.looks), zoom: settings.zoom });
          c.presets = c.presets.slice(0, MAX_PRESETS);
          saveConfig(c);
          window.UI.toast("Preset saved");
          draw();
        });
      });
      foot.appendChild(keep);
      var custom = el("a", "btn btn-sm btn-flat", "Customize");
      custom.href = "plus.html#mods";
      foot.appendChild(custom);
      panel.appendChild(foot);

      var reset = el("button", "btn btn-sm btn-flat mod-reset", "Reset everything");
      reset.type = "button";
      reset.addEventListener("click", function () {
        settings.looks = {};
        settings.zoom = 1;
        settings.speed = 1;
        settings.paused = false;
        applyAll();
        persist();
        draw();
      });
      panel.appendChild(reset);
    }

    function slider(label, min, max, step, value, onInput, fmt) {
      var row = el("label", "mod-slider");
      var top = el("span", "mod-slider-top");
      top.appendChild(el("span", null, label));
      var out = el("b", null, fmt(value));
      top.appendChild(out);
      row.appendChild(top);
      var input = document.createElement("input");
      input.type = "range";
      input.min = min; input.max = max; input.step = step; input.value = value;
      input.setAttribute("aria-label", label);
      input.addEventListener("input", function () {
        var v = Number(input.value);
        out.textContent = fmt(v);
        onInput(v);
      });
      row.appendChild(input);
      return row;
    }

    function toggle(on) {
      if (on && !member()) {
        window.UI.toast("The mod menu is a Campus+ perk. Ask staff about membership.", 3500);
        return;
      }
      panel.hidden = !on;
      btn.setAttribute("aria-expanded", on ? "true" : "false");
      if (on) draw();
    }

    btn.addEventListener("click", function () { toggle(panel.hidden); });
    function onKey(e) {
      if (e.key === "Escape" && !panel.hidden) toggle(false);
      /* Alt+M opens and closes the menu (can be turned off on the Campus+ page). */
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "m" || e.key === "M" || e.code === "KeyM") && config().hotkey) {
        e.preventDefault();
        toggle(panel.hidden);
      }
    }
    document.addEventListener("keydown", onKey);

    function paintLock() {
      btn.classList.toggle("is-locked", !member());
    }
    paintLock();
    /* Sign-in can finish after the game has started; catch up then. */
    function onSession() {
      paintLock();
      if (member()) applyAll();
    }
    document.addEventListener("session:change", onSession);
    if (window.Session && window.Session.ready) window.Session.ready.then(onSession);

    return {
      /* Call whenever a new game frame is created. */
      frameReady: function () {
        if (member()) applyLooks();
        var f = frame();
        if (f) f.addEventListener("load", function () {
          settings.paused = false;
          if (member()) applySpeed();
          /* The game usually has keyboard focus; hear the shortcut in there too. */
          if (sameOrigin(f)) {
            try { f.contentWindow.addEventListener("keydown", onKey); } catch (e) {}
          }
          if (!panel.hidden) draw();
        });
      }
    };
  }

  window.ModMenu = {
    attach: attach,
    looks: LOOKS,
    config: config,
    saveConfig: saveConfig,
    member: member,
    maxPresets: MAX_PRESETS
  };
})();
