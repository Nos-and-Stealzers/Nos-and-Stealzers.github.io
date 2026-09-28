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
    detect: function (win) { return !!(win.HEAPU8 && win._main && win.document.getElementById("canvas")); },
    items: function (win, s) {
      var a = findMario(win, s);
      var dv = sm64View(win);
      var items = [
        { id: "health", label: "Infinite health", type: "toggle", group: "Mario" },
        { id: "invincible", label: "Can't be hurt", type: "toggle", group: "Mario" },
        { id: "fly", label: "Fly (hold jump)", type: "toggle", group: "Mario", hint: "Hold the jump button (X on a keyboard) to rise" },
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
      if (s.on.health) dv.setInt16(a + 0xAE, 0x880, true);
      if (s.on.invincible) dv.setInt16(a + 0x26, 60, true);
      if (s.on.fly) {
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
  function phHero(state) {
    return state && (state.hero || state.player || state.sonic || state.mario || state.character) || null;
  }
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
      if (hero && "invincible" in hero) items.push({ id: "god", label: "Can't be hurt", type: "toggle", group: "Player" });
      if (hero && hero.body) {
        items.push({ id: "fly", label: "Fly (hold up / space)", type: "toggle", group: "Player" });
        items.push({ id: "fast", label: "Super speed", type: "toggle", group: "Player" });
      }
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
      var hero = phHero(state);
      if (id === "god" && hero && !s.on.god) hero.invincible = false;
    },
    tick: function (win, s) {
      var game = phGame(win);
      var state = game && phState(game);
      if (!state) return;
      Object.keys(s.locks).forEach(function (k) { if (typeof state[k] === "number") state[k] = s.locks[k]; });
      var hero = phHero(state);
      if (!hero) return;
      if (s.on.god) hero.invincible = true;
      var body = hero.body;
      if (!body) return;
      var kb = game.input && game.input.keyboard;
      var down = function (code) { try { return kb.isDown(code); } catch (e) { return false; } };
      if (s.on.fly && (down(38) || down(32) || down(87))) {
        body.velocity.y = -Math.max(250, Math.abs(body.maxVelocity ? body.maxVelocity.y : 0) * 0.4);
      }
      if (s.on.fast && body.velocity.x) {
        var cap = body.maxVelocity && body.maxVelocity.x ? body.maxVelocity.x : 0;
        if (!s.fastCap && cap) { s.fastCap = cap; body.maxVelocity.x = cap * 2; }
        body.velocity.x = body.velocity.x > 0 ? Math.max(body.velocity.x, 400) : Math.min(body.velocity.x, -400);
      } else if (!s.on.fast && s.fastCap) {
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

  /* ---------------------------------------- any game: its own variables */

  /* Plain JavaScript games keep their state in globals. Walk the ones the
     game made (not the browser's) and offer the money-like numbers. */
  var WANTED = /coins?$|money|gold$|gems?$|cash|diamonds?$|points?$|tokens?$|credits?$|stars?$|rub(y|ies)$|crystals?$|energy$|^xp$|exp$|lives$|^life$|health$|^hp$|ammo|score$|bucks$|dollars?$|currency|tickets?$|orbs?$|shards?$|^level$|rings?$/i;
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

  /* ------------------------------------------------------------- public */

  var ENGINES = [sm64, clickteam, construct, phaser, eagler, generic];

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

  function inspect(win) {
    win = target(win);
    var s = state(win);
    var eng = engineFor(win);
    var clock = win.__achClock;
    var base = { engine: eng ? eng.name : "", note: "", items: [],
      speed: clock ? clock.speed : 1, paused: clock ? clock.paused : false };
    if (!eng) return base;
    ensureLoop(win);
    var got = eng.items(win, s);
    base.note = got.note || "";
    base.items = got.items.map(function (it) {
      if (it.type === "toggle") it.on = !!s.on[it.id];
      return it;
    });
    return base;
  }

  function run(win, id, arg) {
    win = target(win);
    var s = state(win);
    if (id === "clock") {
      var c = timeControl(win);
      if (arg && typeof arg.speed === "number") c.speed = Math.max(0.1, Math.min(4, arg.speed));
      if (arg && typeof arg.paused === "boolean") c.paused = arg.paused;
      return inspect(win);
    }
    var eng = engineFor(win);
    if (!eng) return inspect(win);
    var all = eng.items(win, s).items;
    var item = all.filter(function (i) { return i.id === id; })[0];
    if (!item) return inspect(win);
    if (item.type === "toggle") {
      s.on[id] = !!(arg && arg.on);
      if (!s.on[id]) delete s.on[id];
    }
    eng.action && eng.action(win, s, id, arg);
    return inspect(win);
  }

  window.GameCheats = { inspect: inspect, run: run, timeControl: timeControl };
})();
