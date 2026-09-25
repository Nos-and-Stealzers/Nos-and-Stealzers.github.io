/* Your shelf: pins, history, ratings, most played. */
(function () {
  "use strict";

  function init() {
    var Catalog = window.Catalog;
    var Store = window.Store;
    var UI = window.UI;

    document.getElementById("a-settings").addEventListener("click", window.Shell.openSettings);

    document.getElementById("a-clear").addEventListener("click", function () {
      if (!Store.recents().length) { UI.toast("No history to clear"); return; }
      if (window.confirm("Clear the history list? Playtime totals are kept.")) {
        Store.clearRecents();
        draw();
        UI.toast("History cleared");
      }
    });

    function drawPinned() {
      var pinned = Catalog.favoriteGames();
      var tools = document.getElementById("pin-tools");
      var hint = document.getElementById("pin-hint");
      var sortSel = document.getElementById("pin-sort");
      var mode = sortSel ? sortSel.value : "custom";

      if (tools) tools.hidden = pinned.length === 0;
      if (hint) hint.hidden = pinned.length < 2 || mode !== "custom";

      var stats = Store.stats();
      var list = pinned.slice();
      if (mode === "az") list.sort(function (a, b) { return a.title.localeCompare(b.title); });
      else if (mode === "za") list.sort(function (a, b) { return b.title.localeCompare(a.title); });
      else if (mode === "played") list.sort(function (a, b) {
        return ((stats[b.id] && stats[b.id].seconds) || 0) - ((stats[a.id] && stats[a.id].seconds) || 0);
      });
      else if (mode === "recent") {
        var order = Store.recents();
        list.sort(function (a, b) {
          var ai = order.indexOf(a.id), bi = order.indexOf(b.id);
          if (ai === -1) ai = 1e9; if (bi === -1) bi = 1e9;
          return ai - bi;
        });
      }

      var host = document.getElementById("g-pinned");
      UI.render(host, list, {
        emptyTitle: "Nothing pinned yet",
        emptyBody: "Hit ☆ on any tile — or press F while playing — to keep it here.",
        emptyAction: { label: "Open the index", href: "browse.html" },
        onFavorite: function () { window.setTimeout(draw, 10); }
      });

      /* Drag-to-reorder — only in custom order, where a new arrangement is
         meaningful (a fixed sort would just snap back). */
      if (mode === "custom" && list.length > 1) enableReorder(host);
    }

    var dragEl = null;
    function enableReorder(host) {
      var cards = host.querySelectorAll(".tile");
      Array.prototype.forEach.call(cards, function (card) {
        card.setAttribute("draggable", "true");
        card.classList.add("is-draggable");
        card.addEventListener("dragstart", function (e) {
          dragEl = card;
          card.classList.add("is-dragging");
          try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.dataset.gameId); } catch (x) {}
        });
        card.addEventListener("dragend", function () {
          card.classList.remove("is-dragging");
          dragEl = null;
          persistOrder(host);
        });
        card.addEventListener("dragover", function (e) {
          e.preventDefault();
          if (!dragEl || dragEl === card) return;
          var r = card.getBoundingClientRect();
          var after = (e.clientY - r.top) > r.height / 2 || (e.clientX - r.left) > r.width / 2;
          host.insertBefore(dragEl, after ? card.nextSibling : card);
        });
      });
    }

    function persistOrder(host) {
      var ids = Array.prototype.map.call(host.querySelectorAll(".tile"), function (t) {
        return t.dataset.gameId;
      });
      Store.setFavorites(ids);
      UI.toast("Pin order saved");
    }

    function draw() {
      var pinned = Catalog.favoriteGames();
      var stats = Store.stats();
      var ratings = Store.ratings();
      var playedIds = Object.keys(stats).filter(function (id) { return Catalog.byId(id); });

      document.getElementById("r-pins").textContent = pinned.length;
      document.getElementById("r-played").textContent = playedIds.length;
      document.getElementById("r-rated").textContent = Object.keys(ratings).length;
      document.getElementById("r-time").textContent = UI.formatDuration(Store.totalSeconds());

      drawPinned();

      UI.renderList(document.getElementById("l-history"), Catalog.recentGames(30), {
        emptyTitle: "Nothing played yet",
        emptyBody: "Titles you open show up here so you can jump straight back in.",
        emptyAction: { label: "Find something", href: "browse.html" },
        onFavorite: function () { window.setTimeout(draw, 10); }
      });

      var rated = Object.keys(ratings)
        .map(function (id) { return Catalog.byId(id); })
        .filter(Boolean)
        .sort(function (a, b) { return ratings[b.id] - ratings[a.id]; })
        .slice(0, 12);
      document.getElementById("b-rated").hidden = rated.length === 0;
      if (rated.length) UI.render(document.getElementById("g-rated"), rated, { desc: false });

      var most = playedIds
        .map(function (id) { return Catalog.byId(id); })
        .sort(function (a, b) {
          return (stats[b.id].seconds || 0) - (stats[a.id].seconds || 0) ||
                 (stats[b.id].plays || 0) - (stats[a.id].plays || 0);
        })
        .slice(0, 12);
      document.getElementById("b-most").hidden = most.length === 0;
      if (most.length) UI.render(document.getElementById("g-most"), most, { desc: false, numbered: true });
    }

    draw();
    /* The account's copy arrives after first paint on a new device. */
    document.addEventListener("session:synced", draw);

    /* Pinned toolbar wiring. */
    var sortSel = document.getElementById("pin-sort");
    if (sortSel) sortSel.addEventListener("change", function () { drawPinned(); });

    var shuffle = document.getElementById("pin-shuffle");
    if (shuffle) shuffle.addEventListener("click", function () {
      var pins = Catalog.favoriteGames();
      if (!pins.length) { UI.toast("Pin some games first"); return; }
      var pick = pins[Math.floor(Math.random() * pins.length)];
      window.location.href = UI.playHref(pick);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
