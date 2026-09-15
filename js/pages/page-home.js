/* Overview page. */
(function () {
  "use strict";

  function marquee(game) {
    var UI = window.UI;
    var host = document.getElementById("marquee");
    host.innerHTML = "";

    var art = window.UI.el("div", "marquee-art");
    UI.coverInto(art, game);
    host.appendChild(art);

    var body = UI.el("div", "marquee-body");
    body.appendChild(UI.el("span", "label", "Today’s pick · " + game.categoryLabel));
    var h = UI.el("h2");
    var link = UI.el("a", null, game.title);
    link.href = UI.playHref(game);
    link.style.color = "inherit";
    h.appendChild(link);
    body.appendChild(h);
    body.appendChild(UI.el("p", null, game.description || "Discover something new in your browser."));

    var specs = UI.el("div", "marquee-specs");
    specs.appendChild(UI.el("span", null, UI.launchLabel(game)));
    specs.appendChild(UI.el("span", null, UI.riskLabel(game)));
    body.appendChild(specs);

    var acts = UI.el("div", "marquee-acts");
    var play = UI.el("a", "btn btn-cta", "▶ Play now");
    play.href = UI.playHref(game);
    acts.appendChild(play);
    var more = UI.el("a", "btn", "More " + game.categoryLabel);
    more.href = "browse.html?category=" + game.category;
    acts.appendChild(more);
    var dice = UI.el("button", "btn btn-flat", "⇢ Something else");
    dice.type = "button";
    dice.addEventListener("click", window.Shell.playRandom);
    acts.appendChild(dice);
    body.appendChild(acts);

    host.appendChild(body);
  }

  /* A short count-up on the three numeric readouts. It reads as the index
     tallying itself on arrival rather than a static figure dropped in. Skipped
     entirely under lite mode or a reduced-motion preference, where the final
     value is written straight away. */
  function countUp(node, target) {
    var reduce = document.documentElement.dataset.lite === "on" ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (reduce || target <= 0) { node.textContent = target; return; }
    var start = null, dur = Math.min(900, 260 + target * 4);
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);      // ease-out cubic
      node.textContent = Math.round(eased * target);
      if (t < 1) window.requestAnimationFrame(step);
      else node.textContent = target;
    }
    window.requestAnimationFrame(step);
  }

  function init() {
    var Catalog = window.Catalog;
    var Store = window.Store;
    var UI = window.UI;

    var inPage = Catalog.all.filter(function (g) { return g.embeddable; });

    countUp(document.getElementById("r-games"), Catalog.all.length);
    countUp(document.getElementById("r-cats"), Catalog.categories.length);
    countUp(document.getElementById("r-inpage"), inPage.length);
    document.getElementById("r-time").textContent = UI.formatDuration(Store.totalSeconds());
    document.getElementById("r-date").textContent =
      new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

    marquee(Catalog.daily(1)[0]);

    var recents = Catalog.recentGames(10);
    if (recents.length) {
      document.getElementById("b-resume").hidden = false;
      UI.render(document.getElementById("s-resume"), recents, { desc: false });
    }

    var pinned = Catalog.favoriteGames(10);
    if (pinned.length) {
      document.getElementById("b-pinned").hidden = false;
      UI.render(document.getElementById("s-pinned"), pinned, { desc: false });
    }

    var arrivals = Catalog.newArrivals(12);
    if (arrivals.length) {
      document.getElementById("b-new").hidden = false;
      UI.render(document.getElementById("s-new"), arrivals, { desc: false });
    }

    document.getElementById("sug-why").textContent = Store.totalPlays()
      ? "based on what you play"
      : "A few games to get you started";
    UI.render(document.getElementById("g-suggested"), Catalog.forYou(8), { numbered: false });

    var cats = document.getElementById("g-cats");
    Catalog.categories.forEach(function (cat) {
      var a = UI.el("a", "cat");
      a.href = "browse.html?category=" + cat.id;
      a.appendChild(UI.el("span", "ico", cat.icon));
      a.appendChild(UI.el("strong", null, cat.label));
      a.appendChild(UI.el("span", "n", cat.count + " titles"));
      cats.appendChild(a);
    });

    var stable = Catalog.sort(inPage.filter(function (g) { return g.risk === "low"; }), "random");
    UI.render(document.getElementById("g-inpage"), stable.slice(0, 12), { desc: false });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
