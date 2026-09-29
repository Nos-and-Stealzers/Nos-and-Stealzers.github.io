/* In-game cheats for the Campus+ mod menu.

   Runs next to a game with full access to its window: straight from the
   player page for games served from this site, or from _mods/agent.html
   for games served through play.<domain>. Each engine below knows how to
   find its game's state; whichever matches the window supplies the list.

   inspect(win)            -> { engine, note, items: [...] }
   run(win, id, arg)       -> same shape, after doing the thing
   Item types: "toggle" (on), "button", "value" (value, locked), "text". */
(function () {
  "use strict";

  /* ------------------------------------------------------------ helpers */

  function state(win) {
    if (!win.__achCheats) {
      win.__achCheats = { on: {}, locks: {}, peak: {}, engine: null, loop: 0 };
    }
    return win.__achCheats;
  }

  /* One per-frame loop inside the game, so held cheats keep holding. */
  function ensureLoop(win) {
    var s = state(win);
    if (s.loop) return;
    s.loop = 1;
    var raf = win.__achRealRaf || win.requestAnimationFrame.bind(win);
    function frame() {
      try { if (s.engine && s.engine.tick) s.engine.tick(win, s); } catch (e) {}
      try { quickTick(win, s, s.engine); } catch (e) {}
      raf(frame);
    }
    raf(frame);
  }

  /* Speed and pause, by retiming the game's own clock. */
  function timeControl(w) {
    if (w.__achClock) return w.__achClock;
    var perf = w.performance;
    var realNow = perf.now.bind(perf);
    var realDate = w.Date.now.bind(w.Date);
    var raf = w.requestAnimationFrame.bind(w);
    w.__achRealRaf = raf;
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
    /* Some engines (Clickteam) read the time with `new Date()` instead. */
    var RealDate = w.Date;
    var VDate = function () {
      if (!(this instanceof VDate)) return RealDate();
      if (arguments.length) {
        return new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))();
      }
      return new RealDate(Math.round(dateOffset + tick()));
    };
    VDate.prototype = RealDate.prototype;
    VDate.now = w.Date.now;
    VDate.parse = RealDate.parse;
    VDate.UTC = RealDate.UTC;
    w.Date = VDate;

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

  /* ---------------------------------------------------- Super Mario 64 */

  /* gMarioStates in this build (games/sm64). Checked before use, and found
     by scanning if a rebuild ever moves it. */
  var SM64_MARIO = 11565920;
  var ACT_FLAG_AIR = 0x800;
  var INPUT_A_DOWN = 0x80;
  var CAPS = { wing: 0x08, metal: 0x04, vanish: 0x02 };

  function sm64View(win) {
    var h = win.HEAPU8;
    return h ? new DataView(h.buffer) : null;
  }
  function marioAt(dv, a) {
    var n = dv.byteLength;
    if (a <= 0 || a + 0xC8 > n) return false;
    var obj = dv.getUint32(a + 0x88, true), ctl = dv.getUint32(a + 0x9C, true);
    if (!obj || !ctl || obj >= n || ctl >= n) return false;
    for (var o = 0x3C; o <= 0x44; o += 4) {
      var v = dv.getFloat32(a + o, true);
      if (!isFinite(v) || Math.abs(v) > 40000) return false;
    }
    var lives = dv.getInt8(a + 0xAD);
    return lives >= -1 && lives <= 127;
  }
  function findMario(win, s) {
    var dv = sm64View(win);
    if (!dv) return 0;
    if (s.mario && marioAt(dv, s.mario)) return s.mario;
    if (marioAt(dv, SM64_MARIO)) return (s.mario = SM64_MARIO);
    return 0;
  }

  /* SM64 EEPROM: 4 files x 2 copies x 0x38 bytes, then menu data. */
  var SAVE_KEY = "sm64_save_file";
  function sm64Unlock(win) {
    var raw;
    try { raw = win.localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    var bytes = new Uint8Array(512);
    if (raw) {
      var bin = win.atob(raw);
      for (var i = 0; i < Math.min(512, bin.length); i++) bytes[i] = bin.charCodeAt(i);
    }
    var dv = new DataView(bytes.buffer);
    /* Doors, caps, moat, the basement and upstairs, the 50-star door and
       the five castle secret stars (Toad x3, MIPS x2). */
    var FLAGS = 0x1 | 0x2 | 0x4 | 0x8 | 0x40 | 0x80 | 0x100 | 0x200 | 0x400 | 0x800 |
      0x1000 | 0x2000 | 0x4000 | 0x8000 | 0x100000 | (0x1F << 24);
    /* 15 courses of 7 stars (plus the cannon bit), then the secret levels. */
    var STARS = [];
    for (var c = 0; c < 15; c++) STARS.push(0xFF);
    STARS.push(0x01, 0x01, 0x01, 0x03, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00);
    var any = false;
    for (var f = 0; f < 4; f++) {
      if (dv.getUint32(f * 0x70 + 8, true) & 1) any = true;
    }
    for (f = 0; f < 4; f++) {
      var exists = dv.getUint32(f * 0x70 + 8, true) & 1;
      if (!exists && (any || f > 0)) continue;
      for (var copy = 0; copy < 2; copy++) {
        var at = f * 0x70 + copy * 0x38;
        dv.setUint32(at + 8, (dv.getUint32(at + 8, true) | FLAGS) >>> 0, true);
        for (c = 0; c < 25; c++) bytes[at + 12 + c] = STARS[c];
        var sum = 0;
        for (var b = 0; b < 0x38 - 2; b++) sum += bytes[at + b];
        dv.setUint16(at + 0x34, 0x4441, true);
        dv.setUint16(at + 0x36, sum & 0xFFFF, true);
      }
    }
    var out = "";
    for (i = 0; i < 512; i++) out += String.fromCharCode(bytes[i]);
    win.localStorage.setItem(SAVE_KEY, win.btoa(out));
    return true;
  }

  function sm64Values(dv, a, id, v) {
    if (id === "v:lives") dv.setInt8(a + 0xAD, v);
    if (id === "v:coins") dv.setInt16(a + 0xA8, v, true);
  }

  var sm64 = {
    name: "Super Mario 64",
    /* Unity's older builds are Emscripten too (HEAPU8, _main, #canvas);
       only the sm64 port lacks a Unity loader. */
    detect: function (win) {
      return !!(win.HEAPU8 && win._main && win.document.getElementById("canvas")) && !unity.detect(win);
    },
    items: function (win, s) {
      var a = findMario(win, s);
      var dv = sm64View(win);
      var items = [
        { id: "cap-wing", label: "Wing cap", type: "toggle", group: "Caps" },
        { id: "cap-metal", label: "Metal cap", type: "toggle", group: "Caps" },
        { id: "cap-vanish", label: "Vanish cap", type: "toggle", group: "Caps" },
        { id: "lives", label: "99 lives", type: "button", group: "Stuff" },
        { id: "coins", label: "Max coins", type: "button", group: "Stuff" },
        { id: "stars", label: "Unlock all 120 stars + doors", type: "button", group: "Stuff",
          hint: "Rewrites the save and restarts the game" }
      ];
      if (a && dv) {
        items.push({ id: "v:lives", label: "Lives", type: "value", group: "Values",
          value: dv.getInt8(a + 0xAD), locked: s.locks["v:lives"] !== undefined });
        items.push({ id: "v:coins", label: "Coins", type: "value", group: "Values",
          value: dv.getInt16(a + 0xA8, true), locked: s.locks["v:coins"] !== undefined });
      }
      return {
        items: items,
        note: a ? "" : "Start playing (past the title screen) and these switch on."
      };
    },
    action: function (win, s, id, arg) {
      if (id === "stars") {
        if (sm64Unlock(win)) win.setTimeout(function () { win.location.reload(); }, 50);
        return;
      }
      var a = findMario(win, s), dv = sm64View(win);
      if (!a || !dv) return;
      if (id === "lives") dv.setInt8(a + 0xAD, 99);
      if (id === "coins") dv.setInt16(a + 0xA8, 999, true);
      if (/^v:/.test(id)) {
        if (arg && arg.unlock) { delete s.locks[id]; return; }
        var v = Number(arg && arg.value);
        if (!isFinite(v)) return;
        v = id === "v:lives" ? Math.max(0, Math.min(127, v | 0)) : Math.max(0, Math.min(999, v | 0));
        sm64Values(dv, a, id, v);
        if (arg.lock) s.locks[id] = v;
      }
      if (/^cap-/.test(id) && !s.on[id]) {
        /* Let the game take the cap off the usual way. */
        dv.setUint16(a + 0xB6, 1, true);
      }
    },
    tick: function (win, s) {
      var a = findMario(win, s), dv = sm64View(win);
      if (!a || !dv) return;
      Object.keys(s.locks).forEach(function (k) { sm64Values(dv, a, k, s.locks[k]); });
      if (s.on["q:fly"]) {
        var input = dv.getUint16(a + 0x02, true);
        var action = dv.getUint32(a + 0x0C, true);
        if ((input & INPUT_A_DOWN) && (action & ACT_FLAG_AIR)) dv.setFloat32(a + 0x4C, 38, true);
        /* No fall damage coming down. */
        dv.setFloat32(a + 0xBC, dv.getFloat32(a + 0x40, true), true);
      }
      var flags = dv.getUint32(a + 0x04, true);
      Object.keys(CAPS).forEach(function (k) {
        if (!s.on["cap-" + k]) return;
        flags = (flags | CAPS[k] | 0x10) >>> 0;
        dv.setUint16(a + 0xB6, 600, true);
      });
      dv.setUint32(a + 0x04, flags, true);
    }
  };

  /* ------------------------------------------- Clickteam Fusion (FNAF) */

  function ctApp(win) {
    var list = win.document.getElementsByTagName("canvas");
    for (var i = 0; i < list.length; i++) {
      var app = list[i].application;
      if (app && app.run && app.frame) return app;
    }
    return null;
  }
  /* Counters in the running frame, grouped by name. */
  function ctCounters(app) {
    var out = {};
    (app.run.rhObjectList || []).forEach(function (ho) {
      if (!ho || typeof ho.cpt_Change !== "function" || !ho.hoOiList) return;
      var name = String(ho.hoOiList.oilName || "").trim();
      if (!name || /^counter( \d+)?$/i.test(name)) return;
      (out[name] = out[name] || []).push(ho);
    });
    return out;
  }
  function ctSet(list, v) {
    list.forEach(function (ho) {
      ho.cpt_ToFloat(v);
      if (v > ho.rsMaxi) ho.rsMaxi = v;
      if (v < ho.rsMini) ho.rsMini = v;
      ho.cpt_Change(v);
    });
  }

  var POWER = /power|battery|oxygen|\bo2\b|energy|fuel|flashlight/i;
  var ENEMY_AI = /\bai\b|aggress|difficulty|activity|anger/i;
  var CLOCK = /time of day|^hours?$|^hour|^time$|clock|^am$/i;
  var MONEY = /token|money|coin|cash|faz|score|points?$|chips?/i;

  var clickteam = {
    name: "Clickteam Fusion",
    detect: function (win) { return !!ctApp(win); },
    items: function (win, s) {
      var app = ctApp(win);
      var counters = ctCounters(app);
      var names = Object.keys(counters);
      var items = [];
      var has = function (re) { return names.some(function (n) { return re.test(n); }); };
      if (has(POWER)) items.push({ id: "power", label: "Infinite power", type: "toggle", group: "Night" });
      if (has(ENEMY_AI)) items.push({ id: "freeze", label: "Freeze the animatronics", type: "toggle", group: "Night" });
      if (has(CLOCK)) items.push({ id: "six", label: "Skip to 6 AM", type: "button", group: "Night" });
      if (has(MONEY)) items.push({ id: "rich", label: "Max tokens / money", type: "button", group: "Stuff" });
      names.sort().forEach(function (n) {
        items.push({
          id: "c:" + n, label: n, type: "value", group: "Counters",
          value: Math.round(counters[n][0].rsValue * 100) / 100,
          locked: s.locks[n] !== undefined
        });
      });
      return {
        items: items,
        note: names.length ? "" : "Nothing to change on this screen. Start a night or level, then reopen this tab."
      };
    },
    action: function (win, s, id, arg) {
      var app = ctApp(win);
      var counters = ctCounters(app);
      var each = function (re, fn) {
        Object.keys(counters).forEach(function (n) { if (re.test(n)) fn(n, counters[n]); });
      };
      if (id === "six") {
        /* Hours roll over on each game's own schedule, so set the clock to
           5 AM and fast-forward (animatronics held still) until it does. */
        each(CLOCK, function (n, list) { ctSet(list, 5); });
        var clock = timeControl(win);
        s.skip = { frame: app.frame.frameName, speed: clock.speed, ticks: 0 };
        clock.speed = 4;
      }
      if (id === "rich") each(MONEY, function (n, list) { ctSet(list, 999999); });
      if (id.indexOf("c:") === 0) {
        var name = id.slice(2);
        if (!counters[name]) return;
        if (arg && arg.unlock) { delete s.locks[name]; return; }
        var v = Number(arg && arg.value);
        if (!isFinite(v)) return;
        ctSet(counters[name], v);
        if (arg.lock) s.locks[name] = v;
      }
    },
    tick: function (win, s) {
      var app = ctApp(win);
      if (!app || !app.run) return;
      var counters = ctCounters(app);
      if (s.skip) {
        var hour = null;
        Object.keys(counters).forEach(function (n) { if (CLOCK.test(n)) hour = counters[n][0].rsValue; });
        if (app.frame.frameName !== s.skip.frame || (hour !== null && hour !== 5) || ++s.skip.ticks > 3600) {
          timeControl(win).speed = s.skip.speed;
          s.skip = null;
        }
      }
      Object.keys(counters).forEach(function (n) {
        var list = counters[n];
        var now = list[0].rsValue;
        if (POWER.test(n)) s.peak[n] = Math.max(s.peak[n] || 0, now);
        if (s.on.power && POWER.test(n) && now < s.peak[n]) ctSet(list, s.peak[n]);
        if ((s.on.freeze || s.skip) && ENEMY_AI.test(n) && now !== 0) ctSet(list, 0);
        if (s.locks[n] !== undefined && now !== s.locks[n]) ctSet(list, s.locks[n]);
      });
    }
  };

  /* ------------------------------------------------------ Construct 2/3 */

  /* Global variables as { name, get(), set(v) }: Construct 2's runtime, or
     Construct 3's when it runs on the page (not in a worker). */
  function cVars(win) {
    try {
      var rt = win.cr_getC2Runtime && win.cr_getC2Runtime();
      if (rt && rt.all_global_vars) {
        return rt.all_global_vars.map(function (gv) {
          return { name: gv.name, get: function () { return gv.data; }, set: function (v) { gv.data = v; } };
        });
      }
    } catch (e) {}
    try {
      var ri = win.c3_runtimeInterface;
      var local = ri && (ri._localRuntime || (ri._GetLocalRuntime && ri._GetLocalRuntime()));
      var gvs = local && local.GetIRuntime().globalVars;
      if (gvs) {
        return Object.keys(gvs).map(function (k) {
          return { name: k, get: function () { return gvs[k]; }, set: function (v) { gvs[k] = v; } };
        });
      }
    } catch (e) {}
    return null;
  }
  var RICH = /gem|gold|star|xp|diamond|crystal|energy|power/i;
  var construct = {
    name: "Construct",
    detect: function (win) { return !!(cVars(win) || []).length; },
    items: function (win, s) {
      var items = [];
      cVars(win).forEach(function (gv) {
        var v = gv.get();
        if (typeof v !== "number" || !gv.name) return;
        items.push({ id: "g:" + gv.name, label: gv.name, type: "value", group: "Game values",
          value: Math.round(v * 100) / 100, locked: s.locks[gv.name] !== undefined });
      });
      var money = items.filter(function (i) { return MONEY.test(i.label) || RICH.test(i.label) || /lives|life/i.test(i.label); });
      if (money.length) items.unshift({ id: "rich", label: "Max coins, gems & the like", type: "button", group: "Stuff" });
      return { items: items, note: items.length ? "" : "This game keeps no editable values." };
    },
    action: function (win, s, id, arg) {
      var vars = cVars(win) || [];
      if (id === "rich") {
        vars.forEach(function (gv) {
          if (typeof gv.get() !== "number") return;
          if (MONEY.test(gv.name) || RICH.test(gv.name)) gv.set(999999);
          else if (/lives|life/i.test(gv.name)) gv.set(99);
        });
      }
      if (id.indexOf("g:") === 0) {
        var name = id.slice(2);
        var gv = vars.filter(function (g) { return g.name === name; })[0];
        if (!gv) return;
        if (arg && arg.unlock) { delete s.locks[name]; return; }
        var v = Number(arg && arg.value);
        if (!isFinite(v)) return;
        gv.set(v);
        if (arg.lock) s.locks[name] = v;
      }
    },
    tick: function (win, s) {
      if (!Object.keys(s.locks).length) return;
      (cVars(win) || []).forEach(function (gv) { if (s.locks[gv.name] !== undefined) gv.set(s.locks[gv.name]); });
    }
  };

  /* ----------------------------------------------------------- Phaser 2 */

  function phGame(win) {
    var P = win.Phaser;
    if (!P || !P.GAMES) return null;
    for (var i = 0; i < P.GAMES.length; i++) if (P.GAMES[i] && P.GAMES[i].state) return P.GAMES[i];
    return null;
  }
  function phState(game) {
    var st = game.state;
    return st.getCurrentState ? st.getCurrentState() : st.states[st.current];
  }
  var PH_HERO = /^(hero|player|sonic|mario|character|dude|avatar|ship|car|bike|ball|me|you)\d*$/i;
  function phHero(state) {
    if (!state) return null;
    var named = state.hero || state.player || state.sonic || state.mario || state.character;
    if (named) return named;
    var keys = Object.keys(state);
    for (var i = 0; i < keys.length; i++) {
      var v = state[keys[i]];
      if (PH_HERO.test(keys[i]) && v && v.body && typeof v.x === "number") return v;
    }
    return null;
  }
  /* Speed, fly, gravity and no clip tweak an Arcade physics body. */
  function phArcade(hero) { return !!(hero && hero.body && hero.body.checkCollision && hero.body.velocity); }
  var PH_SKIP = /^(game|world|camera|time|add|make|input|load|cache|sound|stage|tweens|physics|particles|rnd|key|scale|state|math)$/;
  function phNumbers(state) {
    var out = [];
    Object.keys(state || {}).forEach(function (k) {
      if (PH_SKIP.test(k) || k.charAt(0) === "_") return;
      if (typeof state[k] === "number" && isFinite(state[k])) out.push(k);
    });
    return out.sort();
  }
  var PH_NEXT = ["goToNextLevel", "nextLevel", "levelComplete", "winLevel", "win"];

  var phaser = {
    name: "Phaser",
    detect: function (win) { return !!phGame(win); },
    items: function (win, s) {
      var state = phState(phGame(win));
      var hero = phHero(state);
      var items = [];
      if (state && PH_NEXT.some(function (f) { return typeof state[f] === "function"; })) {
        items.push({ id: "next", label: "Skip this level", type: "button", group: "Player" });
      }
      var nums = phNumbers(state);
      if (nums.some(function (k) { return MONEY.test(k) || /ring|live|star|gem/i.test(k); })) {
        items.push({ id: "rich", label: "Max rings, coins & score", type: "button", group: "Stuff" });
      }
      nums.forEach(function (k) {
        items.push({ id: "n:" + k, label: k, type: "value", group: "Values",
          value: Math.round(state[k] * 100) / 100, locked: s.locks[k] !== undefined });
      });
      return { items: items, note: state ? "" : "Start playing and these switch on." };
    },
    action: function (win, s, id, arg) {
      var state = phState(phGame(win));
      if (!state) return;
      if (id === "next") {
        /* Phaser pauses when its frame loses focus (clicking this menu does
           that), and the level change waits on a fade that needs it running. */
        var game = phGame(win);
        if (game.paused) game.paused = false;
        if (game.gameResumed && game._paused) game.gameResumed({});
        for (var i = 0; i < PH_NEXT.length; i++) {
          if (typeof state[PH_NEXT[i]] === "function") { state[PH_NEXT[i]](); break; }
        }
      }
      if (id === "rich") {
        phNumbers(state).forEach(function (k) {
          if (MONEY.test(k) || /ring|gem|star/i.test(k)) state[k] = 999;
          if (/lives?$/i.test(k)) state[k] = 99;
        });
      }
      if (id.indexOf("n:") === 0) {
        var k = id.slice(2);
        if (arg && arg.unlock) { delete s.locks[k]; return; }
        var v = Number(arg && arg.value);
        if (!isFinite(v)) return;
        state[k] = v;
        if (arg.lock) s.locks[k] = v;
      }
    },
    tick: function (win, s) {
      var game = phGame(win);
      var state = game && phState(game);
      if (!state) return;
      Object.keys(s.locks).forEach(function (k) { if (typeof state[k] === "number") state[k] = s.locks[k]; });
      var hero = phHero(state);
      if (!hero) return;
      var body = hero.body;
      if (!body) return;
      var kb = game.input && game.input.keyboard;
      var down = function (code) { try { return kb.isDown(code); } catch (e) { return false; } };
      if (s.on["q:fly"] && !s.on["q:noclip"] && (down(38) || down(32) || down(87))) {
        body.velocity.y = -Math.max(250, Math.abs(body.maxVelocity ? body.maxVelocity.y : 0) * 0.4);
      }
      if (s.on["q:speed"] && body.velocity.x) {
        var cap = body.maxVelocity && body.maxVelocity.x ? body.maxVelocity.x : 0;
        if (!s.fastCap && cap) { s.fastCap = cap; body.maxVelocity.x = cap * 2; }
        body.velocity.x = body.velocity.x > 0 ? Math.max(body.velocity.x, 400) : Math.min(body.velocity.x, -400);
      } else if (!s.on["q:speed"] && s.fastCap) {
        body.maxVelocity.x = s.fastCap;
        s.fastCap = 0;
      }
    }
  };

  /* -------------------------------------------------- Eaglercraft (MC) */

  /* Minecraft cheats are its own commands, typed into chat like a player
     would. They work in singleplayer worlds with cheats allowed. */
  var KEYCODES = { "/": 191, " ": 32, "-": 189, "~": 192, ".": 190, ",": 188, "_": 189, "=": 187, "@": 50, ":": 186 };
  function keyEvent(win, type, key) {
    var code = key.length === 1
      ? (KEYCODES[key] || key.toUpperCase().charCodeAt(0))
      : ({ Enter: 13, Escape: 27 })[key];
    var ev = new win.KeyboardEvent(type, { key: key, bubbles: true, cancelable: true,
      code: key.length === 1 && /[a-z]/i.test(key) ? "Key" + key.toUpperCase() : key === "Enter" ? "Enter" : "" });
    ["keyCode", "which"].forEach(function (p) {
      try { Object.defineProperty(ev, p, { get: function () { return code; } }); } catch (e) {}
    });
    return ev;
  }
  function press(win, key) {
    var target = win.document.activeElement && win.document.activeElement !== win.document.body
      ? win.document.activeElement : win;
    target.dispatchEvent(keyEvent(win, "keydown", key));
    if (key.length === 1) target.dispatchEvent(keyEvent(win, "keypress", key));
    target.dispatchEvent(keyEvent(win, "keyup", key));
  }
  function typeCommand(win, text) {
    var chars = text.split("");
    var i = 0;
    /* "/" opens chat with the slash already typed. */
    press(win, "/");
    function next() {
      if (i < chars.length) { press(win, chars[i++]); win.setTimeout(next, 12); return; }
      win.setTimeout(function () { press(win, "Enter"); }, 40);
    }
    win.setTimeout(next, 250);
  }

  var MC = [
    ["creative", "Creative mode (fly)", "gamemode 1"],
    ["survival", "Survival mode", "gamemode 0"],
    ["day", "Make it day", "time set 1000"],
    ["clear", "Clear weather", "weather clear 999999"],
    ["heal", "Heal & feed", "effect @p minecraft:instant_health 1 10"],
    ["saturation", "Never hungry", "effect @p minecraft:saturation 99999 10 true"],
    ["speed", "Super speed", "effect @p minecraft:speed 99999 3 true"],
    ["jump", "Super jump", "effect @p minecraft:jump_boost 99999 3 true"],
    ["vision", "Night vision", "effect @p minecraft:night_vision 99999 0 true"],
    ["resist", "Can't be hurt", "effect @p minecraft:resistance 99999 10 true"],
    ["diamonds", "64 diamonds", "give @p minecraft:diamond 64"],
    ["gear", "Diamond sword", "give @p minecraft:diamond_sword 1"],
    ["keepinv", "Keep items when you die", "gamerule keepInventory true"],
    ["xp", "100 XP levels", "xp 100L @p"]
  ];
  var eagler = {
    name: "Minecraft (Eaglercraft)",
    detect: function (win) {
      return !!(win.eaglercraftXOpts || win.eaglercraftXOptsHints || win.eaglercraftOpts ||
        /eaglercraft/i.test(win.document.title || ""));
    },
    items: function () {
      var items = MC.map(function (c) { return { id: "mc:" + c[0], label: c[1], type: "button", group: "Commands" }; });
      items.push({ id: "mc-custom", label: "Run a command", type: "text", group: "Commands", placeholder: "give @p minecraft:elytra" });
      return {
        items: items,
        note: "Works in singleplayer worlds with cheats on (Allow Cheats when creating the world, or Share to LAN with cheats). Click into the game first."
      };
    },
    action: function (win, s, id, arg) {
      var cmd = null;
      if (id === "mc-custom") cmd = String(arg && arg.value || "").replace(/^\/+/, "").slice(0, 200);
      MC.forEach(function (c) { if (id === "mc:" + c[0]) cmd = c[2]; });
      if (cmd) typeCommand(win, cmd);
    }
  };

  /* ------------------------------------------------------ Unity WebGL */

  /* Unity games keep their save (PlayerPrefs) as one small file in the
     page's IndexedDB, at /idbfs/<md5 of the game's folder URL>/PlayerPrefs.
     The game only reads it at start, so edits are written there and the
     game restarts to pick them up. Games Unity loads with UnityLoader
     (2019 and older) and createUnityInstance (2020+) both work this way. */

  function md5(str) {
    function add(x, y) { var l = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff); }
    function step(q, a, b, x, s, t) { q = add(add(a, q), add(x, t)); return add((q << s) | (q >>> (32 - s)), b); }
    var bytes = unescape(encodeURIComponent(str));
    var n = bytes.length, words = [], i;
    for (i = 0; i < n; i++) words[i >> 2] |= bytes.charCodeAt(i) << ((i % 4) * 8);
    words[n >> 2] |= 0x80 << ((n % 4) * 8);
    words[(((n + 8) >> 6) + 1) * 16 - 2] = n * 8;
    var S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (i = 0; i < words.length; i += 16) {
      var A = a, B = b, C = c, D = d;
      for (var j = 0; j < 64; j++) {
        var r = j >> 4, f, g;
        if (r === 0) { f = (b & c) | (~b & d); g = j; }
        else if (r === 1) { f = (b & d) | (c & ~d); g = (5 * j + 1) % 16; }
        else if (r === 2) { f = b ^ c ^ d; g = (3 * j + 5) % 16; }
        else { f = c ^ (b | ~d); g = (7 * j) % 16; }
        var t = step(f, a, b, words[i + g] | 0, S[r * 4 + (j % 4)], Math.floor(Math.abs(Math.sin(j + 1)) * 4294967296) | 0);
        a = d; d = c; c = b; b = t;
      }
      a = add(a, A); b = add(b, B); c = add(c, C); d = add(d, D);
    }
    return [a, b, c, d].map(function (v) {
      var h = "";
      for (var k = 0; k < 4; k++) h += ("0" + ((v >>> (k * 8)) & 255).toString(16)).slice(-2);
      return h;
    }).join("");
  }

  /* PlayerPrefs file: "UnityPrf" + 8 header bytes, then entries of
     key, then 0xFE int32 | 0xFD float32 | a length-prefixed UTF-8 string.
     Lengths under 128 are one byte; longer ones are 0x80 + int32. */
  function prefsParse(bytes) {
    var list = [];
    if (!bytes || bytes.length < 16) return list;
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var p = 16;
    function len() {
      var n = bytes[p++];
      if (n === 0x80) { n = dv.getInt32(p, true); p += 4; }
      return n;
    }
    function text(n) {
      var s = "";
      for (var i = 0; i < n; i++) s += String.fromCharCode(bytes[p + i]);
      p += n;
      try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
    }
    while (p < bytes.length) {
      var key = text(len());
      var t = bytes[p];
      if (t === 0xFE) { list.push({ key: key, type: "int", value: dv.getInt32(p + 1, true) }); p += 5; }
      else if (t === 0xFD) { list.push({ key: key, type: "float", value: dv.getFloat32(p + 1, true) }); p += 5; }
      else list.push({ key: key, type: "string", value: text(len()) });
    }
    return list;
  }
  function prefsBuild(header, list) {
    var out = [];
    var i;
    for (i = 0; i < 16; i++) out.push(header && header.length >= 16 ? header[i] : [85, 110, 105, 116, 121, 80, 114, 102, 0, 0, 1, 0, 0, 0, 16, 0][i]);
    function len(n) {
      if (n < 128) out.push(n);
      else out.push(0x80, n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
    }
    function text(s) {
      var b = unescape(encodeURIComponent(s));
      len(b.length);
      for (var k = 0; k < b.length; k++) out.push(b.charCodeAt(k));
    }
    list.forEach(function (e) {
      text(e.key);
      if (e.type === "string") { text(String(e.value)); return; }
      var buf = new DataView(new ArrayBuffer(4));
      if (e.type === "float") buf.setFloat32(0, e.value, true);
      else buf.setInt32(0, e.value, true);
      out.push(e.type === "float" ? 0xFD : 0xFE);
      for (i = 0; i < 4; i++) out.push(buf.getUint8(i));
    });
    return new Uint8Array(out);
  }

  function idb(win, fn) {
    return new Promise(function (resolve, reject) {
      var req = win.indexedDB.open("/idbfs");
      req.onerror = function () { reject(new Error("This game's save can't be opened.")); };
      req.onupgradeneeded = function () {
        /* No save yet at all: don't create an empty database Unity then trips on. */
        req.transaction.abort();
      };
      req.onsuccess = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("FILE_DATA")) { db.close(); reject(new Error("This game hasn't saved anything yet. Play a little first.")); return; }
        fn(db.transaction("FILE_DATA", "readwrite").objectStore("FILE_DATA"), function (v) { db.close(); resolve(v); }, reject);
      };
    });
  }
  function ask(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  /* Where this game's save lives. Unity 5.6 and later name the folder after
     the page's folder URL; Unity 5.x before that keeps one /idbfs/PlayerPrefs
     for the whole host. Only this game's own folder is used when it exists,
     since every game on a host shares one /idbfs. */
  function unityDir(win) {
    var url = String(win.location.href).split(/[?#]/)[0];
    return "/idbfs/" + md5(url.slice(0, url.lastIndexOf("/")));
  }
  function unityFind(win) {
    var mine = unityDir(win) + "/PlayerPrefs";
    return idb(win, function (store, done, fail) {
      ask(store.getKey(mine)).then(function (k) {
        if (k !== undefined) return mine;
        return ask(store.getKey("/idbfs/PlayerPrefs")).then(function (old) {
          return old === undefined ? null : "/idbfs/PlayerPrefs";
        });
      }).then(done, fail);
    });
  }

  function unityLoad(win, s) {
    return unityFind(win).then(function (key) {
      if (!key) { s.unity = { error: "This game hasn't saved anything yet. Play a little, then Refresh." }; return; }
      return idb(win, function (store, done, fail) {
        ask(store.get(key)).then(function (rec) {
          s.unity = { key: key, header: rec.contents.slice(0, 16), prefs: prefsParse(rec.contents) };
        }).then(done, fail);
      });
    }).catch(function (err) {
      s.unity = { error: (err && err.message) || "This game's save can't be read." };
    });
  }

  /* changes: { key: number | string | null (delete) }. Keeps a copy of the
     save from before the first edit so it can be put back. */
  function unityWrite(win, s, changes) {
    var u = s.unity;
    if (!u || !u.key) return Promise.reject(new Error("This game hasn't saved anything yet."));
    return idb(win, function (store, done, fail) {
      ask(store.get(u.key)).then(function (rec) {
        var backup = "ach:unity-backup:" + u.key;
        try {
          if (!win.localStorage.getItem(backup)) {
            win.localStorage.setItem(backup, Array.prototype.map.call(rec.contents, function (b) {
              return ("0" + b.toString(16)).slice(-2);
            }).join(""));
          }
        } catch (e) { /* private mode: no undo, the edit still works */ }
        var list = prefsParse(rec.contents);
        Object.keys(changes).forEach(function (k) {
          var v = changes[k];
          var at = -1;
          list.forEach(function (e, i) { if (e.key === k) at = i; });
          if (v === null) { if (at !== -1) list.splice(at, 1); return; }
          var type = typeof v === "string" ? "string"
            : at !== -1 && list[at].type === "float" ? "float"
            : Math.round(v) === v ? "int" : "float";
          if (type === "int") v = Math.max(-2147483648, Math.min(2147483647, Math.round(v)));
          var entry = { key: k, type: type, value: v };
          if (at === -1) list.push(entry); else list[at] = entry;
        });
        rec.contents = prefsBuild(rec.contents, list);
        rec.timestamp = new Date();
        return ask(store.put(rec, u.key));
      }).then(done, fail);
    }).then(function () { s.restart = true; });
  }

  function unityUndo(win, s) {
    var u = s.unity;
    var saved = null;
    try { saved = win.localStorage.getItem("ach:unity-backup:" + u.key); } catch (e) {}
    if (!saved) return Promise.resolve();
    var bytes = new Uint8Array(saved.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(saved.substr(i * 2, 2), 16);
    return idb(win, function (store, done, fail) {
      ask(store.get(u.key)).then(function (rec) {
        rec.contents = bytes;
        rec.timestamp = new Date();
        return ask(store.put(rec, u.key));
      }).then(done, fail);
    }).then(function () {
      try { win.localStorage.removeItem("ach:unity-backup:" + u.key); } catch (e) {}
      s.restart = true;
    });
  }

  /* Extras for particular Unity games, found by their page. Each value was
     checked in the running game. */
  var UNITY_GAMES = [
    {
      match: /house[\s_-]*of[\s_-]*hazards/i,
      name: "House of Hazards",
      items: [
        { id: "u:hoh-chars", label: "Unlock every character", type: "button",
          hint: "Robo Rob, Buster, Rocking Grandma and Super Sam, without playing for them or watching ads" },
        { id: "u:hoh-relock", label: "Lock them again", type: "button",
          hint: "Back to the four starting characters" },
        { id: "u:hoh-skip", label: "Skip task", type: "button", live: true,
          hint: "Ticks off the task on the note; do it on the last one to win the round" },
        { id: "u:hoh-back", label: "Previous task", type: "button", live: true,
          hint: "Puts the last task back on the note" },
        { id: "u:hoh-restart", label: "Restart round", type: "button", live: true,
          hint: "Same players and characters, back to the first task" }
      ],
      /* In a round, the game's Gamemanager and TaskManager sit on "Scripts". */
      live: { "u:hoh-skip": ["Scripts", "CompletedTask"], "u:hoh-back": ["Scripts", "PreviousTask"],
        "u:hoh-restart": ["Scripts", "RestartGame"] },
      action: function (win, s, id) {
        if (this.live[id]) {
          if (!unitySend(win, this.live[id][0], this.live[id][1])) {
            throw new Error("Start a round first; this works while you're playing.");
          }
          return;
        }
        var keys = ["Character_4", "Character_5", "Character_6", "Character_7"];
        var ch = {};
        keys.forEach(function (k) { ch[k] = id === "u:hoh-chars" ? 1 : null; });
        return unityWrite(win, s, ch);
      }
    }
  ];

  /* SendMessage to a GameObject, and whether anything was there to get it.
     Unity doesn't throw for a missing object; it logs, so listen for that. */
  function unitySend(win, obj, method, arg) {
    var inst = win.unityInstance || win.unityGame || win.gameInstance || (typeof win.SendMessage === "function" ? win : null);
    if (!inst || typeof inst.SendMessage !== "function") return false;
    var missed = false;
    var c = win.console, keep = [c.log, c.warn, c.error];
    var hear = function (m) { if (/SendMessage: object .* (not found|does not have receiver)/.test(String(m))) missed = true; };
    c.log = c.warn = c.error = hear;
    try {
      if (arg === undefined) inst.SendMessage(obj, method); else inst.SendMessage(obj, method, arg);
    } catch (e) { missed = true; }
    finally { c.log = keep[0]; c.warn = keep[1]; c.error = keep[2]; }
    return !missed;
  }
  function unityProfile(win) {
    var where = String(win.location.pathname) + " " + (win.document.title || "");
    return UNITY_GAMES.filter(function (g) { return g.match.test(where); })[0] || null;
  }

  var unity = {
    name: "Unity",
    detect: function (win) {
      return !!(win.UnityLoader || win.createUnityInstance || win.unityInstance || win.unityGame ||
        (win.gameInstance && typeof win.gameInstance.SendMessage === "function") ||
        /* Unity 5.0-5.5: a bare Module with SendMessage on the window. */
        (win.Module && typeof win.SendMessage === "function" &&
          (typeof win.UnityProgress === "function" || /unity/i.test(String(win.document.title || "")) ||
           /\.(data|unity3d|datagz|unityweb)(\?|$)/i.test(String(win.Module.dataUrl || "")))));
    },
    load: unityLoad,
    items: function (win, s) {
      var game = unityProfile(win);
      var items = game ? game.items.map(function (it) {
        return { id: it.id, label: it.label, hint: it.hint, type: it.type, group: it.live ? "In this round" : game.name };
      }) : [];
      var u = s.unity || {};
      if (u.error) return { items: items, note: u.error };
      var nums = (u.prefs || []).filter(function (e) {
        if (/^unity\./.test(e.key)) return false;
        /* Some games keep numbers as text; those count too. */
        return e.type !== "string" || /^-?\d+(\.\d+)?$/.test(e.value);
      }).slice(0, 60);
      var money = nums.filter(function (e) { return WANTED.test(e.key); });
      if (money.length) {
        items.push({ id: "u:rich", label: "Max everything", type: "button", group: "Save",
          hint: "Coins, gems, score and the like to 999,999" });
      }
      var backup = false;
      try { backup = !!(u.key && win.localStorage.getItem("ach:unity-backup:" + u.key)); } catch (e) {}
      if (backup) {
        items.push({ id: "u:undo", label: "Undo save edits", type: "button", group: "Save",
          hint: "Puts back the save from before the first change" });
      }
      nums.forEach(function (e) {
        items.push({ id: "u:v:" + e.key, label: e.key, type: "value", group: "Saved values",
          value: Math.round(Number(e.value) * 100) / 100, noLock: true });
      });
      return {
        items: items,
        note: game
          ? (nums.length ? "Save edits restart the game so it loads them." : "")
          : "Unity game. Changing a saved value restarts the game so it loads the new number" +
            (nums.length ? "." : ". Nothing editable is saved yet; play a round, then Refresh.")
      };
    },
    action: function (win, s, id, arg) {
      var game = unityProfile(win);
      if (game && id.indexOf("u:v:") !== 0 && game.items.some(function (it) { return it.id === id; })) {
        return game.action.call(game, win, s, id, arg);
      }
      if (id === "u:undo") return unityUndo(win, s);
      if (id === "u:rich") {
        var ch = {};
        ((s.unity && s.unity.prefs) || []).forEach(function (e) {
          var numeric = e.type !== "string" || /^-?\d+(\.\d+)?$/.test(e.value);
          if (numeric && !/^unity\./.test(e.key) && WANTED.test(e.key)) {
            var v = /lives|life/i.test(e.key) ? 99 : 999999;
            ch[e.key] = e.type === "string" ? String(v) : v;
          }
        });
        return unityWrite(win, s, ch);
      }
      if (id.indexOf("u:v:") === 0) {
        var v = Number(arg && arg.value);
        if (!isFinite(v)) return;
        var key = id.slice(4), one = {};
        var was = ((s.unity && s.unity.prefs) || []).filter(function (e) { return e.key === key; })[0];
        one[key] = was && was.type === "string" ? String(v) : v;
        return unityWrite(win, s, one);
      }
    }
  };

  /* ---------------------------------------- known games: their own API */

  /* Some games keep a well-known object on the window. Each entry here
     gets its own menu of cheats built on that object. To add a game:
     detect (is this it?), items (the menu), action (do it). Holding
     cheats go in tick, which runs every frame. */

  var dino = {
    name: "Chrome Dino",
    detect: function (win) { return !!(win.Runner && win.Runner.instance_ && win.Runner.instance_.tRex); },
    items: function (win) {
      var r = win.Runner.instance_;
      return {
        note: "Press space to start a run first.",
        items: [
          { id: "dino-god", label: "Can't crash", type: "toggle", group: "Run", hint: "Cacti and birds pass straight through" },
          { id: "dino-auto", label: "Auto-jump", type: "toggle", group: "Run", hint: "Jumps and ducks by itself" },
          { id: "dino-speed", label: "Speed", type: "value", group: "Run", value: Math.round(r.currentSpeed * 10) / 10,
            locked: false, noLock: true },
          { id: "dino-score", label: "Score", type: "value", group: "Run",
            value: Math.round(r.distanceMeter.getActualDistance(Math.ceil(r.distanceRan))), noLock: true },
          { id: "dino-hi", label: "Set high score to 99,999", type: "button", group: "Score" },
          { id: "dino-night", label: "Toggle night mode", type: "button", group: "Look" }
        ]
      };
    },
    action: function (win, s, id, arg) {
      var r = win.Runner.instance_;
      var v = Number(arg && arg.value);
      if (id === "dino-speed" && isFinite(v)) {
        if (s.dinoMax === undefined) s.dinoMax = r.config.MAX_SPEED;
        r.currentSpeed = Math.max(1, Math.min(60, v));
        /* Lets it hold a speed above the normal top speed, without raising
           the cap left over from an earlier, faster setting. */
        r.config.MAX_SPEED = Math.max(s.dinoMax, r.currentSpeed);
      }
      if (id === "dino-score" && isFinite(v)) {
        /* The meter shows distance scaled by its coefficient (0.025). */
        r.distanceRan = Math.max(0, v) / (r.distanceMeter.config.COEFFICIENT || 0.025);
      }
      if (id === "dino-hi") {
        r.highestScore = 99999 / (r.distanceMeter.config.COEFFICIENT || 0.025);
        r.distanceMeter.setHighScore(r.highestScore);
      }
      if (id === "dino-night") r.invert(true);
      if (id === "dino-god") {
        if (!win.__achDinoCrash) win.__achDinoCrash = win.checkForCollision;
        win.checkForCollision = s.on["dino-god"] ? function () { return false; } : win.__achDinoCrash;
      }
    },
    tick: function (win, s) {
      if (!s.on["dino-auto"]) return;
      var r = win.Runner.instance_;
      if (!r || !r.playing || r.crashed) return;
      var t = r.tRex, o = r.horizon && r.horizon.obstacles[0];
      if (!o) return;
      var gap = o.xPos - (t.xPos + t.config.WIDTH);
      var reach = 40 + r.currentSpeed * 9;
      /* Birds flying high are ducked under; everything else is jumped. */
      var high = o.typeConfig.type === "PTERODACTYL" && o.yPos < 75;
      if (gap > 0 && gap < reach) {
        if (high) { if (!t.ducking) t.setDuck(true); }
        else if (!t.jumping) { if (t.ducking) t.setDuck(false); t.startJump(r.currentSpeed); }
      } else if (t.ducking && gap < 0) t.setDuck(false);
    }
  };

  var cookie = {
    name: "Cookie Clicker",
    detect: function (win) { return !!(win.Game && win.Game.Objects && win.Game.Earn && win.Game.cookiesPs !== undefined); },
    items: function (win) {
      var G = win.Game;
      var items = [
        { id: "ck-add", label: "Cookies", type: "value", group: "Cookies", value: Math.floor(G.cookies), noLock: true },
        { id: "ck-lots", label: "+1 trillion cookies", type: "button", group: "Cookies" },
        { id: "ck-auto", label: "Auto-clicker", type: "toggle", group: "Cookies", hint: "About 20 clicks a second" },
        { id: "ck-golden", label: "Spawn a golden cookie", type: "button", group: "Cookies" },
        { id: "ck-frenzy", label: "Frenzy ×7 for a minute", type: "button", group: "Cookies" },
        { id: "ck-lumps", label: "+100 sugar lumps", type: "button", group: "Unlocks" },
        { id: "ck-buildings", label: "+50 of every building", type: "button", group: "Unlocks" },
        { id: "ck-upgrades", label: "Buy every upgrade", type: "button", group: "Unlocks",
          hint: "Every upgrade at once; it can't be undone except by wiping the save" },
        { id: "ck-achievements", label: "Unlock every achievement", type: "button", group: "Unlocks" },
        { id: "ck-save", label: "Save now", type: "button", group: "Save" }
      ];
      return { items: items, note: "The game saves every minute; press Save now to keep changes right away." };
    },
    action: function (win, s, id, arg) {
      var G = win.Game;
      var v = Number(arg && arg.value);
      if (id === "ck-add" && isFinite(v) && v >= 0) {
        var d = v - G.cookies;
        if (d > 0) G.Earn(d); else G.cookies = v;
      }
      if (id === "ck-lots") G.Earn(1e12);
      if (id === "ck-golden") new G.shimmer("golden");
      if (id === "ck-frenzy") G.gainBuff("frenzy", 60, 7);
      if (id === "ck-lumps") G.gainLumps(100);
      if (id === "ck-buildings") {
        Object.keys(G.Objects).forEach(function (k) { G.Objects[k].getFree(50); });
      }
      if (id === "ck-upgrades") G.SetAllUpgrades(1);
      if (id === "ck-achievements") G.SetAllAchievs(1);
      if (id === "ck-save") G.WriteSave();
      G.upgradesToRebuild = 1;
      G.recalculateGains = 1;
    },
    tick: function (win, s) {
      if (!s.on["ck-auto"]) return;
      var now = Date.now();
      if (now - (s.ckLast || 0) < 50) return;
      s.ckLast = now;
      try { win.Game.ClickCookie(); } catch (e) {}
    }
  };

  /* Moto X3M (all five): progress is JSON in localStorage next to a
     "<key>h" copy of its Java-style string hash; a save whose hash doesn't
     match is wiped. Edits are re-signed, then the game restarts to load them. */
  function mxHash(t) {
    var e = 0;
    for (var i = 0; i < t.length; i++) { e = (e << 5) - e + t.charCodeAt(i); e |= 0; }
    return String(e);
  }
  /* Every copy shares one site, so each game's own key is picked by its
     folder; anything else falls back to the only valid save there is. */
  var MX_KEYS = { "motox3m": "mx3m_poki", "moto-x3m-2": "mx3m2sf2_y8", "motox3m2": "mx3m2sf2_y8",
    "motox3m-spooky": "mx3m_6_gd", "motox3m-winter": "mx3m_4_gd", "motox3mwinter": "mx3m_4_gd",
    "moto-x3m-pool-party": "mx3m_5_pk", "motox3m-pool": "mx3m_5_gd" };
  function mxSave(win) {
    var ls;
    try { ls = win.localStorage; } catch (e) { return null; }
    var dir = (String(win.location.pathname).match(/([^\/]+)\/[^\/]*$/) || [])[1];
    var keys = MX_KEYS[dir] ? [MX_KEYS[dir]] : [];
    if (!keys.length) {
      for (var i = 0; i < ls.length; i++) {
        var k0 = ls.key(i);
        if (/^mx3m/.test(k0) && ls.getItem(k0 + "h") !== null) keys.push(k0);
      }
      if (keys.length !== 1) return null;
    }
    var k = keys[0], raw = ls.getItem(k), sig = ls.getItem(k + "h");
    if (!raw || sig === null || mxHash(raw) !== sig) return null;
    try {
      var data = JSON.parse(raw);
      if (data && data.invsav) return { key: k, data: data };
    } catch (e) {}
    return null;
  }
  var moto = {
    name: "Moto X3M",
    detect: function (win) {
      if (!win.Phaser) return false;
      if (mxSave(win)) return true;
      var dir = (String(win.location.pathname).match(/([^\/]+)\/[^\/]*$/) || [])[1];
      return !!MX_KEYS[dir];
    },
    items: function (win) {
      var found = mxSave(win);
      if (!found) {
        return { items: [], note: "Press Play once (Local Save in Moto X3M 2) so the game makes its save, then Refresh." };
      }
      var sv = found.data.invsav;
      var levels = Object.keys(sv).filter(function (k) { return /^r_\d+_r$/.test(k); }).length;
      var bikes = Object.keys(sv).filter(function (k) { return /^skin\d+$/.test(k) && sv[k] === true; }).length;
      return {
        note: "Changes restart the game so it loads them.",
        items: [
          { id: "mx-levels", label: "Unlock every level", type: "button", group: "Unlocks",
            hint: levels + " open now; all of them get 3 stars" },
          { id: "mx-bikes", label: "Unlock every bike", type: "button", group: "Unlocks",
            hint: (bikes || 1) + " of 8 owned now" },
          { id: "mx-reset", label: "Start the save over", type: "button", group: "Save",
            hint: "Back to level 1 and the first bike" }
        ]
      };
    },
    action: function (win, s, id) {
      var found = mxSave(win);
      if (!found) throw new Error("Open the level list once so the game saves, then try again.");
      var sv = found.data.invsav;
      if (id === "mx-reset") {
        win.localStorage.removeItem(found.key);
        win.localStorage.removeItem(found.key + "h");
        s.restart = true;
        return;
      }
      if (id === "mx-levels") {
        /* Intro levels (Moto X3M 1) are ri_N, the rest r_N; covering 60
           handles every edition, and the game ignores numbers it lacks. */
        if (Object.keys(sv).some(function (k) { return /^ri_\d+_r$/.test(k); })) {
          for (var j = 1; j <= 10; j++) sv["ri_" + j + "_r"] = 3;
        }
        for (var i = 1; i <= 60; i++) sv["r_" + i + "_r"] = 3;
      }
      if (id === "mx-bikes") for (var b = 1; b <= 8; b++) sv["skin" + b] = true;
      var raw = JSON.stringify(found.data);
      win.localStorage.setItem(found.key, raw);
      win.localStorage.setItem(found.key + "h", mxHash(raw));
      s.restart = true;
    }
  };

  /* Retro Bowl (GameMaker): each save slot is an INI in localStorage,
     "RetroBowl.<n>.savedata.ini", with plain key="value" lines. The game
     reads it when a save is loaded, so edits restart the game. */
  function rbSlots(win) {
    var out = [];
    try {
      for (var i = 0; i < win.localStorage.length; i++) {
        var k = win.localStorage.key(i);
        var m = /^RetroBowl\.(\d+)\.savedata\.ini$/.exec(k);
        if (m) out.push({ key: k, slot: Number(m[1]) + 1 });
      }
    } catch (e) {}
    return out.sort(function (a, b) { return a.slot - b.slot; });
  }
  function rbGet(text, name) {
    var m = new RegExp("^" + name + "=\"([^\"]*)\"", "m").exec(text);
    return m ? m[1] : null;
  }
  function rbSet(text, name, v) {
    var re = new RegExp("^(" + name + "=\")[^\"]*(\")", "m");
    return re.test(text) ? text.replace(re, "$1" + v + "$2") : text;
  }
  var RB_FIELDS = [
    ["coach_credit", "Coaching credits", 999],
    ["salary_cap", "Salary cap ($M)", 999],
    ["fans", "Fans (%)", 100],
    ["coach_rating", "Coach rating", 99],
    ["facility_stadium", "Stadium level", 5],
    ["facility_training", "Training level", 5],
    ["facility_rehab", "Rehab level", 5]
  ];
  var retroBowl = {
    name: "Retro Bowl",
    detect: function (win) {
      return /retro ?bowl/i.test(win.document.title || "") &&
        (rbSlots(win).length > 0 || /html5game/.test(String(win.document.documentElement.innerHTML).slice(0, 4000)));
    },
    items: function (win, s) {
      var slots = rbSlots(win);
      if (!slots.length) return { items: [], note: "Start a new game in any save slot first, then Refresh." };
      var cur = slots.filter(function (x) { return x.slot === s.rbSlot; })[0] || slots[0];
      s.rbSlot = cur.slot;
      var text = win.localStorage.getItem(cur.key) || "";
      var items = [];
      if (slots.length > 1) {
        slots.forEach(function (x) {
          items.push({ id: "rb-slot:" + x.slot, label: "Save " + x.slot, type: "toggle", group: "Which save", on: x.slot === cur.slot });
        });
      }
      items.push({ id: "rb-max", label: "Max everything", type: "button", group: "Team",
        hint: "999 credits and cap, 100% fans, top facilities" });
      RB_FIELDS.forEach(function (f) {
        var v = rbGet(text, f[0]);
        if (v !== null) items.push({ id: "rb:" + f[0], label: f[1], type: "value", group: "Team", value: Number(v), noLock: true });
      });
      return { items: items, note: "Edits apply when the game loads Save " + cur.slot + "; it restarts to do that." };
    },
    action: function (win, s, id, arg) {
      if (id.indexOf("rb-slot:") === 0) { s.rbSlot = Number(id.slice(8)); delete s.on[id]; return; }
      var slot = rbSlots(win).filter(function (x) { return x.slot === s.rbSlot; })[0] || rbSlots(win)[0];
      if (!slot) return;
      var text = win.localStorage.getItem(slot.key);
      if (id === "rb-max") RB_FIELDS.forEach(function (f) { text = rbSet(text, f[0], f[2]); });
      else if (id.indexOf("rb:") === 0) {
        var v = Math.round(Number(arg && arg.value));
        if (!isFinite(v) || v < 0) return;
        text = rbSet(text, id.slice(3), v);
      } else return;
      win.localStorage.setItem(slot.key, text);
      s.restart = true;
    }
  };

  /* 2048 (Gabriele Cirulli's and its many copies): the game in progress is
     JSON in localStorage ("gameState", or a variant name such as
     "gameStateCupcakes"), read when the page loads. */
  function g2048Keys(win) {
    var out = null;
    try {
      /* The game's own storage manager says which keys are its own; several
         2048s on one site each use different ones. */
      var m = new win.LocalStorageManager();
      var sk = m.gameStateKey || "gameState", bk = m.bestScoreKey || "bestScore";
      var v = JSON.parse(win.localStorage.getItem(sk));
      if (v && v.grid && v.grid.cells && typeof v.score === "number") out = { state: sk, best: bk, data: v };
    } catch (e) {}
    return out;
  }
  function g2048Tiles(data, fn) {
    data.grid.cells.forEach(function (col, x) {
      col.forEach(function (cell, y) { col[y] = fn(cell, x, y); });
    });
  }
  var g2048 = {
    name: "2048",
    detect: function (win) {
      /* 2048 Multitasking plays several boards off one save; left alone. */
      return typeof win.GameManager === "function" && typeof win.LocalStorageManager === "function" &&
        !/multitask/i.test(win.document.title || "");
    },
    items: function (win) {
      var k = g2048Keys(win);
      if (!k) return { items: [], note: "Make one move so the game saves, then Refresh." };
      var best = Number(win.localStorage.getItem(k.best)) || 0;
      return {
        note: "Changes restart the game so it loads the new board.",
        items: [
          { id: "g2-2048", label: "Turn the biggest tile into 2048", type: "button", group: "Board" },
          { id: "g2-clean", label: "Clear the 2s and 4s", type: "button", group: "Board",
            hint: "Frees up space; the rest of the board stays" },
          { id: "g2-double", label: "Double every tile", type: "button", group: "Board" },
          { id: "g2-score", label: "Score", type: "value", group: "Score", value: k.data.score, noLock: true },
          { id: "g2-best", label: "Best score", type: "value", group: "Score", value: best, noLock: true }
        ]
      };
    },
    action: function (win, s, id, arg) {
      var k = g2048Keys(win);
      if (!k) throw new Error("Make one move so the game saves, then try again.");
      var d = k.data, v = Math.round(Number(arg && arg.value));
      if (id === "g2-best") {
        if (!isFinite(v) || v < 0) return;
        win.localStorage.setItem(k.best, String(v));
        s.restart = true;
        return;
      }
      if (id === "g2-score" && isFinite(v) && v >= 0) d.score = v;
      if (id === "g2-double") g2048Tiles(d, function (c) { if (c) c.value *= 2; return c; });
      if (id === "g2-clean") {
        var left = 0;
        g2048Tiles(d, function (c) { if (c && c.value > 4) left++; return c; });
        /* Keep at least one tile so the board is never empty. */
        if (left) g2048Tiles(d, function (c) { return c && c.value <= 4 ? null : c; });
      }
      if (id === "g2-2048") {
        var top = null;
        g2048Tiles(d, function (c) { if (c && (!top || c.value > top.value)) top = c; return c; });
        if (top && top.value < 2048) top.value = 2048;
      }
      d.over = false;
      d.won = false;
      d.keepPlaying = true;
      win.localStorage.setItem(k.state, JSON.stringify(d));
      s.restart = true;
    }
  };

  /* Flappy Bird (nebezb's clone): plain global variables and functions. */
  var flappy = {
    name: "Flappy Bird",
    detect: function (win) {
      return typeof win.playerDead === "function" && typeof win.playerJump === "function" &&
        typeof win.pipeheight === "number";
    },
    items: function (win, s) {
      if (s.flappyGap === undefined) s.flappyGap = win.pipeheight;
      return {
        items: [
          { id: "fb-god", label: "Can't die", type: "toggle", group: "Play", hint: "Pipes and the ground bounce you back up" },
          { id: "fb-wide", label: "Wide gaps", type: "toggle", group: "Play", hint: "New pipes have twice the room" },
          { id: "fb-floaty", label: "Floaty", type: "toggle", group: "Play", hint: "Half the gravity" },
          { id: "fb-score", label: "Score", type: "value", group: "Score", value: win.score, noLock: true },
          { id: "fb-high", label: "High score", type: "value", group: "Score", value: win.highscore, noLock: true }
        ]
      };
    },
    action: function (win, s, id, arg) {
      if (s.flappyGap === undefined) s.flappyGap = win.pipeheight;
      if (s.flappyGrav === undefined) s.flappyGrav = win.gravity;
      var v = Math.round(Number(arg && arg.value));
      if (id === "fb-god") {
        if (!win.__achFlappyDead) {
          var dead = win.__achFlappyDead = win.playerDead;
          win.playerDead = function () {
            if (win.__achCheats && win.__achCheats.on["fb-god"]) { win.velocity = win.jump; return; }
            return dead.apply(this, arguments);
          };
        }
      }
      if (id === "fb-wide") win.pipeheight = s.on["fb-wide"] ? s.flappyGap * 2 : s.flappyGap;
      if (id === "fb-floaty") win.gravity = s.on["fb-floaty"] ? s.flappyGrav / 2 : s.flappyGrav;
      if (id === "fb-score" && isFinite(v) && v >= 0) {
        win.score = v;
        try { win.setBigScore(); } catch (e) {}
      }
      if (id === "fb-high" && isFinite(v) && v >= 0) {
        win.highscore = v;
        try { win.setCookie("highscore", v, 999); } catch (e) {}
      }
    }
  };

  /* Temple Run 2 (web port): everything lives in one JSON save,
     TR2_GAME_STATE, read when the page loads. Abilities go to level 5. */
  var templeRun = {
    name: "Temple Run 2",
    detect: function (win) {
      try { return !!win.localStorage.getItem("TR2_GAME_STATE") && !!win.BABYLON; } catch (e) { return false; }
    },
    items: function (win) {
      var st = JSON.parse(win.localStorage.getItem("TR2_GAME_STATE"));
      var stats = st.statsData || {};
      return {
        note: "Best done from the main menu: changes restart the game so it loads them.",
        items: [
          { id: "tr-coins", label: "Coins", type: "value", group: "Money", value: stats.totalCoins || 0, noLock: true },
          { id: "tr-rich", label: "+100,000 coins", type: "button", group: "Money" },
          { id: "tr-abilities", label: "Max every ability", type: "button", group: "Upgrades",
            hint: "Shield, Coin Magnet and Boost to level 5" },
          { id: "tr-powerup", label: "Unlock the power meter", type: "button", group: "Upgrades" },
          { id: "tr-high", label: "High score", type: "value", group: "Stats", value: stats.highestScore || 0, noLock: true }
        ]
      };
    },
    action: function (win, s, id, arg) {
      var st = JSON.parse(win.localStorage.getItem("TR2_GAME_STATE"));
      st.statsData = st.statsData || {};
      var v = Math.round(Number(arg && arg.value));
      if (id === "tr-coins" && isFinite(v) && v >= 0) st.statsData.totalCoins = v;
      if (id === "tr-rich") st.statsData.totalCoins = (st.statsData.totalCoins || 0) + 100000;
      if (id === "tr-high" && isFinite(v) && v >= 0) st.statsData.highestScore = v;
      if (id === "tr-abilities") st.abilitiesData = { abilitiesLevels: [5, 5, 5] };
      if (id === "tr-powerup") { st.flagsData = st.flagsData || {}; st.flagsData.powerupUplocked = true; }
      win.localStorage.setItem("TR2_GAME_STATE", JSON.stringify(st));
      s.restart = true;
    }
  };

  /* Crossy Road (web port): coins and best score are plain numbers in
     localStorage, read at start. */
  var crossy = {
    name: "Crossy Road",
    detect: function (win) {
      try { return "doSpawnCoin" in win && win.localStorage.getItem("crossyScore") !== null; } catch (e) { return false; }
    },
    items: function (win) {
      var ls = win.localStorage;
      return {
        note: "Changes restart the game so it loads them.",
        items: [
          { id: "cr-coins", label: "Coins", type: "value", group: "Money", value: Number(ls.getItem("coins")) || 0, noLock: true },
          { id: "cr-rich", label: "+10,000 coins", type: "button", group: "Money", hint: "Enough for the prize machine many times over" },
          { id: "cr-top", label: "Top score", type: "value", group: "Score", value: Number(ls.getItem("crossyScore")) || 0, noLock: true }
        ]
      };
    },
    action: function (win, s, id, arg) {
      var ls = win.localStorage, v = Math.round(Number(arg && arg.value));
      if (id === "cr-rich") ls.setItem("coins", String((Number(ls.getItem("coins")) || 0) + 10000));
      else if (id === "cr-coins" && isFinite(v) && v >= 0) ls.setItem("coins", String(v));
      else if (id === "cr-top" && isFinite(v) && v >= 0) ls.setItem("crossyScore", String(v));
      else return;
      s.restart = true;
    }
  };

  /* ---------------------------------------- any game: its own variables */

  /* Plain JavaScript games keep their state in globals. Walk the ones the
     game made (not the browser's) and offer the money-like numbers. */
  /* Whole words only, so "String" isn't a ring and "pointerX" isn't points. */
  var WANTED_WORD = /^(coins?|money|gold|gems?|cash|diamonds?|points?|tokens?|credits?|stars?|rub(y|ies)|crystals?|energy|xp|exp|lives|life|health|hp|ammo|score|bucks|dollars?|currency|tickets?|orbs?|shards?|level|lvl|rings?)$/;
  var WANTED = { test: function (k) {
    return String(k).replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z]+/).some(function (w) {
      return WANTED_WORD.test(w.toLowerCase());
    });
  } };
  var NATIVE = /\[native code\]/;
  function scriptMade(win, v) {
    if (!v || typeof v !== "object") return false;
    if (v === win || v === win.document || (win.Node && v instanceof win.Node)) return false;
    var proto = Object.getPrototypeOf(v);
    if (proto === win.Object.prototype || proto === null) return true;
    var ctor = proto && proto.constructor;
    try { return typeof ctor === "function" && !NATIVE.test(win.Function.prototype.toString.call(ctor)); }
    catch (e) { return false; }
  }
  function genericFields(win) {
    var out = [];
    var seen = [];
    function walk(obj, path, depth) {
      if (out.length >= 60 || depth > 2 || seen.indexOf(obj) !== -1) return;
      seen.push(obj);
      var keys;
      try { keys = Object.keys(obj); } catch (e) { return; }
      for (var i = 0; i < keys.length && i < 400; i++) {
        var k = keys[i], v;
        try { v = obj[k]; } catch (e) { continue; }
        if (typeof v === "number" && isFinite(v) && WANTED.test(k) && depth > 0) {
          out.push({ path: path.concat(k), label: path.slice(-1).concat(k).join(".") });
        } else if (scriptMade(win, v) && !Array.isArray(v)) {
          walk(v, path.concat(k), depth + 1);
        }
      }
    }
    var roots = {};
    Object.keys(win).forEach(function (k) {
      if (/^(on|webkit|__ach)/.test(k) || k === "GameCheats") return;
      var v;
      try { v = win[k]; } catch (e) { return; }
      if (typeof v === "number" && WANTED.test(k)) roots[k] = true;
      else if (scriptMade(win, v)) roots[k] = v;
    });
    Object.keys(roots).forEach(function (k) {
      if (roots[k] === true) out.push({ path: [k], label: k });
      else walk(roots[k], [k], 1);
    });
    return out.slice(0, 60);
  }
  function pathGet(win, path) {
    var o = win;
    for (var i = 0; i < path.length; i++) { if (o == null) return undefined; o = o[path[i]]; }
    return o;
  }
  function pathSet(win, path, v) {
    var o = pathGet(win, path.slice(0, -1));
    if (o != null) o[path[path.length - 1]] = v;
  }

  var generic = {
    name: "Game values",
    detect: function (win) { return genericFields(win).length > 0; },
    items: function (win, s) {
      var fields = genericFields(win);
      s.fields = fields;
      var items = [{ id: "rich", label: "Max everything", type: "button", group: "Stuff",
        hint: "Coins, gems, score and the like to 999,999; lives to 99" }];
      fields.forEach(function (f, i) {
        items.push({ id: "p:" + f.path.join("\u0001"), label: f.label, type: "value", group: "Values",
          value: Math.round(pathGet(win, f.path) * 100) / 100,
          locked: s.locks[f.path.join("\u0001")] !== undefined });
      });
      return { items: items, note: "Found in the game's own variables. If a number snaps back, Lock it." };
    },
    action: function (win, s, id, arg) {
      if (id === "rich") {
        genericFields(win).forEach(function (f) {
          var k = f.path[f.path.length - 1];
          if (/level|health|\bhp\b|life$/i.test(k)) return;
          pathSet(win, f.path, /lives/i.test(k) ? 99 : 999999);
        });
      }
      if (id.indexOf("p:") === 0) {
        var key = id.slice(2);
        if (arg && arg.unlock) { delete s.locks[key]; return; }
        var v = Number(arg && arg.value);
        if (!isFinite(v)) return;
        pathSet(win, key.split("\u0001"), v);
        if (arg.lock) s.locks[key] = v;
      }
    },
    tick: function (win, s) {
      Object.keys(s.locks).forEach(function (key) { pathSet(win, key.split("\u0001"), s.locks[key]); });
    }
  };

  /* ------------------------------------------------ quick mods, any game */

  /* Each engine can offer a few "numbers" (name, get, set) and hooks for the
     general mods. Anything a game keeps as health or a timer can then be
     held in place, whatever engine it's on. */
  clickteam.numbers = function (win) {
    var app = ctApp(win);
    if (!app) return [];
    var c = ctCounters(app);
    return Object.keys(c).map(function (n) {
      return { name: n, get: function () { return c[n][0].rsValue; }, set: function (v) { ctSet(c[n], v); } };
    });
  };
  construct.numbers = function (win) {
    return (cVars(win) || []).filter(function (gv) { return typeof gv.get() === "number"; });
  };
  phaser.numbers = function (win) {
    var game = phGame(win), state = game && phState(game);
    var hero = phHero(state);
    var out = phNumbers(state).map(function (k) {
      return { name: k, get: function () { return state[k]; }, set: function (v) { state[k] = v; } };
    });
    ["health", "lives", "hp"].forEach(function (k) {
      if (hero && typeof hero[k] === "number") {
        out.push({ name: "hero." + k, get: function () { return hero[k]; }, set: function (v) { hero[k] = v; } });
      }
    });
    return out;
  };
  generic.numbers = function (win) {
    return genericFields(win).map(function (f) {
      return { name: f.label, get: function () { return pathGet(win, f.path); }, set: function (v) { pathSet(win, f.path, v); } };
    });
  };

  /* Mario: health and invulnerability, faster running, higher jumps,
     floatier falls. */
  var ACT_FLAG_MOVING = 0x04000000;
  sm64.quick = {
    god: function (win, s, dv, a) {
      dv.setInt16(a + 0xAE, 0x880, true);
      dv.setInt16(a + 0x26, 60, true);
    },
    speed: function (win, s, dv, a) {
      var action = dv.getUint32(a + 0x0C, true);
      var fv = dv.getFloat32(a + 0x54, true);
      if ((action & ACT_FLAG_MOVING) && fv > 8 && fv < 64) dv.setFloat32(a + 0x54, Math.min(64, fv * 1.08), true);
    },
    jump: function (win, s, dv, a) {
      var air = !!(dv.getUint32(a + 0x0C, true) & ACT_FLAG_AIR);
      var vy = dv.getFloat32(a + 0x4C, true);
      if (air && !s.wasAir && vy > 20) dv.setFloat32(a + 0x4C, vy * 1.7, true);
      s.wasAir = air;
    },
    grav: function (win, s, dv, a) {
      var air = !!(dv.getUint32(a + 0x0C, true) & ACT_FLAG_AIR);
      if (air) dv.setFloat32(a + 0x4C, dv.getFloat32(a + 0x4C, true) + 2.4, true);
    },
    fly: true
  };

  /* Phaser: the hero's physics body. */
  phaser.quick = {
    god: function (win, s, hero) { if ("invincible" in hero) hero.invincible = true; },
    speed: true,
    fly: true,
    grav: function (win, s, hero, game) {
      var arcade = game.physics && game.physics.arcade;
      if (arcade && arcade.gravity && s.grav0 === undefined) { s.grav0 = arcade.gravity.y; arcade.gravity.y *= 0.4; }
      if (hero.body && hero.body.gravity && s.bodyGrav0 === undefined) { s.bodyGrav0 = hero.body.gravity.y; hero.body.gravity.y *= 0.4; }
    },
    noclip: function (win, s, hero, game) {
      var body = hero.body;
      if (!body) return;
      body.checkCollision.none = true;
      body.checkCollision.up = body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
      body.allowGravity = false;
      var kb = game.input.keyboard;
      var down = function (c) { try { return kb.isDown(c); } catch (e) { return false; } };
      var x = (down(39) || down(68) ? 1 : 0) - (down(37) || down(65) ? 1 : 0);
      var y = (down(40) || down(83) ? 1 : 0) - (down(38) || down(87) || down(32) ? 1 : 0);
      body.velocity.x = x * 320;
      body.velocity.y = y * 320;
    },
    off: function (win, s, hero, game, id) {
      if (id === "grav") {
        var arcade = game.physics && game.physics.arcade;
        if (arcade && s.grav0 !== undefined) arcade.gravity.y = s.grav0;
        if (hero && hero.body && s.bodyGrav0 !== undefined) hero.body.gravity.y = s.bodyGrav0;
        s.grav0 = s.bodyGrav0 = undefined;
      }
      if (id === "noclip" && hero && hero.body) {
        var c = hero.body.checkCollision;
        c.none = false; c.up = c.down = c.left = c.right = true;
        hero.body.allowGravity = true;
      }
      if (id === "god" && hero && "invincible" in hero) hero.invincible = false;
    }
  };

  /* Construct: the Platform / 8-direction movement on every instance. */
  function cMovers(win) {
    var out = [];
    try {
      var rt = win.cr_getC2Runtime && win.cr_getC2Runtime();
      if (rt && rt.types_by_index) {
        rt.types_by_index.forEach(function (t) {
          (t.instances || []).forEach(function (inst) {
            (inst.behavior_insts || []).forEach(function (b) {
              if (typeof b.maxspeed === "number") {
                out.push({ b: b, speed: "maxspeed", jump: "jumpStrength", grav: "g", acc: "acc" });
              }
            });
          });
        });
        return out;
      }
    } catch (e) {}
    try {
      var ri = win.c3_runtimeInterface;
      var local = ri && (ri._localRuntime || (ri._GetLocalRuntime && ri._GetLocalRuntime()));
      var objs = local && local.GetIRuntime().objects;
      Object.keys(objs || {}).forEach(function (name) {
        objs[name].getAllInstances().forEach(function (inst) {
          var bs = inst.behaviors || {};
          Object.keys(bs).forEach(function (k) {
            var b = bs[k];
            if (b && typeof b.maxSpeed === "number") {
              out.push({ b: b, speed: "maxSpeed", jump: "jumpStrength", grav: "gravity", acc: "acceleration" });
            }
          });
        });
      });
    } catch (e) {}
    return out;
  }
  var C_SCALE = { speed: ["speed", 2], jump: ["jump", 1.6], grav: ["grav", 0.4] };
  function cScale(win, s) {
    cMovers(win).forEach(function (m) {
      var b = m.b;
      if (!b.__ach) b.__ach = {};
      Object.keys(C_SCALE).forEach(function (id) {
        var field = m[C_SCALE[id][0]];
        if (typeof b[field] !== "number") return;
        if (b.__ach[field] === undefined) b.__ach[field] = b[field];
        var want = s.on["q:" + id] ? b.__ach[field] * C_SCALE[id][1] : b.__ach[field];
        if (b[field] !== want) b[field] = want;
        if (id === "speed" && typeof b[m.acc] === "number") {
          if (b.__ach[m.acc] === undefined) b.__ach[m.acc] = b[m.acc];
          b[m.acc] = s.on["q:speed"] ? b.__ach[m.acc] * 2 : b.__ach[m.acc];
        }
      });
    });
  }
  construct.quick = {
    speed: function (win, s) { cScale(win, s); },
    jump: function (win, s) { cScale(win, s); },
    grav: function (win, s) { cScale(win, s); },
    off: function (win, s) { cScale(win, s); }
  };

  var HEALTH = /health|\bhp$|^hp|lives?$|^life|shield|armou?r/i;
  var TIMER = /^(time|timer|timecount|timeleft|time_left|timeremaining|countdown|clock|gametime|leveltime)$|time of day|timer$|countdown/i;
  var QUICK = [
    ["fast", "Fast-forward 2×", "Runs the whole game twice as fast"],
    ["slow", "Slow motion ½×", "Runs the whole game at half speed"],
    ["god", "God mode", "Health and lives stay full"],
    ["speed", "Super speed", "Your character moves faster"],
    ["jump", "Super jump", "Jumps go higher"],
    ["grav", "Low gravity", "Floatier jumps and falls"],
    ["noclip", "No clip", "Move through walls with the arrow keys or WASD"],
    ["fly", "Fly", "Hold jump to rise (X in Mario, up or space elsewhere)"],
    ["timer", "Freeze timer", "Timers and clocks stop counting"]
  ];

  function quickItems(win, s, eng) {
    var q = (eng && eng.quick) || {};
    var nums = eng && eng.numbers ? safe(function () { return eng.numbers(win); }, []) : [];
    var has = {
      fast: true, slow: true,
      god: (eng === sm64) || nums.some(function (n) { return HEALTH.test(n.name); }) ||
        (eng === phaser && !!safe(function () { var h = phHero(phState(phGame(win))); return h && "invincible" in h; }, false)),
      speed: !!q.speed && (eng !== construct || cMovers(win).length > 0),
      jump: !!q.jump && (eng !== construct || cMovers(win).some(function (m) { return typeof m.b[m.jump] === "number"; })),
      grav: !!q.grav && (eng !== construct || cMovers(win).some(function (m) { return typeof m.b[m.grav] === "number"; })),
      noclip: !!q.noclip,
      fly: !!q.fly,
      timer: nums.some(function (n) { return TIMER.test(n.name) && !/\bad|^ad|last|delay/i.test(n.name); })
    };
    if (eng === phaser && !phArcade(phHero(phState(phGame(win))))) has.speed = has.fly = has.noclip = has.grav = false;
    return QUICK.filter(function (m) { return has[m[0]]; }).map(function (m) {
      return { id: "q:" + m[0], label: m[1], hint: m[2], type: "toggle", group: "Quick mods", on: !!s.on["q:" + m[0]] };
    });
  }
  function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

  function quickRun(win, s, eng, id, on) {
    var k = id.slice(2);
    if (on) s.on[id] = true; else delete s.on[id];
    if (k === "fast" || k === "slow") {
      if (on) delete s.on[k === "fast" ? "q:slow" : "q:fast"];
      timeControl(win).speed = s.on["q:fast"] ? 2 : s.on["q:slow"] ? 0.5 : 1;
      return;
    }
    if (k === "god" || k === "timer") {
      s.held = s.held || {};
      if (!on) Object.keys(s.held).forEach(function (n) { if (s.held[n].why === k) delete s.held[n]; });
      else {
        var re = k === "god" ? HEALTH : TIMER;
        (eng && eng.numbers ? safe(function () { return eng.numbers(win); }, []) : []).forEach(function (n) {
          if (re.test(n.name) && !(k === "timer" && /\bad|^ad|last|delay/i.test(n.name))) s.held[n.name] = { why: k, value: n.get() };
        });
      }
    }
    var q = eng && eng.quick;
    if (!on && q && q.off) {
      var game = eng === phaser ? phGame(win) : null;
      q.off(win, s, game ? phHero(phState(game)) : null, game, k);
    }
  }

  function quickTick(win, s, eng) {
    var q = eng && eng.quick;
    if (s.held && eng && eng.numbers) {
      var nums = safe(function () { return eng.numbers(win); }, []);
      nums.forEach(function (n) {
        var h = s.held[n.name];
        if (!h) return;
        var v = n.get();
        /* God mode keeps the best value seen; a frozen timer keeps its value. */
        if (h.why === "god" && v > h.value) h.value = v;
        if (v !== h.value) n.set(h.value);
      });
    }
    if (!q) return;
    var on = function (k) { return !!s.on["q:" + k]; };
    if (eng === sm64) {
      var a = findMario(win, s), dv = sm64View(win);
      if (!a || !dv) return;
      ["god", "speed", "jump", "grav"].forEach(function (k) { if (on(k)) q[k](win, s, dv, a); });
    } else if (eng === phaser) {
      var game = phGame(win), hero = phHero(phState(game));
      if (!hero) return;
      ["god", "grav", "noclip"].forEach(function (k) { if (on(k)) q[k](win, s, hero, game); });
    } else if (eng === construct && (on("speed") || on("jump") || on("grav"))) {
      cScale(win, s);
    }
  }

  /* ------------------------------------------------------------- public */

  var ENGINES = [sm64, clickteam, construct, moto, phaser, eagler, unity, dino, cookie, retroBowl,
    g2048, flappy, templeRun, crossy, generic];

  function engineFor(win) {
    var s = state(win);
    if (s.engine && s.engine.detect(win)) return s.engine;
    s.engine = null;
    for (var i = 0; i < ENGINES.length; i++) {
      try { if (ENGINES[i].detect(win)) { s.engine = ENGINES[i]; break; } } catch (e) {}
    }
    return s.engine;
  }

  /* Some game pages wrap the real game in a frame of their own. */
  function target(win, depth) {
    depth = depth || 0;
    for (var i = 0; i < ENGINES.length; i++) {
      try { if (ENGINES[i].detect(win)) return win; } catch (e) {}
    }
    if (depth < 2) {
      for (var j = 0; j < win.frames.length; j++) {
        try {
          var inner = win.frames[j];
          if (inner.document) {
            var hit = target(inner, depth + 1);
            if (hit !== inner || engineHere(inner)) return hit;
          }
        } catch (e) { /* another origin */ }
      }
    }
    return win;
  }
  function engineHere(win) {
    return ENGINES.some(function (e) { try { return e.detect(win); } catch (x) { return false; } });
  }

  function inspect(win, fresh) {
    win = target(win);
    var s = state(win);
    var eng = engineFor(win);
    /* Engines whose state lives in storage read it first (once, or again on
       Refresh), so the answer can be a promise. */
    if (eng && eng.load && (fresh || !s.loaded)) {
      s.loaded = true;
      return eng.load(win, s).then(function () { return inspect(win); });
    }
    var clock = win.__achClock;
    var base = { engine: eng ? eng.name : "Any game", note: "", items: [],
      speed: clock ? clock.speed : 1, paused: clock ? clock.paused : false };
    if (s.restart) { base.restart = true; s.restart = false; }
    ensureLoop(win);
    var quick = quickItems(win, s, eng);
    if (!eng) {
      base.items = quick;
      base.note = "This game's insides aren't readable, so only the speed mods apply.";
      return base;
    }
    var got = eng.items(win, s);
    base.note = got.note || "";
    base.items = quick.concat(got.items.map(function (it) {
      if (it.type === "toggle") it.on = !!s.on[it.id];
      return it;
    }));
    return base;
  }

  /* Some engines (Emscripten, e.g. Mario 64) cancel mouse-down on their
     canvas, so clicking back into the game after clicking away never gives
     it the keyboard again. Take focus back on any press inside it. */
  function keepFocus(win, depth) {
    depth = depth || 0;
    try {
      if (!win.__achFocus) {
        win.__achFocus = true;
        var grab = function () {
          try { if (win.document.hasFocus && !win.document.hasFocus()) win.focus(); } catch (e) {}
        };
        ["pointerdown", "mousedown", "touchstart"].forEach(function (type) {
          win.addEventListener(type, grab, true);
        });
      }
      if (depth < 2) {
        for (var i = 0; i < win.frames.length; i++) {
          try { if (win.frames[i].document) keepFocus(win.frames[i], depth + 1); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function run(win, id, arg) {
    if (id === "focus") { keepFocus(win); return { engine: "", items: [] }; }
    if (id === "refresh") return refresh(win);
    win = target(win);
    var s = state(win);
    if (id === "clock") {
      var c = timeControl(win);
      if (arg && typeof arg.speed === "number") c.speed = Math.max(0.1, Math.min(4, arg.speed));
      if (arg && typeof arg.paused === "boolean") c.paused = arg.paused;
      return inspect(win);
    }
    var eng = engineFor(win);
    if (id.indexOf("q:") === 0) {
      quickRun(win, s, eng, id, !!(arg && arg.on));
      return inspect(win);
    }
    if (!eng) return inspect(win);
    if (eng.load && !s.loaded) {
      s.loaded = true;
      return eng.load(win, s).then(function () { return run(win, id, arg); });
    }
    var all = eng.items(win, s).items;
    var item = all.filter(function (i) { return i.id === id; })[0];
    if (!item) return inspect(win);
    if (item.type === "toggle") {
      s.on[id] = !!(arg && arg.on);
      if (!s.on[id]) delete s.on[id];
    }
    var done = eng.action && eng.action(win, s, id, arg);
    if (done && typeof done.then === "function") {
      return done.then(function () { return inspect(win, true); });
    }
    return inspect(win);
  }

  function refresh(win) { return inspect(win, true); }

  window.GameCheats = { inspect: inspect, run: run, refresh: refresh, timeControl: timeControl, keepFocus: keepFocus };
})();
