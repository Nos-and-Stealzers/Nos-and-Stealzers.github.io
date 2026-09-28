/* Campus+ mod menu for the player.

   Looks (rainbow, invert, retro, mirror, wobble, zoom…) work on every game:
   they're applied to the game frame from outside.

   Games served from this site, or through play.<domain>, can also be reached
   from the inside: speed and pause, and the live cheats in game-cheats.js
   (Mario 64, Clickteam/FNAF, Construct, Phaser, Eaglercraft, and any game
   that keeps its numbers in plain variables). Anything else still gets the
   save editor, which changes the numbers a game stored on this device. */
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

  function timeControl(w) { return window.GameCheats.timeControl(w); }

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
      var l = link();
      if (!l) return false;
      /* Leave a game's clock alone until someone actually changes it. */
      if (settings.speed === 1 && !settings.paused && !l.touched) return true;
      l.touched = true;
      l.ask("run", "clock", { speed: settings.speed, paused: !!settings.paused }).catch(function () {});
      return true;
    }

    /* ---- reaching inside the game ----
       Games served from this site are reached directly. Games served from
       play.<domain> are reached through _mods/agent.html, loaded from that
       same origin in a hidden frame. Anywhere else is off-limits. */
    var agent = { frame: null, origin: "", seq: 0, waiting: {} };
    var links = { direct: null, agent: null };

    function playOrigin() {
      var px = window.SITE && window.SITE.gameProxy;
      if (!px || !px.active) return "";
      try { return new URL(px.to).origin; } catch (e) { return ""; }
    }

    function link() {
      var f = frame();
      if (!f || !window.GameCheats) return null;
      if (sameOrigin(f)) {
        var w = f.contentWindow;
        if (!links.direct || links.direct.win !== w) {
          links.direct = {
            win: w,
            ask: function (action, id, arg) {
              try {
                return Promise.resolve(action === "run"
                  ? window.GameCheats.run(w, id, arg) : window.GameCheats.inspect(w));
              } catch (e) { return Promise.reject(e); }
            }
          };
        }
        return links.direct;
      }
      var origin = playOrigin(), src = "";
      try { src = new URL(f.src, location.href).origin; } catch (e) {}
      if (!origin || src !== origin) return null;
      if (!links.agent || links.agent.frame !== f) {
        links.agent = { frame: f, ask: function (action, id, arg) { return askAgent(origin, action, id, arg); } };
      }
      return links.agent;
    }

    function askAgent(origin, action, id, arg) {
      if (!agent.frame || !agent.frame.isConnected || agent.origin !== origin) {
        if (agent.frame) agent.frame.remove();
        var fr = document.createElement("iframe");
        fr.src = origin + "/_mods/agent.html";
        fr.hidden = true;
        fr.tabIndex = -1;
        fr.title = "Mod menu helper";
        fr.setAttribute("aria-hidden", "true");
        agent.ready = new Promise(function (resolve) { fr.addEventListener("load", resolve); });
        agent.frame = fr;
        agent.origin = origin;
        document.body.appendChild(fr);
      }
      var target = agent.frame;
      return agent.ready.then(function () {
        return new Promise(function (resolve, reject) {
          var n = ++agent.seq;
          var timer = window.setTimeout(function () {
            delete agent.waiting[n];
            reject(new Error("The game didn't answer. Try again once it has loaded."));
          }, 5000);
          agent.waiting[n] = function (data) {
            window.clearTimeout(timer);
            if (data && data.error) reject(new Error(data.error));
            else resolve(data);
          };
          target.contentWindow.postMessage(
            { channel: "ach-mods", id: n, action: action, cheat: id, arg: arg }, origin);
        });
      });
    }

    window.addEventListener("message", function (e) {
      if (!agent.frame || e.source !== agent.frame.contentWindow || e.origin !== agent.origin) return;
      var m = e.data;
      if (!m || m.channel !== "ach-mods") return;
      if (m.hotkey) { if (config().hotkey) toggle(panel.hidden); return; }
      var done = agent.waiting[m.reply];
      if (done) { delete agent.waiting[m.reply]; done(m.data); }
    });

    function applyAll() { applyLooks(); applySpeed(); }

    function persist() {
      if (cfg.remember) save({ looks: settings.looks, zoom: settings.zoom, speed: settings.speed });
    }

    var tab = "looks";

    function draw() {
      cfg = config();
      panel.innerHTML = "";
      panel.classList.toggle("is-left", cfg.side === "left");

      var head = el("div", "mod-head");
      var badge = el("span", "mod-logo", "+");
      badge.setAttribute("aria-hidden", "true");
      head.appendChild(badge);
      var titles = el("div", "mod-titles");
      titles.appendChild(el("strong", null, "Mod menu"));
      titles.appendChild(el("span", null, (opts.game && opts.game.title) || "Campus+"));
      head.appendChild(titles);
      var x = el("button", "chat-icon-btn mod-x");
      x.type = "button";
      x.setAttribute("aria-label", "Close mod menu");
      x.appendChild(window.UI.icon("close"));
      x.addEventListener("click", function () { toggle(false); });
      head.appendChild(x);
      panel.appendChild(head);

      var tabs = el("div", "mod-tabs");
      tabs.setAttribute("role", "tablist");
      [["looks", "Looks"], ["cheats", "Cheats"], ["game", "Game"]].forEach(function (t) {
        var b = el("button", "mod-tab", t[1]);
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", tab === t[0] ? "true" : "false");
        b.addEventListener("click", function () { tab = t[0]; draw(); });
        tabs.appendChild(b);
      });
      panel.appendChild(tabs);

      var body = el("div", "mod-body");
      panel.appendChild(body);
      if (tab === "looks") drawLooks(body);
      else if (tab === "cheats") drawCheats(body);
      else drawGame(body);
    }

    function drawLooks(body) {
      if (cfg.presets.length) {
        body.appendChild(el("span", "mod-label", "Presets"));
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
        body.appendChild(pr);
      }

      body.appendChild(el("span", "mod-label", "Effects · every game"));
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
      body.appendChild(grid);

      body.appendChild(slider("Zoom", 1, 2, 0.05, settings.zoom, function (v) {
        settings.zoom = v;
        applyLooks();
        persist();
      }, function (v) { return Math.round(v * 100) + "%"; }));

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
      var reset = el("button", "btn btn-sm btn-flat", "Clear effects");
      reset.type = "button";
      reset.addEventListener("click", function () {
        settings.looks = {};
        settings.zoom = 1;
        applyLooks();
        persist();
        draw();
      });
      foot.appendChild(reset);
      body.appendChild(foot);
      var custom = el("a", "mod-link", "Customize the menu");
      custom.href = "plus.html#mods";
      body.appendChild(custom);
    }

    function drawGame(body) {
      var reach = !!link();
      body.appendChild(el("span", "mod-label", "Speed & pause"));
      if (reach) {
        body.appendChild(slider("Game speed", 0.25, 3, 0.25, settings.speed, function (v) {
          settings.speed = v;
          applySpeed();
          persist();
        }, function (v) { return v + "×"; }));
        var row = el("div", "mod-foot");
        var pause = el("button", "btn btn-sm", settings.paused ? "Resume" : "Pause");
        pause.type = "button";
        pause.addEventListener("click", function () {
          settings.paused = !settings.paused;
          applySpeed();
          pause.textContent = settings.paused ? "Resume" : "Pause";
        });
        row.appendChild(pause);
        var normal = el("button", "btn btn-sm btn-flat", "Normal speed");
        normal.type = "button";
        normal.addEventListener("click", function () {
          settings.speed = 1;
          settings.paused = false;
          applySpeed();
          persist();
          draw();
        });
        row.appendChild(normal);
        body.appendChild(row);
      } else {
        body.appendChild(el("p", "mod-note",
          "Speed and pause work on games served from this site. This one loads from another site, " +
          "which browsers keep off-limits."));
      }
    }

    /* ---- cheats: edit the numbers a game keeps in its save ---- */

    var cheat = { loading: false, data: null, keys: [], fields: [], error: "", undo: null };

    function multiplayer() {
      var g = opts.game || {};
      return g.category === "multiplayer" ||
        /\.io\b|multiplayer|online|\b1v1\b|\bpvp\b|battle royale|\bmmo/i.test((g.title || "") + " " + (g.description || ""));
    }

    var WANTED = /coin|money|gold|gem|cash|diamond|point|token|credit|star|ruby|crystal|energy|\bxp\b|exp|level|lives|life|health|hp|ammo|score|bucks|dollar|currency|skill|upgrade|power|key|ticket|orb|shard/i;

    function collect(value, path, out, depth) {
      if (depth > 6 || out.length > 200) return;
      if (typeof value === "number" && isFinite(value)) { out.push({ path: path, value: value }); return; }
      if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) && value.length < 16) {
        out.push({ path: path, value: Number(value), asString: true });
        return;
      }
      if (value && typeof value === "object") {
        Object.keys(value).slice(0, 300).forEach(function (k) {
          collect(value[k], path.concat(k), out, depth + 1);
        });
      }
    }

    function parse(raw) {
      if (typeof raw !== "string") return { json: false, value: raw };
      try { return { json: true, value: JSON.parse(raw) }; } catch (e) { return { json: false, value: raw }; }
    }

    function scan() {
      var origin = opts.origin && opts.origin();
      if (!origin || !window.GameSaves) {
        cheat.error = "This game doesn't keep a save the menu can reach.";
        return Promise.resolve();
      }
      cheat.loading = true;
      cheat.error = "";
      return window.GameSaves.readAll(origin).then(function (res) {
        var data = (res && res.data) || {};
        var mine = window.GameKeys ? window.GameKeys.forGame(opts.game, data) : { watched: [], guessed: [] };
        var keys = mine.watched.concat(mine.guessed);
        cheat.data = data;
        cheat.keys = keys;
        var fields = [];
        keys.forEach(function (k) {
          var parsed = parse(data[k]);
          var found = [];
          collect(parsed.value, [], found, 0);
          found.forEach(function (f) {
            f.key = k;
            f.json = parsed.json;
            var name = f.path.length ? f.path.join(".") : k;
            f.label = name;
            f.rank = WANTED.test(name) ? 0 : 1;
            fields.push(f);
          });
        });
        fields.sort(function (a, b) { return a.rank - b.rank || a.label.localeCompare(b.label); });
        cheat.fields = fields.slice(0, 60);
      }).catch(function () {
        cheat.error = "Couldn't reach this game's save. Cheats work on games hosted here and on " +
          "your GitHub game hosts, in a normal (not private) window.";
      }).then(function () { cheat.loading = false; });
    }

    function setPath(obj, path, v) {
      var o = obj;
      for (var i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = v;
    }

    /* Write changed numbers back, then restart the game so it reads them. */
    function applyCheats(changes) {
      var origin = opts.origin && opts.origin();
      var byKey = {};
      var undo = {};
      changes.forEach(function (c) {
        var f = c.field;
        var raw = cheat.data[f.key];
        if (!(f.key in byKey)) {
          undo[f.key] = raw;
          byKey[f.key] = f.json ? JSON.parse(raw) : raw;
        }
        var v = f.asString ? String(c.value) : c.value;
        if (!f.path.length) byKey[f.key] = String(c.value);
        else setPath(byKey[f.key], f.path, v);
      });
      var out = {};
      Object.keys(byKey).forEach(function (k) {
        out[k] = typeof byKey[k] === "string" ? byKey[k] : JSON.stringify(byKey[k]);
      });
      return window.GameSaves.writeKeys(origin, out, true).then(function () {
        cheat.undo = undo;
        if (opts.reload) opts.reload();
        window.UI.toast("Cheats applied. The game restarted to load them.", 3500);
        return scan();
      }).catch(function (err) {
        window.UI.toast((err && err.message) || "Couldn't write the save", 3500);
      });
    }

    /* ---- live cheats: switches inside the running game ---- */

    var live = { loading: false, data: null, error: "" };

    function liveRun(id, arg) {
      var l = link();
      if (!l) return;
      l.ask("run", id, arg).then(function (d) {
        live.data = d;
        live.error = "";
      }).catch(function (err) {
        window.UI.toast(err.message || "That didn't work.", 3000);
      }).then(function () { if (tab === "cheats" && !panel.hidden) draw(); });
    }

    function drawLive(body) {
      var l = link();
      if (!l) return false;
      if (!live.data && !live.loading && !live.error) {
        live.loading = true;
        l.ask("inspect").then(function (d) { live.data = d; })
          .catch(function (err) { live.error = err.message; })
          .then(function () {
            live.loading = false;
            if (tab === "cheats" && !panel.hidden) draw();
          });
      }
      if (live.loading) { body.appendChild(el("p", "mod-note", "Looking inside the game…")); return true; }
      if (live.error) { body.appendChild(el("p", "mod-note", live.error)); return true; }
      var d = live.data;
      if (!d || !d.engine) return false;

      body.appendChild(el("span", "mod-label", d.engine));
      if (d.note) body.appendChild(el("p", "mod-note", d.note));
      var groups = [];
      var byGroup = {};
      d.items.forEach(function (it) {
        var g = it.group || "";
        if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
        byGroup[g].push(it);
      });
      groups.forEach(function (g) {
        if (g && groups.length > 1) body.appendChild(el("span", "mod-sub", g));
        var chips = null;
        var list = null;
        byGroup[g].forEach(function (it) {
          if (it.type === "toggle" || it.type === "button") {
            if (!chips) { chips = el("div", "mod-chips"); body.appendChild(chips); }
            var b = el("button", "mod-chip" + (it.type === "button" ? " is-action" : ""), it.label);
            b.type = "button";
            if (it.hint) b.title = it.hint;
            if (it.type === "toggle") b.setAttribute("aria-pressed", it.on ? "true" : "false");
            b.addEventListener("click", function () {
              liveRun(it.id, it.type === "toggle" ? { on: !it.on } : null);
              if (it.type === "button") window.UI.toast(it.label + " ✓", 1600);
            });
            chips.appendChild(b);
            return;
          }
          if (!list) { list = el("div", "mod-cheats"); body.appendChild(list); }
          var row = el("div", "mod-cheat" + (it.locked ? " is-key" : ""));
          row.appendChild(el("span", "mod-cheat-name", it.label));
          var input = document.createElement("input");
          input.setAttribute("aria-label", it.label);
          if (it.type === "text") {
            input.type = "text";
            input.placeholder = it.placeholder || "";
            input.maxLength = 200;
            row.classList.add("is-text");
            row.appendChild(input);
            var go = el("button", "btn btn-sm", "Run");
            go.type = "button";
            var send = function () {
              if (!input.value.trim()) return;
              liveRun(it.id, { value: input.value.trim() });
            };
            go.addEventListener("click", send);
            input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
            row.appendChild(go);
            list.appendChild(row);
            return;
          }
          input.type = "number";
          input.value = it.value;
          row.appendChild(input);
          var set = el("button", "btn btn-sm", "Set");
          set.type = "button";
          set.addEventListener("click", function () {
            var v = Number(input.value);
            if (isFinite(v)) liveRun(it.id, { value: v, lock: !!it.locked });
          });
          row.appendChild(set);
          var lock = el("button", "btn btn-sm btn-flat", it.locked ? "Unlock" : "Lock");
          lock.type = "button";
          lock.title = "Keep it at this number";
          lock.addEventListener("click", function () {
            var v = Number(input.value);
            liveRun(it.id, it.locked ? { unlock: true } : { value: isFinite(v) ? v : it.value, lock: true });
          });
          row.appendChild(lock);
          list.appendChild(row);
        });
      });
      var foot = el("div", "mod-foot");
      var again = el("button", "btn btn-sm btn-flat", "Refresh");
      again.type = "button";
      again.addEventListener("click", function () { live.data = null; live.error = ""; draw(); });
      foot.appendChild(again);
      body.appendChild(foot);
      return true;
    }

    function drawCheats(body) {
      var isMc = live.data && /eaglercraft/i.test(live.data.engine || "");
      if (multiplayer() && !isMc && !/eaglercraft|minecraft/i.test((opts.game || {}).title || "")) {
        body.appendChild(el("p", "mod-note", "Cheats are off for multiplayer games. Looks still work."));
        return;
      }
      if (drawLive(body)) {
        if (live.loading || (live.data && /eaglercraft/i.test(live.data.engine))) return;
      }
      if (!cheat.data && !cheat.loading && !cheat.error) {
        body.appendChild(el("p", "mod-note", "Reading this game's save…"));
        scan().then(function () { if (tab === "cheats" && !panel.hidden) draw(); });
        return;
      }
      if (cheat.loading) { body.appendChild(el("p", "mod-note", "Reading this game's save…")); return; }
      if (cheat.error) {
        if (!(live.data && live.data.engine)) body.appendChild(el("p", "mod-note", cheat.error));
        return;
      }

      /* Games with live cheats and no readable save: the live list is enough. */
      if (!cheat.fields.length && live.data && live.data.engine) return;
      if (!cheat.fields.length) {
        body.appendChild(el("p", "mod-note",
          "No editable numbers found yet. Play a bit (earn some coins, finish a level), " +
          "then press Rescan. Games that save in a binary format can't be edited here."));
      } else {
        var money = cheat.fields.filter(function (f) { return f.rank === 0; });
        var top = el("div", "mod-foot");
        var maxAll = el("button", "btn btn-sm btn-cta", "Max everything");
        maxAll.type = "button";
        maxAll.disabled = !money.length;
        maxAll.title = "Sets coins, gems, cash, XP, lives and the like to 999,999";
        maxAll.addEventListener("click", function () {
          applyCheats(money.map(function (f) {
            return { field: f, value: /level|lives|life/i.test(f.label) ? Math.max(f.value, 99) : 999999 };
          }));
        });
        top.appendChild(maxAll);
        body.appendChild(top);

        body.appendChild(el("span", "mod-label", "Saved values"));
        var list = el("div", "mod-cheats");
        cheat.fields.forEach(function (f) {
          var row = el("div", "mod-cheat" + (f.rank === 0 ? " is-key" : ""));
          var name = el("span", "mod-cheat-name", f.label);
          name.title = f.key + (f.path.length ? " → " + f.path.join(".") : "");
          row.appendChild(name);
          var input = document.createElement("input");
          input.type = "number";
          input.value = Math.round(f.value * 100) / 100;
          input.setAttribute("aria-label", f.label);
          row.appendChild(input);
          var set = el("button", "btn btn-sm", "Set");
          set.type = "button";
          set.addEventListener("click", function () {
            var v = Number(input.value);
            if (!isFinite(v)) return;
            applyCheats([{ field: f, value: v }]);
          });
          row.appendChild(set);
          var max = el("button", "btn btn-sm btn-flat", "Max");
          max.type = "button";
          max.addEventListener("click", function () { applyCheats([{ field: f, value: 999999 }]); });
          row.appendChild(max);
          list.appendChild(row);
        });
        body.appendChild(list);
      }

      var foot = el("div", "mod-foot");
      var again = el("button", "btn btn-sm btn-flat", "Rescan");
      again.type = "button";
      again.addEventListener("click", function () {
        cheat.data = null;
        draw();
      });
      foot.appendChild(again);
      if (cheat.undo) {
        var undo = el("button", "btn btn-sm btn-flat", "Undo last");
        undo.type = "button";
        undo.addEventListener("click", function () {
          var origin = opts.origin && opts.origin();
          var back = cheat.undo;
          cheat.undo = null;
          window.GameSaves.writeKeys(origin, back, true).then(function () {
            if (opts.reload) opts.reload();
            window.UI.toast("Undone");
            cheat.data = null;
            draw();
          });
        });
        foot.appendChild(undo);
      }
      body.appendChild(foot);
      body.appendChild(el("p", "mod-note mod-fine",
        "Edits the numbers this game saved on your device. Keep a backup before big changes: " +
        "some games reset a save that looks tampered with."));
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
        live = { loading: false, data: null, error: "" };
        if (member()) applyLooks();
        var f = frame();
        if (f) f.addEventListener("load", function () {
          /* For everyone, not just members: games that swallow clicks
             otherwise lose the keyboard for good once you click away. */
          var l = link();
          if (l) l.ask("run", "focus").catch(function () {});
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
