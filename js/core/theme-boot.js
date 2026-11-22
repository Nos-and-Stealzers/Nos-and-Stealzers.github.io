/* Runs in <head>, before first paint, so the skin never flashes.
   Kept dependency-free — the alias table is duplicated here on purpose so this
   file can load before config.js. */
(function () {
  "use strict";

  var ALIAS = {
    light: "paper", gray: "slate", black: "noir",
    midnight: "blueprint", arcade: "terminal"
  };
  var VALID = {
    noir: 1, paper: 1, slate: 1, terminal: 1, blueprint: 1,
    grape: 1, ember: 1, linen: 1
  };

  var skin = "noir";
  var lite = false;
  var motion = true;
  var textSize = "normal";

  try {
    var raw = window.localStorage.getItem("ach:settings");
    if (raw) {
      var s = JSON.parse(raw) || {};
      var want = s.skin || ALIAS[s.theme] || s.theme;
      if (want && VALID[want]) skin = want;
      lite = !!(s.lite || s.fast);
      if (typeof s.motion === "boolean") motion = s.motion;
      if (s.textSize) textSize = s.textSize;
    }
  } catch (err) { /* private mode, blocked storage — defaults are fine */ }

  /* Honour the OS setting when the user hasn't expressed one here. */
  try {
    if (motion && window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      motion = false;
    }
  } catch (err) { /* no matchMedia */ }

  var root = document.documentElement;
  root.setAttribute("data-skin", skin);
  root.setAttribute("data-lite", lite ? "on" : "off");
  root.setAttribute("data-motion", motion ? "on" : "off");
  root.setAttribute("data-text", textSize);

  /* Campus+ custom accent colour (set on the Campus+ page). Only applied while
     the account is a member; shell.js keeps the `member` flag honest. */
  try {
    var perks = JSON.parse(window.localStorage.getItem("ach:perks") || "null");
    if (perks && perks.member === true && !(perks.flags && perks.flags.accent === false) &&
        /^#[0-9a-fA-F]{6}$/.test(perks.accent || "")) {
      var hex = perks.accent;
      var ch = [1, 3, 5].map(function (i) { return parseInt(hex.substr(i, 2), 16); });
      var lin = ch.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      var lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      var soft = "#" + ch.map(function (v) {
        var n = Math.round(v + (255 - v) * 0.28);
        return (n < 16 ? "0" : "") + n.toString(16);
      }).join("");
      root.style.setProperty("--accent", hex);
      root.style.setProperty("--accent-2", soft);
      root.style.setProperty("--accent-ink", lum > 0.42 ? "#10131a" : "#ffffff");
    }
  } catch (err) { /* defaults are fine */ }

  /* Smooth page-in, so navigating between pages fades instead of flashing a jarring content pop (the "lags out… */
  if (motion && !lite) {
    root.setAttribute("data-loading", "");
    var reveal = function () { root.removeAttribute("data-loading"); };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", reveal);
    } else {
      reveal();
    }
    window.setTimeout(reveal, 1200);
  }
})();
