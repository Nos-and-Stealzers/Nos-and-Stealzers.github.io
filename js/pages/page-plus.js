/* Campus+ hub: links to the member extras and the mod menu's settings. */
(function () {
  "use strict";

  function init() {
    var UI = window.UI;
    var Mods = window.ModMenu;

    document.querySelectorAll(".plus-card-ico[data-icon]").forEach(function (n) {
      n.appendChild(UI.icon(n.dataset.icon));
    });

    /* "Try it" opens the game you played last, if there is one. */
    try {
      var recent = window.Store && window.Store.recentGames ? window.Store.recentGames() : null;
      var last = recent && recent[0];
      if (!last && window.Catalog && window.Catalog.recentGames) last = (window.Catalog.recentGames(1) || [])[0];
      var id = last && (last.id || last);
      if (id && typeof id === "string") document.getElementById("try-mods").href = "play.html?id=" + encodeURIComponent(id);
    } catch (e) { /* keep the default */ }

    function drawEditor() {
      var cfg = Mods.config();

      var fx = document.getElementById("fx-list");
      fx.innerHTML = "";
      Mods.looks.forEach(function (l) {
        var b = UI.el("button", "mod-chip", l.label);
        b.type = "button";
        var on = cfg.shown.indexOf(l.id) !== -1;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.addEventListener("click", function () {
          var c = Mods.config();
          if (c.shown.indexOf(l.id) !== -1) c.shown = c.shown.filter(function (x) { return x !== l.id; });
          else c.shown.push(l.id);
          Mods.saveConfig(c);
          drawEditor();
        });
        fx.appendChild(b);
      });

      var list = document.getElementById("preset-list");
      list.innerHTML = "";
      if (!cfg.presets.length) {
        list.appendChild(UI.el("p", "set-hint", "No presets yet."));
      }
      cfg.presets.forEach(function (p, i) {
        var row = UI.el("div", "set-item");
        var ico = UI.el("span", "set-item-ico");
        ico.appendChild(UI.icon("star"));
        row.appendChild(ico);
        var text = UI.el("span", "set-item-text");
        text.appendChild(UI.el("strong", null, p.name));
        var names = Mods.looks.filter(function (l) { return p.looks && p.looks[l.id]; })
          .map(function (l) { return l.label; });
        if (p.zoom && p.zoom !== 1) names.push("Zoom " + Math.round(p.zoom * 100) + "%");
        text.appendChild(UI.el("span", null, names.join(", ") || "No effects"));
        row.appendChild(text);
        var del = UI.el("button", "btn btn-sm btn-flat", "Delete");
        del.type = "button";
        del.addEventListener("click", function () {
          var c = Mods.config();
          c.presets.splice(i, 1);
          Mods.saveConfig(c);
          drawEditor();
        });
        row.appendChild(del);
        list.appendChild(row);
      });

      var remember = document.getElementById("cfg-remember");
      remember.checked = cfg.remember;
      var hotkey = document.getElementById("cfg-hotkey");
      hotkey.checked = cfg.hotkey;
      document.querySelectorAll("[data-side]").forEach(function (b) {
        b.setAttribute("aria-pressed", b.dataset.side === cfg.side ? "true" : "false");
      });
    }

    function setting(key, value) {
      var c = Mods.config();
      c[key] = value;
      Mods.saveConfig(c);
      drawEditor();
      UI.toast("Saved");
    }
    document.getElementById("cfg-remember").addEventListener("change", function (e) { setting("remember", e.target.checked); });
    document.getElementById("cfg-hotkey").addEventListener("change", function (e) { setting("hotkey", e.target.checked); });
    document.querySelectorAll("[data-side]").forEach(function (b) {
      b.addEventListener("click", function () { setting("side", b.dataset.side); });
    });

    function paint() {
      var member = Mods.member();
      var user = window.Session.user;
      document.getElementById("mods-editor").hidden = !member;
      document.getElementById("mods-locked").hidden = member;
      document.getElementById("plus-status").textContent = !user
        ? "Extras for members: videos, an AI helper, and a mod menu for games. Sign in to see yours."
        : member
          ? "You're a Campus+ member. Everything here is unlocked."
          : "Extras for members: videos, an AI helper, and a mod menu for games. Ask staff to turn on Campus+ for your account.";
      document.body.classList.toggle("is-plus-member", member);
      if (member) drawEditor();
    }

    window.Session.ready.then(paint);
    document.addEventListener("session:change", paint);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
