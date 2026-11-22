/* Campus+ perks: one list with an on/off switch per perk, and a working panel
   under each one that is switched on. Everything is stored on this device
   (js/core/perks.js), apart from the cloud-save list, which reads the
   account's existing save rows. */
(function () {
  "use strict";

  var SWATCHES = [
    ["Blue", "#4f8cff"], ["Cyan", "#22c3e6"], ["Teal", "#1fbf9b"], ["Green", "#3fcf6b"], ["Lime", "#9acd32"],
    ["Amber", "#f5a524"], ["Orange", "#ff7a3d"], ["Red", "#f0504d"], ["Pink", "#ee5fa7"], ["Violet", "#9b6bff"]
  ];

  function init() {
    var UI = window.UI, Perks = window.Perks, Session = window.Session, Catalog = window.Catalog, Store = window.Store;
    var el = UI.el;
    var host = document.getElementById("pk-list");
    var panels = document.getElementById("pk-panels");
    if (!host || !panels) return;

    function member() { return !!(Session.user && Session.isPlus && Session.isPlus()); }

    function button(label, iconName, onClick, cls) {
      var b = el("button", "btn btn-sm" + (cls ? " " + cls : ""));
      b.type = "button";
      if (iconName) b.appendChild(UI.icon(iconName));
      b.appendChild(el("span", null, label));
      b.addEventListener("click", onClick);
      return b;
    }

    function ago(ts) { return ts ? UI.formatWhen(ts) : "never"; }

    function gameThumb(game) {
      var art = el("span", "pk-thumb");
      UI.coverInto(art, game);
      return art;
    }

    function emptyNote(title, body) {
      var box = el("div", "pk-empty");
      box.appendChild(el("strong", null, title));
      box.appendChild(el("p", null, body));
      return box;
    }

    /* ----------------------------------------------------- the list */

    function drawList() {
      var ok = member();
      host.innerHTML = "";

      Perks.list.forEach(function (p) {
        var row = el("div", "pk-row");
        row.dataset.perk = p.id;
        var ico = el("span", "pk-ico");
        ico.appendChild(UI.icon(p.icon));
        row.appendChild(ico);
        var text = el("div", "pk-text");
        text.appendChild(el("strong", null, p.label));
        text.appendChild(el("span", null, p.note));
        row.appendChild(text);

        var label = el("label", "toggle");
        var input = el("input");
        input.type = "checkbox";
        input.id = "pk-on-" + p.id;
        input.checked = ok && Perks.isOn(p.id);
        input.disabled = !ok;
        input.setAttribute("aria-label", p.label + (ok ? "" : " (members only)"));
        input.addEventListener("change", function () {
          Perks.set(p.id, input.checked);
          drawPanels();
        });
        label.appendChild(input);
        label.appendChild(el("i"));
        row.appendChild(label);
        host.appendChild(row);
      });
    }

    /* ---------------------------------------------------- panels */

    function card(id, title, hint) {
      var c = el("section", "set-card pk-panel");
      c.id = "pk-" + id;
      c.appendChild(el("strong", "set-card-title", title));
      if (hint) c.appendChild(el("p", "set-hint", hint));
      return c;
    }

    function accentPanel() {
      var c = card("accent", "Accent colour", "Pick a colour and the whole site follows it. Clear it to go back to your skin's own colour.");
      var row = el("div", "pk-swatches");
      var current = Perks.accent();
      var custom = el("input", "pk-color");
      custom.type = "color";
      custom.value = current || "#4f8cff";
      custom.setAttribute("aria-label", "Pick any colour");

      function mark() {
        var now = Perks.accent();
        row.querySelectorAll(".pk-swatch").forEach(function (b) {
          b.setAttribute("aria-pressed", b.dataset.hex === now ? "true" : "false");
        });
      }
      SWATCHES.forEach(function (s) {
        var b = el("button", "pk-swatch");
        b.type = "button";
        b.dataset.hex = s[1];
        b.style.background = s[1];
        b.title = s[0];
        b.setAttribute("aria-label", s[0]);
        b.addEventListener("click", function () { Perks.setAccent(s[1]); custom.value = s[1]; mark(); });
        row.appendChild(b);
      });
      c.appendChild(row);

      var tools = el("div", "pk-tools");
      var cl = el("label", "pk-custom");
      cl.appendChild(el("span", null, "Any colour"));
      cl.appendChild(custom);
      custom.addEventListener("input", function () { Perks.setAccent(custom.value); mark(); });
      tools.appendChild(cl);
      tools.appendChild(button("Use my skin's colour", "retry", function () { Perks.setAccent(""); mark(); UI.toast("Back to the skin's accent"); }));
      var demo = el("span", "pk-demo");
      demo.appendChild(el("span", "btn btn-sm btn-cta", "Sample button"));
      demo.appendChild(el("a", null, "Sample link"));
      tools.appendChild(demo);
      c.appendChild(tools);
      mark();
      return c;
    }

    function continuePanel() {
      var c = card("continue", "Continue playing", "Pick up where you left off. Times come from this device.");
      var recents = Store.recents().map(function (r) { return { game: Catalog.byId(r.id), at: r.at }; })
        .filter(function (r) { return r.game; }).slice(0, 8);
      if (!recents.length) { c.appendChild(emptyNote("Nothing played yet", "Open any game and it shows up here.")); return c; }
      var list = el("div", "pk-games");
      recents.forEach(function (r) {
        var st = Store.statFor(r.game.id);
        var a = el("a", "pk-game");
        a.href = UI.playHref(r.game);
        a.appendChild(gameThumb(r.game));
        var t = el("span", "pk-game-text");
        t.appendChild(el("strong", null, r.game.title));
        var bits = ["Last played " + ago(r.at)];
        if (st.seconds) bits.push(UI.formatDuration(st.seconds) + " total");
        if (st.plays) bits.push(st.plays + (st.plays === 1 ? " play" : " plays"));
        t.appendChild(el("span", null, bits.join(" · ")));
        a.appendChild(t);
        var go = el("span", "pk-game-go");
        go.appendChild(UI.icon("gamepad"));
        go.appendChild(el("span", null, "Resume"));
        a.appendChild(go);
        list.appendChild(a);
      });
      c.appendChild(list);
      return c;
    }

    function freshPanel() {
      var c = card("fresh", "Fresh arrivals", "The newest games in the arcade.");
      var news = Catalog.newArrivals(12).filter(function (g) { return !g.unavailable; });
      if (!news.length) { c.appendChild(emptyNote("Nothing new right now", "Check back after the next update.")); return c; }
      var grid = el("div", "grid grid-sm");
      c.appendChild(grid);
      UI.render(grid, news, { desc: false });
      return c;
    }

    function playtimePanel() {
      var c = card("playtime", "Playtime report", "Counted on this device while games are open.");
      var stats = Store.stats();
      var rows = Object.keys(stats).map(function (id) { return { id: id, s: stats[id], g: Catalog.byId(id) }; })
        .filter(function (r) { return r.g && r.s.seconds > 0; })
        .sort(function (a, b) { return b.s.seconds - a.s.seconds; });
      if (!rows.length) { c.appendChild(emptyNote("No playtime yet", "Play a game for a minute and it starts counting.")); return c; }

      var sums = el("div", "pk-sums");
      [[UI.formatDuration(Store.totalSeconds()), "total playtime"], [String(Store.totalPlays()), "game launches"], [String(rows.length), "games played"]]
        .forEach(function (x) {
          var d = el("div", "pk-sum");
          d.appendChild(el("b", null, x[0]));
          d.appendChild(el("span", null, x[1]));
          sums.appendChild(d);
        });
      c.appendChild(sums);

      var max = rows[0].s.seconds;
      var bars = el("ol", "pk-bars");
      rows.slice(0, 8).forEach(function (r) {
        var li = el("li", "pk-bar");
        var a = el("a", "pk-bar-name", r.g.title);
        a.href = UI.playHref(r.g);
        li.appendChild(a);
        var track = el("span", "pk-bar-track");
        var fill = el("span", "pk-bar-fill");
        fill.style.width = Math.max(3, Math.round(r.s.seconds / max * 100)) + "%";
        track.appendChild(fill);
        li.appendChild(track);
        li.appendChild(el("span", "pk-bar-time", UI.formatDuration(r.s.seconds)));
        bars.appendChild(li);
      });
      c.appendChild(bars);
      return c;
    }

    /* Collections: folders of games, kept on this device. */
    var openCollection = null;
    function collectionsPanel() {
      var c = card("collections", "Game collections", "Folders you make yourself. Open one to add games or play from it.");
      var body = el("div", "pk-coll");
      c.appendChild(body);

      function drawIndex() {
        openCollection = null;
        body.innerHTML = "";
        var bar = el("div", "pk-tools");
        bar.appendChild(button("New collection", "plus", function () {
          window.Dialogs.ask({ title: "New collection", placeholder: "Name, e.g. Study hall", maxLength: 40, confirmLabel: "Create" }).then(function (name) {
            if (!name || !String(name).trim()) return;
            var made = Perks.newCollection(name);
            drawDetail(made.id);
          });
        }, "btn-cta"));
        body.appendChild(bar);
        var list = Perks.collections();
        if (!list.length) { body.appendChild(emptyNote("No collections yet", "Make one, then add games from the catalogue.")); return; }
        var grid = el("div", "pk-coll-grid");
        list.forEach(function (col) {
          var b = el("button", "pk-coll-card");
          b.type = "button";
          var thumbs = el("span", "pk-coll-thumbs");
          col.games.slice(0, 4).map(function (id) { return Catalog.byId(id); }).filter(Boolean).forEach(function (g) { thumbs.appendChild(gameThumb(g)); });
          if (!thumbs.children.length) thumbs.appendChild(el("span", "pk-coll-blank", "Empty"));
          b.appendChild(thumbs);
          b.appendChild(el("strong", null, col.name));
          b.appendChild(el("span", "dim", col.games.length + (col.games.length === 1 ? " game" : " games")));
          b.addEventListener("click", function () { drawDetail(col.id); });
          grid.appendChild(b);
        });
        body.appendChild(grid);
      }

      function save(list) { if (!Perks.saveCollections(list)) UI.toast("This browser wouldn't save that"); }

      function drawDetail(id) {
        var list = Perks.collections();
        var col = list.filter(function (x) { return x.id === id; })[0];
        if (!col) { drawIndex(); return; }
        openCollection = id;
        body.innerHTML = "";

        var top = el("div", "pk-tools");
        top.appendChild(button("All collections", "back", drawIndex, "btn-flat"));
        top.appendChild(el("strong", "pk-coll-name", col.name));
        top.appendChild(el("span", "fill"));
        top.appendChild(button("Rename", "edit", function () {
          window.Dialogs.ask({ title: "Rename collection", value: col.name, maxLength: 40, confirmLabel: "Rename" }).then(function (n) {
            if (!n || !String(n).trim()) return;
            col.name = String(n).trim().slice(0, 40);
            save(list); drawDetail(id);
          });
        }));
        top.appendChild(button("Delete", "trash", function () {
          window.Dialogs.confirm({ title: "Delete “" + col.name + "”?", body: "The games stay in the arcade; only this folder goes.", confirmLabel: "Delete", danger: true }).then(function (yes) {
            if (!yes) return;
            save(list.filter(function (x) { return x.id !== id; }));
            drawIndex();
          });
        }, "btn-danger"));
        body.appendChild(top);

        var games = col.games.map(function (gid) { return Catalog.byId(gid); }).filter(Boolean);
        if (games.length) {
          var play = button("Random game from this", "retry", function () {
            var g = games[Math.floor(Math.random() * games.length)];
            window.location.href = UI.playHref(g);
          });
          top.insertBefore(play, top.querySelector(".fill").nextSibling);
          var grid = el("div", "pk-games");
          games.forEach(function (g) {
            var rowEl = el("div", "pk-game is-row");
            var a = el("a", "pk-game-main");
            a.href = UI.playHref(g);
            a.appendChild(gameThumb(g));
            var t = el("span", "pk-game-text");
            t.appendChild(el("strong", null, g.title));
            t.appendChild(el("span", null, g.categoryLabel));
            a.appendChild(t);
            rowEl.appendChild(a);
            rowEl.appendChild(button("Remove", "close", function () {
              col.games = col.games.filter(function (x) { return x !== g.id; });
              save(list); drawDetail(id);
            }, "btn-flat"));
            grid.appendChild(rowEl);
          });
          body.appendChild(grid);
        } else {
          body.appendChild(emptyNote("Nothing in here yet", "Search below and add some games."));
        }

        var add = el("div", "pk-add");
        add.appendChild(el("strong", null, "Add games"));
        var q = el("input");
        q.type = "search";
        q.placeholder = "Search the catalogue";
        q.setAttribute("aria-label", "Search the catalogue to add games");
        q.autocomplete = "off";
        add.appendChild(q);
        var out = el("div", "pk-results");
        add.appendChild(out);
        function results() {
          out.innerHTML = "";
          var term = q.value.trim();
          if (!term) return;
          var have = new Set(col.games);
          Catalog.search(term, Catalog.playable).slice(0, 8).forEach(function (g) {
            var r = el("div", "pk-game is-row");
            var info = el("span", "pk-game-main");
            info.appendChild(gameThumb(g));
            var t = el("span", "pk-game-text");
            t.appendChild(el("strong", null, g.title));
            t.appendChild(el("span", null, g.categoryLabel));
            info.appendChild(t);
            r.appendChild(info);
            var inIt = have.has(g.id);
            var b = button(inIt ? "Added" : "Add", inIt ? "check" : "plus", function () {
              col.games.push(g.id);
              save(list);
              drawDetail(id);
            }, inIt ? "btn-flat" : "");
            b.disabled = inIt;
            r.appendChild(b);
            out.appendChild(r);
          });
          if (!out.children.length) out.appendChild(el("p", "set-hint", "No games match that."));
        }
        q.addEventListener("input", UI.debounce(results, 150));
        body.appendChild(add);
      }

      drawIndex();
      return c;
    }

    /* Cloud saves and their earlier versions, with a download for each. */
    function download(name, data) {
      var blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    function backupsPanel() {
      var c = card("backups", "Backup history", "Every game save stored in your account. Before a cloud save replaces your copy, the older one is kept as the previous version.");
      var body = el("div", "pk-backups");
      c.appendChild(body);
      if (!Session.user) { body.appendChild(emptyNote("Sign in to see your saves", "Saves are stored with your account.")); return c; }
      body.appendChild(el("p", "set-hint", "Loading your saves…"));
      window.API.listGameSaves().then(function (res) {
        body.innerHTML = "";
        var hosts = (res && res.hosts) || [];
        var byHost = {};
        hosts.forEach(function (h) { byHost[h.host] = h; });
        var main = hosts.filter(function (h) { return !/\.prev$/.test(h.host); });
        if (!main.length) { body.appendChild(emptyNote("No cloud saves yet", "Hit Save inside a game, or play with auto-backup on.")); return; }
        main.sort(function (a, b) { return b.updatedAt - a.updatedAt; });

        function label(host) {
          var m = /^game\.(.+)$/.exec(host);
          var g = m && Catalog.byId(m[1]);
          return g ? g.title : host;
        }
        var list = el("div", "pk-saves");
        main.forEach(function (h) {
          var row = el("div", "pk-save");
          var t = el("span", "pk-save-text");
          t.appendChild(el("strong", null, label(h.host)));
          var prev = byHost[h.host + ".prev"];
          t.appendChild(el("span", null, "Saved " + ago(h.updatedAt) + (h.keys ? " · " + h.keys + " entries" : "") +
            (prev ? " · earlier version from " + ago(prev.updatedAt) : "")));
          row.appendChild(t);
          var acts = el("span", "pk-save-acts");
          function dl(host, text, stamp) {
            return button(text, "arrowDown", function (e) {
              var b = e.currentTarget;
              b.disabled = true;
              window.API.getGameSave(host).then(function (res2) {
                download(host.replace(/[^A-Za-z0-9._-]/g, "_") + "-" + new Date(stamp || Date.now()).toISOString().slice(0, 10) + ".json",
                  { host: host, savedAt: stamp || 0, payload: res2.payload });
              }).catch(function (err) { UI.toast(err.message || "Couldn't download that"); })
                .then(function () { b.disabled = false; });
            }, "btn-flat");
          }
          acts.appendChild(dl(h.host, "Download", h.updatedAt));
          if (prev) acts.appendChild(dl(prev.host, "Earlier version", prev.updatedAt));
          row.appendChild(acts);
          list.appendChild(row);
        });
        body.appendChild(list);
        body.appendChild(el("p", "set-hint", "Downloads are a read-only copy. Restoring still happens from the game's own page."));
      }).catch(function (err) {
        body.innerHTML = "";
        var retry = button("Try again", "retry", function () { drawPanels(); });
        body.appendChild(emptyNote("Couldn't load your saves", (err && err.message) || "Check your connection."));
        body.appendChild(retry);
      });
      return c;
    }

    var BUILDERS = { accent: accentPanel, "continue": continuePanel, collections: collectionsPanel, fresh: freshPanel, playtime: playtimePanel, backups: backupsPanel };

    function drawPanels() {
      panels.innerHTML = "";
      if (!member()) return;
      Perks.list.forEach(function (p) {
        if (Perks.isOn(p.id) && BUILDERS[p.id]) panels.appendChild(BUILDERS[p.id]());
      });
    }

    function paint() {
      Perks.setMember(member());
      drawList();
      drawPanels();
    }

    /* Another tab changing perks should show up here too. */
    window.addEventListener("storage", function (e) {
      if (e.key === "ach:perks" || e.key === "ach:collections") { drawList(); if (!openCollection) drawPanels(); }
    });

    Session.ready.then(paint);
    document.addEventListener("session:change", paint);
    drawList();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
