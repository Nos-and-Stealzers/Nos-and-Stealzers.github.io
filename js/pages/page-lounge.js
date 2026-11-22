/* Arcade Lounge: game of the day, a daily spin with stickers, a game roulette,
   achievements worked out from your own play, and a small soundboard.
   All of it runs on this device. */
(function () {
  "use strict";

  var LOUNGE_KEY = "ach:lounge";        // counters + unlocked achievements
  var STICKERS_KEY = "ach:stickers";    // { id: { at, n } }
  var SPIN_KEY = "ach:spin";            // { day }
  var BEAT_KEY = "ach:lounge-beat";

  function readJSON(key, fallback) {
    try { var v = JSON.parse(window.localStorage.getItem(key) || "null"); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  var STICKERS = [
    { id: "star",   name: "Gold star",   icon: "star",     color: "#f5b82e" },
    { id: "pad",    name: "Controller",  icon: "gamepad",  color: "#4f8cff" },
    { id: "flag",   name: "Finish line", icon: "flag",     color: "#f0504d" },
    { id: "shield", name: "Shield",      icon: "shield",   color: "#1fbf9b" },
    { id: "crown",  name: "Crown",       icon: "crown",    color: "#e8a317" },
    { id: "pulse",  name: "Heartbeat",   icon: "pulse",    color: "#ee5fa7" },
    { id: "key",    name: "Secret key",  icon: "key",      color: "#9b6bff" },
    { id: "film",   name: "Replay",      icon: "video",    color: "#22c3e6" },
    { id: "chat",   name: "Chatterbox",  icon: "chat",     color: "#3fcf6b" },
    { id: "code",   name: "Hacker",      icon: "code",     color: "#ff7a3d" },
    { id: "disk",   name: "Save point",  icon: "database", color: "#8aa0b8" },
    { id: "cloud",  name: "Cloud save",  icon: "save",     color: "#6fb1ff" }
  ];

  function init() {
    var UI = window.UI, Catalog = window.Catalog, Store = window.Store, Perks = window.Perks;
    var el = UI.el;
    var reduce = document.documentElement.getAttribute("data-motion") === "off";

    var lounge = readJSON(LOUNGE_KEY, {});
    if (!lounge.unlocked) lounge.unlocked = {};
    function saveLounge() { writeJSON(LOUNGE_KEY, lounge); }
    function bump(name) { lounge[name] = (lounge[name] || 0) + 1; saveLounge(); }

    function button(label, iconName, onClick, cls) {
      var b = el("button", "btn" + (cls ? " " + cls : ""));
      b.type = "button";
      if (iconName) b.appendChild(UI.icon(iconName));
      b.appendChild(el("span", null, label));
      if (onClick) b.addEventListener("click", onClick);
      return b;
    }

    function stickers() { return readJSON(STICKERS_KEY, {}); }

    /* ---------------------------------------------------- game of the day */

    function drawToday() {
      var host = document.getElementById("lg-today");
      host.innerHTML = "";
      var picks = Catalog.daily(3).filter(function (g) { return g && !g.unavailable; });
      if (!picks.length) { host.appendChild(el("p", "dim", "No games to pick from right now.")); return; }
      var g = picks[0];
      var card = el("div", "lg-gotd");
      var art = el("div", "lg-gotd-art");
      UI.coverInto(art, g);
      card.appendChild(art);
      var body = el("div", "lg-gotd-body");
      body.appendChild(el("span", "label", "Game of the day"));
      body.appendChild(el("h3", null, g.title));
      body.appendChild(el("p", "dim", g.description || g.categoryLabel));
      var acts = el("div", "btn-row");
      var play = el("a", "btn btn-cta");
      play.href = UI.playHref(g);
      play.appendChild(UI.icon("gamepad"));
      play.appendChild(el("span", null, "Play it"));
      acts.appendChild(play);
      body.appendChild(acts);
      if (picks.length > 1) {
        var more = el("p", "lg-also");
        more.appendChild(document.createTextNode("Also good today: "));
        picks.slice(1).forEach(function (o, i) {
          if (i) more.appendChild(document.createTextNode(", "));
          var a = el("a", null, o.title);
          a.href = UI.playHref(o);
          more.appendChild(a);
        });
        body.appendChild(more);
      }
      card.appendChild(body);
      host.appendChild(card);
    }

    /* ------------------------------------------------- streak + daily spin */

    var wheel = document.getElementById("lg-wheel");
    var spinBtn = document.getElementById("lg-spin");
    var spinNote = document.getElementById("lg-spin-note");
    var wheelAngle = 0;

    function svgNode(name, attrs) {
      var n = document.createElementNS("http://www.w3.org/2000/svg", name);
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      return n;
    }

    /* A slice per sticker, in the sticker's colour. */
    function buildWheel() {
      wheel.innerHTML = "";
      var svg = svgNode("svg", { viewBox: "-100 -100 200 200", "aria-hidden": "true" });
      var g = svgNode("g", { id: "lg-wheel-rot" });
      var n = STICKERS.length, step = 360 / n;
      STICKERS.forEach(function (s, i) {
        var a0 = (i * step - 90 - step / 2) * Math.PI / 180;
        var a1 = (i * step - 90 + step / 2) * Math.PI / 180;
        g.appendChild(svgNode("path", {
          d: "M0 0 L" + (96 * Math.cos(a0)).toFixed(2) + " " + (96 * Math.sin(a0)).toFixed(2) +
             " A96 96 0 0 1 " + (96 * Math.cos(a1)).toFixed(2) + " " + (96 * Math.sin(a1)).toFixed(2) + " Z",
          fill: s.color, "fill-opacity": i % 2 ? "0.9" : "0.7", stroke: "rgba(0,0,0,.25)", "stroke-width": "0.6"
        }));
        var mid = (i * step - 90) * Math.PI / 180;
        g.appendChild(svgNode("circle", { cx: (68 * Math.cos(mid)).toFixed(2), cy: (68 * Math.sin(mid)).toFixed(2), r: "7", fill: "rgba(255,255,255,.9)" }));
      });
      g.appendChild(svgNode("circle", { r: "14", fill: "var(--surface)", stroke: "var(--line)", "stroke-width": "1.2" }));
      svg.appendChild(g);
      wheel.appendChild(svg);
    }

    function drawStreak() {
      var s = Perks.streak();
      document.getElementById("lg-streak").textContent = String(s.count);
      document.getElementById("lg-streak-best").textContent = "Best: " + s.best + (s.best === 1 ? " day" : " days");
      var dots = document.getElementById("lg-days");
      dots.innerHTML = "";
      var have = new Set(s.days);
      for (var i = 6; i >= 0; i--) {
        var d = el("span", "lg-day" + (have.has(Perks.dayKey(-i)) ? " is-on" : "") + (i === 0 ? " is-today" : ""));
        var date = new Date();
        date.setDate(date.getDate() - i);
        d.title = date.toLocaleDateString(undefined, { weekday: "long" });
        d.appendChild(el("span", null, date.toLocaleDateString(undefined, { weekday: "narrow" })));
        dots.appendChild(d);
      }
    }

    function spunToday() { return (readJSON(SPIN_KEY, {}).day || "") === Perks.dayKey(0); }

    function drawStickers() {
      var host = document.getElementById("lg-stickers");
      var have = stickers();
      host.innerHTML = "";
      var count = 0;
      STICKERS.forEach(function (s) {
        var got = have[s.id];
        if (got) count++;
        var c = el("div", "lg-sticker" + (got ? " is-got" : ""));
        c.title = got ? s.name + (got.n > 1 ? " ×" + got.n : "") : "Not found yet";
        var badge = el("span", "lg-sticker-badge");
        badge.style.setProperty("--sc", s.color);
        badge.appendChild(UI.icon(s.icon));
        c.appendChild(badge);
        c.appendChild(el("span", "lg-sticker-name", got ? s.name : "???"));
        if (got && got.n > 1) c.appendChild(el("span", "lg-sticker-n", "×" + got.n));
        host.appendChild(c);
      });
      document.getElementById("lg-sticker-count").textContent = count + " of " + STICKERS.length + " found";
    }

    var spinning = false;
    function paintSpin(message) {
      spinBtn.disabled = spinning || spunToday();
      spinNote.textContent = message || (spunToday()
        ? "You've spun today. Come back tomorrow for another sticker."
        : "One free spin a day. Every spin adds a sticker to your collection.");
    }

    spinBtn.addEventListener("click", function () {
      if (spinning || spunToday()) return;
      spinning = true;
      paintSpin("Spinning…");
      var idx = Math.floor(Math.random() * STICKERS.length);
      var step = 360 / STICKERS.length;
      /* The pointer sits at the top and slice i is drawn at i*step, so turn by whole laps minus i*step. */
      var target = Math.ceil(wheelAngle / 360) * 360 + 360 * 4 - idx * step;
      var rot = document.getElementById("lg-wheel-rot");
      rot.style.transition = reduce ? "none" : "transform 3.6s cubic-bezier(.12,.7,.12,1)";
      rot.style.transform = "rotate(" + target + "deg)";
      wheelAngle = target;
      /* Counted as spun right away, so closing the tab mid-spin isn't a free retry. */
      writeJSON(SPIN_KEY, { day: Perks.dayKey(0) });
      var have = stickers();
      var s = STICKERS[idx];
      have[s.id] = { at: Date.now(), n: ((have[s.id] && have[s.id].n) || 0) + 1 };
      writeJSON(STICKERS_KEY, have);
      bump("spins");
      window.setTimeout(function () {
        spinning = false;
        var fresh = have[s.id].n === 1;
        UI.toast(fresh ? "New sticker: " + s.name : s.name + " again");
        drawStickers();
        paintSpin(fresh ? "New sticker: " + s.name + ". Come back tomorrow." : "You got " + s.name + " again. Come back tomorrow.");
        drawAchievements();
      }, reduce ? 50 : 3700);
    });

    /* ------------------------------------------------------------ roulette */

    var rouletteCat = document.getElementById("lg-cat");
    var reel = document.getElementById("lg-reel");
    var reelActs = document.getElementById("lg-reel-acts");
    var rolling = false;

    function fillCategories() {
      rouletteCat.innerHTML = "";
      var any = el("option", null, "Any category");
      any.value = "";
      rouletteCat.appendChild(any);
      Catalog.categories.forEach(function (c) {
        var o = el("option", null, c.label + " (" + c.count + ")");
        o.value = c.id;
        rouletteCat.appendChild(o);
      });
    }

    function showReel(g, settled) {
      reel.innerHTML = "";
      reel.classList.toggle("is-settled", !!settled);
      if (!g) { reel.appendChild(el("p", "dim", "Spin to get a random game.")); return; }
      var art = el("div", "lg-reel-art");
      UI.coverInto(art, g);
      reel.appendChild(art);
      var t = el("div", "lg-reel-text");
      t.appendChild(el("strong", null, g.title));
      t.appendChild(el("span", "dim", g.categoryLabel));
      reel.appendChild(t);
    }

    function roll() {
      if (rolling) return;
      var cat = rouletteCat.value;
      var list = Catalog.playable.filter(function (g) { return !cat || g.category === cat; });
      if (!list.length) { UI.toast("No games in that category"); return; }
      rolling = true;
      reelActs.innerHTML = "";
      var pick = list[Math.floor(Math.random() * list.length)];
      var steps = reduce ? 1 : 22, i = 0;
      (function tick() {
        i++;
        var last = i >= steps;
        showReel(last ? pick : list[Math.floor(Math.random() * list.length)], last);
        if (!last) { window.setTimeout(tick, 45 + i * i * 0.9); return; }
        rolling = false;
        bump("roulette");
        var go = el("a", "btn btn-cta");
        go.href = UI.playHref(pick);
        go.appendChild(UI.icon("gamepad"));
        go.appendChild(el("span", null, "Play " + pick.title));
        reelActs.appendChild(go);
        var pinned = Store.isFavorite(pick.id);
        var pin = button(pinned ? "Pinned" : "Pin it", "star", function () {
          if (!Store.isFavorite(pick.id)) Store.toggleFavorite(pick.id);
          pin.disabled = true;
          UI.toast("Pinned " + pick.title);
          drawAchievements();
        }, "btn-flat");
        pin.disabled = pinned;
        reelActs.appendChild(pin);
        drawAchievements();
      })();
    }
    document.getElementById("lg-roll").addEventListener("click", roll);

    /* -------------------------------------------------------- achievements */

    function played() {
      var s = Store.stats();
      return Object.keys(s).filter(function (id) { return s[id].plays > 0 || s[id].seconds > 0; });
    }
    function stickerCount() { return Object.keys(stickers()).length; }
    function hourSeen(from, to) {
      var s = Store.stats();
      return Object.keys(s).some(function (id) {
        if (!s[id].last) return false;
        var h = new Date(s[id].last).getHours();
        return h >= from && h < to;
      });
    }

    /* Progress is real: it's read from this device's own play stats. */
    var ACHIEVEMENTS = [
      { id: "first",     name: "First launch",  desc: "Start a game.",                          icon: "gamepad",     get: function () { return Store.totalPlays(); }, goal: 1 },
      { id: "ten",       name: "Sampler",       desc: "Play 10 different games.",               icon: "grid",        get: function () { return played().length; }, goal: 10 },
      { id: "fifty",     name: "Explorer",      desc: "Play 50 different games.",               icon: "search",      get: function () { return played().length; }, goal: 50 },
      { id: "hour",      name: "Settling in",   desc: "Play for one hour in total.",            icon: "pulse",       get: function () { return Math.floor(Store.totalSeconds() / 60); }, goal: 60, unit: "min" },
      { id: "ten-hours", name: "Marathon",      desc: "Play for ten hours in total.",           icon: "crown",       get: function () { return Math.floor(Store.totalSeconds() / 3600); }, goal: 10, unit: "h" },
      { id: "streak3",   name: "On a roll",     desc: "Visit three days in a row.",             icon: "retry",       get: function () { return Perks.streak().best; }, goal: 3, unit: "days" },
      { id: "streak7",   name: "Regular",       desc: "Visit seven days in a row.",             icon: "shieldCheck", get: function () { return Perks.streak().best; }, goal: 7, unit: "days" },
      { id: "streak14",  name: "Dedicated",     desc: "Visit fourteen days in a row.",          icon: "shield",      get: function () { return Perks.streak().best; }, goal: 14, unit: "days" },
      { id: "pins",      name: "Curator",       desc: "Pin five games.",                        icon: "star",        get: function () { return Store.favorites().length; }, goal: 5 },
      { id: "critic",    name: "Critic",        desc: "Rate five games.",                       icon: "edit",        get: function () { return Object.keys(Store.ratings()).length; }, goal: 5 },
      { id: "sticker6",  name: "Sticker book",  desc: "Collect six stickers.",                  icon: "plus",        get: stickerCount, goal: 6 },
      { id: "sticker12", name: "Full sheet",    desc: "Collect all twelve stickers.",           icon: "check",       get: stickerCount, goal: 12 },
      { id: "roulette",  name: "Feeling lucky", desc: "Spin the game roulette ten times.",      icon: "retry",       get: function () { return lounge.roulette || 0; }, goal: 10 },
      { id: "dj",        name: "On the decks",  desc: "Hit 50 soundboard pads.",                icon: "mic",         get: function () { return lounge.pads || 0; }, goal: 50 },
      { id: "owl",       name: "Night owl",     desc: "Play a game between midnight and 5 AM.", icon: "pulse",       get: function () { return hourSeen(0, 5) ? 1 : 0; }, goal: 1 },
      { id: "early",     name: "Early bird",    desc: "Play a game between 5 and 7 AM.",        icon: "star",        get: function () { return hourSeen(5, 7) ? 1 : 0; }, goal: 1 }
    ];

    function drawAchievements() {
      var host = document.getElementById("lg-ach");
      host.innerHTML = "";
      var got = 0, fresh = [];
      ACHIEVEMENTS.forEach(function (a) {
        var v = Math.min(a.get(), a.goal);
        var done = v >= a.goal;
        if (done) {
          got++;
          if (!lounge.unlocked[a.id]) { lounge.unlocked[a.id] = Date.now(); fresh.push(a); }
        }
        var c = el("div", "lg-ach" + (done ? " is-done" : ""));
        var ico = el("span", "lg-ach-ico");
        ico.appendChild(UI.icon(a.icon));
        c.appendChild(ico);
        var t = el("div", "lg-ach-text");
        t.appendChild(el("strong", null, a.name));
        t.appendChild(el("span", null, a.desc));
        var bar = el("span", "lg-ach-bar");
        var fill = el("span", "lg-ach-fill");
        fill.style.width = Math.round(v / a.goal * 100) + "%";
        bar.appendChild(fill);
        t.appendChild(bar);
        t.appendChild(el("span", "lg-ach-n", done ? "Unlocked" : v + " / " + a.goal + (a.unit ? " " + a.unit : "")));
        c.appendChild(t);
        host.appendChild(c);
      });
      document.getElementById("lg-ach-count").textContent = got + " of " + ACHIEVEMENTS.length + " unlocked";
      if (fresh.length) {
        saveLounge();
        fresh.forEach(function (a, i) { window.setTimeout(function () { UI.toast("Achievement unlocked: " + a.name); }, i * 900); });
      }
    }

    /* ---------------------------------------------------------- soundboard */

    var ctx = null, master = null, noiseBuf = null;
    function audio() {
      if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = Number(document.getElementById("lg-vol").value) / 100;
      master.connect(ctx.destination);
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return ctx;
    }

    function env(g, t, peak, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    function tone(type, f0, f1, dur, peak, t, cutoff) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, t, peak, dur);
      var tail = o;
      if (cutoff) {
        var f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = cutoff;
        o.connect(f);
        tail = f;
      }
      tail.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    function noise(filterType, freq, dur, peak, t) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf;
      f.type = filterType;
      f.frequency.value = freq;
      env(g, t, peak, dur);
      s.connect(f);
      f.connect(g);
      g.connect(master);
      s.start(t);
      s.stop(t + dur + 0.05);
    }

    var VOICES = {
      kick:  function (t) { tone("sine", 160, 42, 0.28, 1, t); },
      snare: function (t) { noise("highpass", 1400, 0.17, 0.7, t); tone("triangle", 190, 120, 0.1, 0.5, t); },
      hat:   function (t) { noise("highpass", 7500, 0.05, 0.4, t); },
      clap:  function (t) { noise("bandpass", 1300, 0.04, 0.8, t); noise("bandpass", 1300, 0.04, 0.8, t + 0.018); noise("bandpass", 1300, 0.12, 0.8, t + 0.036); },
      bass:  function (t) { tone("sawtooth", 55, 55, 0.5, 0.55, t, 320); },
      chime: function (t) { tone("sine", 880, 880, 0.9, 0.35, t); tone("sine", 1320, 1320, 0.7, 0.2, t); },
      laser: function (t) { tone("square", 1500, 180, 0.22, 0.25, t, 3000); },
      blip:  function (t) { tone("square", 660, 660, 0.06, 0.22, t, 2500); tone("square", 990, 990, 0.09, 0.22, t + 0.06, 2500); }
    };
    var PADS = [
      ["kick", "Kick", "1"], ["snare", "Snare", "2"], ["hat", "Hi-hat", "3"], ["clap", "Clap", "4"],
      ["bass", "Bass", "5"], ["chime", "Chime", "6"], ["laser", "Laser", "7"], ["blip", "Blip", "8"]
    ];

    function hit(name) {
      if (!audio()) { UI.toast("This browser has no audio"); return false; }
      VOICES[name](ctx.currentTime + 0.005);
      return true;
    }

    var padHost = document.getElementById("lg-pads");
    var padHits = 0;
    function flash(b) {
      b.classList.add("is-hit");
      window.setTimeout(function () { b.classList.remove("is-hit"); }, 110);
    }
    function pressed(name, b) {
      if (!hit(name)) return;
      if (b) flash(b);
      padHits++;
      if (padHits % 5 === 0) {
        lounge.pads = (lounge.pads || 0) + 5;
        saveLounge();
        if (lounge.pads === 50) drawAchievements();
      }
    }
    PADS.forEach(function (p) {
      var b = el("button", "lg-pad");
      b.type = "button";
      b.dataset.voice = p[0];
      b.appendChild(el("strong", null, p[1]));
      b.appendChild(el("kbd", null, p[2]));
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); pressed(p[0], b); });
      b.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); pressed(p[0], b); }
      });
      padHost.appendChild(b);
    });
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      var pad = PADS.filter(function (p) { return p[2] === e.key; })[0];
      if (pad) pressed(pad[0], padHost.querySelector('[data-voice="' + pad[0] + '"]'));
    });
    document.getElementById("lg-vol").addEventListener("input", function (e) {
      if (master) master.gain.value = Number(e.target.value) / 100;
    });

    /* An eight-step beat maker on the same voices. */
    var ROWS = ["kick", "snare", "hat", "clap", "bass"];
    var ROW_LABEL = { kick: "Kick", snare: "Snare", hat: "Hi-hat", clap: "Clap", bass: "Bass" };
    var pattern = readJSON(BEAT_KEY, null);
    var valid = pattern && ROWS.every(function (r) { return Array.isArray(pattern[r]) && pattern[r].length === 8; });
    if (!valid) {
      pattern = {
        kick:  [1, 0, 0, 0, 1, 0, 0, 0],
        snare: [0, 0, 1, 0, 0, 0, 1, 0],
        hat:   [1, 1, 1, 1, 1, 1, 1, 1],
        clap:  [0, 0, 0, 0, 0, 0, 0, 1],
        bass:  [1, 0, 0, 1, 0, 0, 1, 0]
      };
    }
    var seqHost = document.getElementById("lg-seq");
    ROWS.forEach(function (row) {
      var r = el("div", "lg-seq-row");
      r.appendChild(el("span", "lg-seq-name", ROW_LABEL[row]));
      for (var i = 0; i < 8; i++) {
        (function (i) {
          var c = el("button", "lg-step");
          c.type = "button";
          c.dataset.step = String(i);
          c.setAttribute("aria-label", ROW_LABEL[row] + ", step " + (i + 1));
          c.setAttribute("aria-pressed", pattern[row][i] ? "true" : "false");
          c.addEventListener("click", function () {
            pattern[row][i] = pattern[row][i] ? 0 : 1;
            c.setAttribute("aria-pressed", pattern[row][i] ? "true" : "false");
            writeJSON(BEAT_KEY, pattern);
            if (pattern[row][i]) hit(row);
          });
          r.appendChild(c);
        })(i);
      }
      seqHost.appendChild(r);
    });

    var playing = false, stepNo = 0, timer = null;
    var playBtn = document.getElementById("lg-play");
    var playLabel = playBtn.querySelector(".lg-play-label");
    var bpm = document.getElementById("lg-bpm");
    var bpmOut = document.getElementById("lg-bpm-out");
    playBtn.insertBefore(UI.icon("pulse"), playBtn.firstChild);

    function paintStep() {
      var now = (stepNo + 7) % 8;
      seqHost.querySelectorAll(".lg-step").forEach(function (c) {
        c.classList.toggle("is-now", playing && Number(c.dataset.step) === now);
      });
    }
    function tick() {
      ROWS.forEach(function (row) { if (pattern[row][stepNo]) VOICES[row](ctx.currentTime + 0.01); });
      stepNo = (stepNo + 1) % 8;
      paintStep();
    }
    function interval() { return 60000 / Number(bpm.value) / 2; }
    function startSeq() {
      if (!audio()) { UI.toast("This browser has no audio"); return; }
      playing = true;
      stepNo = 0;
      playLabel.textContent = "Stop";
      playBtn.setAttribute("aria-pressed", "true");
      tick();
      timer = window.setInterval(tick, interval());
    }
    function stopSeq() {
      playing = false;
      window.clearInterval(timer);
      playLabel.textContent = "Play beat";
      playBtn.setAttribute("aria-pressed", "false");
      paintStep();
    }
    playBtn.addEventListener("click", function () { if (playing) stopSeq(); else startSeq(); });
    bpm.addEventListener("input", function () {
      bpmOut.textContent = bpm.value + " BPM";
      if (playing) { window.clearInterval(timer); timer = window.setInterval(tick, interval()); }
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && playing) stopSeq(); });

    /* ---------------------------------------------------------------- boot */

    buildWheel();
    drawToday();
    drawStreak();
    drawStickers();
    paintSpin();
    fillCategories();
    showReel(null);
    drawAchievements();

    document.querySelectorAll(".lg-jump a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var target = document.querySelector(a.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
