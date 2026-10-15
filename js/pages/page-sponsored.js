/* Live status from the game process rather than a WebSocket upgrade. */
(function () {
  'use strict';
  var dot = document.getElementById('sp-dot');
  var label = document.getElementById('sp-server');
  if (!dot || !label) return;
  var pending = false;
  async function refresh() {
    if (pending || document.hidden) return;
    pending = true;
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var response = await fetch('https://pepersfight.stealzerslab.fun/status', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var server = await response.json();
      if (!server.ready || !Number.isFinite(server.players) || !Number.isFinite(server.max)) throw new Error('Server starting');
      dot.className = 'sp-dot on';
      label.textContent = 'online · ' + server.players + '/' + server.max + ' players · ' + server.phase;
      label.title = 'Game server build ' + server.build + '. Joining is verified by the game, not this status request.';
    } catch (e) {
      dot.className = 'sp-dot off';
      label.textContent = 'status unavailable';
      label.title = 'The server could be offline or this network may block its hostname.';
    } finally {
      clearTimeout(timeout);
      pending = false;
    }
  }
  refresh();
  setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();
