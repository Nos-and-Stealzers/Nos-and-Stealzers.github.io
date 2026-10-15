/* Sponsored: live status of the Pepersfight official server.
   The game server speaks WebSockets behind a Cloudflare Tunnel, so a socket that
   opens means the server is up. It is closed right away and never sends data. */
(function () {
  "use strict";

  var SERVER = "wss://pepersfight.stealzerslab.fun/";
  var dot = document.getElementById("sp-dot");
  var label = document.getElementById("sp-server");
  if (!dot || !label) return;

  function show(online) {
    dot.className = "sp-dot " + (online ? "on" : "off");
    label.textContent = online ? "online" : "offline";
  }

  try {
    var done = false;
    var ws = new WebSocket(SERVER);
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      try { ws.close(); } catch (e) { /* ignore */ }
      show(false);
    }, 6000);
    ws.onopen = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      show(true);
      try { ws.close(1000); } catch (e) { /* ignore */ }
    };
    ws.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      show(false);
    };
  } catch (e) {
    show(false);
  }
})();
