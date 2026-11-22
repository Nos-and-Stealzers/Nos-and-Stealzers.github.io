/* Campus+ perks and the little daily-habit bits (streak, stickers).
   Everything lives in this browser (localStorage), so it needs no database
   change. Membership still comes from the account (Session.isPlus); the
   `member` flag stored here only lets theme-boot.js apply the accent colour
   before the session has loaded, and shell.js refreshes it on every page. */
(function () {
  "use strict";

  var KEY = "ach:perks";
  var COLLECTIONS_KEY = "ach:collections";
  var STREAK_KEY = "ach:streak";

  function readJSON(key, fallback) {
    try {
      var v = JSON.parse(window.localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  /* The perks that have an on/off switch. `on` is the default for a new member. */
  var PERKS = [
    { id: "accent",      label: "Custom accent colour", icon: "star",     on: true,  note: "Recolours buttons, links and highlights on every page, over any skin." },
    { id: "continue",    label: "Continue playing",     icon: "gamepad",  on: true,  note: "A shelf of what you played last, with when and for how long." },
    { id: "collections", label: "Game collections",     icon: "group",    on: true,  note: "Make your own folders of games: a study-hall list, a friends list, anything." },
    { id: "fresh",       label: "Fresh arrivals shelf", icon: "plus",     on: true,  note: "The newest games added to the arcade, newest first." },
    { id: "playtime",    label: "Playtime report",      icon: "pulse",    on: true,  note: "Where your time goes: top games and totals from this device." },
    { id: "backups",     label: "Backup history",       icon: "save",     on: true,  note: "See every cloud save, its earlier version, and download a copy." }
  ];

  function state() {
    var s = readJSON(KEY, {});
    if (!s || typeof s !== "object") s = {};
    if (!s.flags || typeof s.flags !== "object") s.flags = {};
    return s;
  }

  /* ----------------------------------------------------------- colours */

  function hexOk(hex) { return /^#[0-9a-fA-F]{6}$/.test(String(hex || "")); }

  function rgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function toHex(c) {
    return "#" + c.map(function (n) {
      var v = Math.max(0, Math.min(255, Math.round(n)));
      return (v < 16 ? "0" : "") + v.toString(16);
    }).join("");
  }
  function luminance(c) {
    var l = c.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }

  /* The three variables a skin sets, derived from one picked colour. */
  function accentVars(hex) {
    var c = rgb(hex);
    var lum = luminance(c);
    var lighter = toHex(c.map(function (v) { return v + (255 - v) * 0.28; }));
    return {
      "--accent": hex,
      "--accent-2": lighter,
      "--accent-ink": lum > 0.42 ? "#10131a" : "#ffffff"
    };
  }

  var ACCENT_NAMES = ["--accent", "--accent-2", "--accent-ink"];

  function applyAccent() {
    var s = state();
    var root = document.documentElement;
    var on = s.member === true && s.flags.accent !== false && hexOk(s.accent);
    if (!on) {
      ACCENT_NAMES.forEach(function (n) { root.style.removeProperty(n); });
      return;
    }
    var vars = accentVars(s.accent);
    Object.keys(vars).forEach(function (n) { root.style.setProperty(n, vars[n]); });
  }

  /* ------------------------------------------------------------- perks */

  var Perks = {
    list: PERKS,

    member: function () { return state().member === true; },

    /* Called with the session's verdict; returns true when it changed. */
    setMember: function (yes) {
      var s = state();
      if ((s.member === true) === !!yes) return false;
      s.member = !!yes;
      writeJSON(KEY, s);
      applyAccent();
      return true;
    },

    isOn: function (id) {
      var s = state();
      if (s.member !== true) return false;
      if (s.flags[id] === undefined) {
        var p = PERKS.filter(function (x) { return x.id === id; })[0];
        return p ? p.on : false;
      }
      return s.flags[id] !== false;
    },

    set: function (id, on) {
      var s = state();
      s.flags[id] = !!on;
      writeJSON(KEY, s);
      if (id === "accent") applyAccent();
    },

    accent: function () { var s = state(); return hexOk(s.accent) ? s.accent : ""; },
    setAccent: function (hex) {
      var s = state();
      if (hex && !hexOk(hex)) return false;
      if (hex) s.accent = hex; else delete s.accent;
      writeJSON(KEY, s);
      applyAccent();
      return true;
    },
    accentVars: accentVars,
    applyAccent: applyAccent,

    /* --------------------------------------------------- collections */

    collections: function () {
      var list = readJSON(COLLECTIONS_KEY, []);
      return Array.isArray(list) ? list : [];
    },
    saveCollections: function (list) { return writeJSON(COLLECTIONS_KEY, list.slice(0, 40)); },
    newCollection: function (name) {
      var list = Perks.collections();
      var c = { id: "c" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), name: String(name).trim().slice(0, 40), games: [], at: Date.now() };
      list.unshift(c);
      Perks.saveCollections(list);
      return c;
    },

    /* ---------------------------------------------------------- streak */

    streak: function () {
      var s = readJSON(STREAK_KEY, {});
      return { count: s.count || 0, best: s.best || 0, last: s.last || "", days: Array.isArray(s.days) ? s.days : [] };
    },
    dayKey: dayKey,
    /* Call once per page view; it only moves on the first visit of a new day. */
    touchStreak: function () {
      var s = Perks.streak();
      var today = dayKey(0);
      if (s.last === today) return s;
      s.count = s.last === dayKey(-1) ? s.count + 1 : 1;
      s.best = Math.max(s.best, s.count);
      s.last = today;
      s.days = s.days.filter(function (d) { return d !== today; }).concat(today).slice(-60);
      writeJSON(STREAK_KEY, s);
      return s;
    }
  };

  /* Local calendar day, offset in days, as YYYY-MM-DD. */
  function dayKey(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
  }

  window.Perks = Perks;
})();
