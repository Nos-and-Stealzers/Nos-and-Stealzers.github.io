/* about:blank cloak launcher.
 *
 * Opens a game inside a blank, URL-less tab so nothing in the browser's
 * address bar or history ever shows a game or arcade domain — the single
 * most reliable way past a school/work content filter that watches URLs and
 * history. The blank tab holds one full-window iframe pointed at the game;
 * to the filter it is just "about:blank".
 *
 * Public API (window.Cloak):
 *   Cloak.supported()            -> boolean
 *   Cloak.open(url, opts)        -> the opened Window (or null if popup blocked)
 *       opts.title  favicon/title to disguise the tab (default "Google")
 *       opts.icon   favicon href (default a Google favicon)
 *
 * This is deliberately dependency-free and self-contained so it works on the
 * play page, the index, and inside the about:blank child itself.
 */
(function () {
  "use strict";

  var DISGUISES = {
    google:   { title: "Google",              icon: "https://www.google.com/favicon.ico" },
    drive:    { title: "My Drive - Google Drive", icon: "https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png" },
    classroom:{ title: "Classes",             icon: "https://ssl.gstatic.com/classroom/favicon.png" },
    docs:     { title: "Google Docs",         icon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico" },
    clever:   { title: "Clever | Portal",     icon: "https://clever.com/favicon.ico" },
    canvas:   { title: "Dashboard",           icon: "https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico" }
  };

  function pickDisguise(opts) {
    opts = opts || {};
    if (opts.title || opts.icon) {
      return { title: opts.title || "Google", icon: opts.icon || DISGUISES.google.icon };
    }
    var key = opts.disguise || (window.SITE && window.SITE.defaults && window.SITE.defaults.cloakDisguise) || "google";
    return DISGUISES[key] || DISGUISES.google;
  }

  function supported() {
    // Popups must be allowed and we need a same-tab window we can write into.
    return typeof window.open === "function";
  }

  function absolute(url) {
    try { return new URL(url, location.href).href; } catch (e) { return url; }
  }

  function open(url, opts) {
    if (!url) return null;
    var full = absolute(url);
    var d = pickDisguise(opts);

    var win = window.open("about:blank", "_blank");
    if (!win) return null;

    // Build the blank shell entirely in the child document. No arcade markup,
    // no arcade URL — just a disguised title + a full-window game iframe.
    var doc = win.document;
    try {
      doc.open();
      doc.write(
        "<!doctype html><html><head><meta charset='utf-8'>" +
        "<title>" + esc(d.title) + "</title>" +
        "<link rel='icon' href='" + esc(d.icon) + "'>" +
        "<meta name='referrer' content='no-referrer'>" +
        "<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}" +
        "iframe{border:0;position:fixed;inset:0;width:100%;height:100%}" +
        "#x{position:fixed;top:8px;right:10px;z-index:9;font:12px system-ui;" +
        "color:#9aa4b2;background:rgba(20,22,28,.72);border:1px solid #2a3444;" +
        "border-radius:8px;padding:4px 9px;cursor:pointer;opacity:.35;transition:.2s}" +
        "#x:hover{opacity:1}</style></head><body>" +
        "<div id='x' title='Close and go to Google'>&#10005; exit</div>" +
        "<iframe id='g' allow='autoplay; fullscreen; gamepad; clipboard-write; microphone; camera'" +
        " allowfullscreen sandbox='allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals allow-presentation'></iframe>" +
        "</body></html>"
      );
      doc.close();

      // Point the iframe AFTER writing the shell so the parent document that
      // committed is about:blank, not the game URL.
      var f = doc.getElementById("g");
      if (f) f.src = full;

      // Panic exit: closing/redirecting the blank tab to a safe site.
      var x = doc.getElementById("x");
      if (x) {
        x.addEventListener("click", function () {
          try { win.location.replace("https://www.google.com"); }
          catch (e) { try { win.close(); } catch (e2) {} }
        });
      }
      // Esc inside the blank tab bails to Google too.
      doc.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") {
          try { win.location.replace("https://www.google.com"); } catch (e) {}
        }
      });
    } catch (e) {
      // If we somehow can't write into the child (rare), fall back to a plain
      // navigation so the game still opens.
      try { win.location.href = full; } catch (e2) {}
    }
    return win;
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  window.Cloak = { supported: supported, open: open, disguises: DISGUISES };
})();
