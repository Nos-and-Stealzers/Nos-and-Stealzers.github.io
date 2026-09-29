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
    var resetBtn = document.getElementById("cfg-reset");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      var go = window.Dialogs && window.Dialogs.confirm
        ? window.Dialogs.confirm({ title: "Reset the mod menu?", body: "Clears presets, hidden effects and the current look. Doesn't touch cheats already applied to a save.", confirmLabel: "Reset" })
        : Promise.resolve(window.confirm("Reset the mod menu? This clears presets, hidden effects and the current look."));
      go.then(function (ok) {
        if (!ok) return;
        Mods.reset();
        drawEditor();
        UI.toast("Mod menu reset");
      });
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

    /* ---- which games get in-game cheats ---- */
    var KINDS = [
      ["mario", "Super Mario 64", "God mode, fly, super speed and jump, low gravity, the three caps, and all 120 stars."],
      ["clickteam", "Five Nights at Freddy's", "Infinite power, frozen animatronics, skip to 6 AM, and every counter editable."],
      ["minecraft", "Minecraft (Eaglercraft)", "Creative mode, daytime, effects, items, or any command, in worlds with cheats on."],
      ["phaser", "Phaser games", "God mode, no clip, fly, super speed, low gravity, skip level, and their scores."],
      ["construct", "Construct games", "Super speed and jump, low gravity on platformers, and the game's own numbers."],
      ["cookie", "Cookie Clicker", "Set cookies, an auto-clicker, golden cookies and frenzies, sugar lumps, free buildings, and every upgrade and achievement."],
      ["dino", "Chrome Dino", "Can't crash, auto-jump, any speed, set the score and high score, night mode."],
      ["moto", "Moto X3M", "Every level open with 3 stars and every bike, in all five Moto X3M games."],
      ["retrobowl", "Retro Bowl", "Coaching credits, salary cap, fans, coach rating and facilities for any save slot, or max them all."],
      ["unity", "Unity games", "A save editor for what the game stores (coins, levels, unlocks), with undo. House of Hazards also gets every character unlocked and task skipping."],
      ["values", "Other games", "Their coins, points and score, with Max everything and Lock."]
    ];
    function drawModList() {
      var host = document.getElementById("modlist");
      if (!host) return;
      var map = window.MOD_GAMES || {};
      var q = (document.getElementById("modlist-q").value || "").trim().toLowerCase();
      host.innerHTML = "";
      var total = 0;
      KINDS.forEach(function (kind) {
        var games = Object.keys(map).filter(function (id) { return map[id] === kind[0]; })
          .map(function (id) { return window.Catalog.byId(id); })
          .filter(function (g) { return g && (!q || g.titleLower.indexOf(q) !== -1); })
          .sort(function (a, b) { return a.title.localeCompare(b.title); })
          .filter(function (g, i, all) { return !i || all[i - 1].titleLower !== g.titleLower; });
        if (!games.length) return;
        total += games.length;
        var card = UI.el("div", "set-card plus-modgroup");
        var head = UI.el("div", "plus-modgroup-head");
        head.appendChild(UI.el("strong", "set-card-title", kind[1]));
        head.appendChild(UI.el("span", "plus-modgroup-n", String(games.length)));
        card.appendChild(head);
        card.appendChild(UI.el("p", "set-hint", kind[2]));
        var list = UI.el("div", "plus-modgames");
        games.forEach(function (g) {
          var a = UI.el("a", "plus-modgame", g.title);
          a.href = "play.html?id=" + encodeURIComponent(g.id);
          list.appendChild(a);
        });
        card.appendChild(list);
        host.appendChild(card);
      });
      if (!total) host.appendChild(UI.el("p", "set-hint", "No games match."));
      document.getElementById("modlist-count").textContent = total + (total === 1 ? " game" : " games");
    }
    var filter = document.getElementById("modlist-q");
    if (filter) filter.addEventListener("input", drawModList);
    drawModList();

    window.Session.ready.then(paint);
    document.addEventListener("session:change", paint);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
