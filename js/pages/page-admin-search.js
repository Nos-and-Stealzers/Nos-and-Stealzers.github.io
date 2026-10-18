/* Admin-only embedded search. */
(function () {
  "use strict";

  var ENDPOINT = "https://html.duckduckgo.com/html/";
  var PLACEHOLDER =
    "<body style=\"margin:0;font:14px system-ui,sans-serif;color:#8a8f98;" +
    "background:#0c0d10;display:grid;place-items:center;height:100vh\">" +
    "<p>Type a search above.</p></body>";

  function init() {
    window.SocialUI.gate(function () {
      if (!window.Session.isAdmin()) {
        document.getElementById("denied").hidden = false;
        return;
      }
      document.getElementById("tool").hidden = false;

      var form = document.getElementById("search-form");
      var input = document.getElementById("q");
      var frame = document.getElementById("results");
      var openTab = document.getElementById("open-tab");
      var status = document.getElementById("admin-load-status");
      var currentQuery = "";
      var pendingTimer = null;

      /* Fresh browsing contexts keep frame navigations out of query history
         and prevent an old frame's load event changing the current status. */
      function newFrame() {
        var next = frame.cloneNode(false);
        next.removeAttribute("src");
        next.removeAttribute("srcdoc");
        frame.replaceWith(next);
        frame = next;
        frame.addEventListener("load", frameLoaded);
      }

      function clear() {
        window.clearTimeout(pendingTimer);
        currentQuery = "";
        newFrame();
        frame.removeAttribute("src");
        frame.srcdoc = PLACEHOLDER;
        frame.title = "Search results";
        frame.setAttribute("aria-busy", "false");
        openTab.href = ENDPOINT;
        status.textContent = "Type a query to search the web.";
      }

      function run(q, remember) {
        window.clearTimeout(pendingTimer);
        currentQuery = q;
        if (remember) {
          var location = new URL(window.location.href);
          if (q) location.searchParams.set("q", q); else location.searchParams.delete("q");
          if (location.href !== window.location.href) window.history.pushState({}, "", location.href);
        }
        if (!q) { clear(); return; }
        var url = ENDPOINT + "?q=" + encodeURIComponent(q);
        newFrame();
        frame.title = "Search results for " + q;
        frame.setAttribute("aria-busy", "true");
        status.textContent = "Requesting external results for “" + q + "”…";
        frame.removeAttribute("srcdoc");
        frame.src = url;
        openTab.href = url;
        pendingTimer = window.setTimeout(function () {
          frame.setAttribute("aria-busy", "false");
          status.textContent = "Still waiting for external results. If the frame is blank, open this search in a new tab.";
        }, 10000);
      }

      function frameLoaded(event) {
        if (event.currentTarget !== frame) return;
        if (!currentQuery || frame.hasAttribute("srcdoc")) return;
        window.clearTimeout(pendingTimer);
        frame.setAttribute("aria-busy", "false");
        /* Cross-origin load events cannot prove that results were delivered. */
        status.textContent = "External frame loaded for “" + currentQuery + "”. If results are blocked or blank, open this search in a new tab.";
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var q = input.value.trim();
        run(q, true);
      });

      /* Land straight on a query if one was shared, e.g. admin.html linking
         here with something already typed. */
      var params = new URLSearchParams(window.location.search);
      var initial = (params.get("q") || "").trim();
      input.value = initial;
      run(initial, false);
      window.addEventListener("popstate", function () {
        var q = (new URLSearchParams(window.location.search).get("q") || "").trim();
        input.value = q;
        run(q, false);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
