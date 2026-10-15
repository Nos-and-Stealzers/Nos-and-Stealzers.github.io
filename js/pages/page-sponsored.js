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
      var hosts = ['s1', 's2', 's3', 's4'];
      var results = await Promise.all(hosts.map(function (h) {
        return fetch('https://' + h + '.pepers.online/status', { cache: 'no-store', signal: controller.signal })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; });
      }));
      var up = results.filter(function (s) { return s && s.ready && Number.isFinite(s.players); });
      if (!up.length) throw new Error('No servers');
      var players = up.reduce(function (n, s) { return n + s.players; }, 0);
      dot.className = 'sp-dot on';
      label.textContent = up.length + '/' + hosts.length + ' servers online · ' + players + ' playing';
      label.title = 'Game build ' + up[0].build + '. Every match has a 120-second warmup; bots join with 30 seconds left.';
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
