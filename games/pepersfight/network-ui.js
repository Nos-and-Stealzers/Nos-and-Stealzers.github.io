(() => {
  'use strict';
  const build = '2.1.0';
  const servers = ['s1', 's2', 's3', 's4'].map(s => 'https://' + s + '.pepers.online/status');
  const lines = [];
  const panel = document.createElement('details');
  panel.id = 'network-panel';
  panel.innerHTML = '<summary>Connection & help</summary><strong>Pepersfight ' + build + '</strong><p id="pf-health">Checking game servers…</p><p id="pf-session">Not connected to a match</p><div class="network-actions"><button id="pf-test">Test connection</button><button id="pf-copy">Copy report</button><button id="pf-invite">Copy public lobby link</button></div><p class="network-note">Play Online puts friends on the same server automatically. Every match has a 120-second playable warmup; bots join with 30 seconds left. Press Esc in a match for the menu.</p><pre id="remote-probe" hidden></pre>';
  document.body.appendChild(panel);
  const health = panel.querySelector('#pf-health');
  const session = panel.querySelector('#pf-session');
  const log = text => {
    lines.push(new Date().toISOString() + ' ' + text);
    if (lines.length > 100) lines.shift();
    panel.querySelector('#remote-probe').textContent = lines.join('\n');
  };
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      const text = args.map(String).join(' ');
      if (text.includes('[Pepers]') || /out of bounds|Exception|queue is full|WebSocket/i.test(text)) log(level + ': ' + text);
      if (text.includes('[Pepers] Client connected')) { session.textContent = 'Joined the game server'; session.dataset.state = 'ok'; }
      if (text.includes('[Pepers] Client connecting')) { session.textContent = 'Joining game session…'; session.dataset.state = 'pending'; }
      if (/\[Pepers\].*(Join failed|Disconnected from server|Transport failure)/.test(text)) { session.textContent = text.replace(/^.*\[Pepers\]\s*/, ''); session.dataset.state = 'error'; panel.open = true; }
    };
  }
  window.addEventListener('error', e => { log('JS error: ' + e.message); });
  window.addEventListener('unhandledrejection', e => { log('Unhandled: ' + String(e.reason)); });
  const NativeSocket = window.WebSocket;
  window.WebSocket = class extends NativeSocket {
    constructor(url, ...args) {
      super(url, ...args);
      const safe = new URL(url, location.href);
      const n = servers.findIndex(s => new URL(s).host === safe.host);
      const target = n >= 0 ? 'game server #' + (n + 1) : 'game server';
      log('Socket connecting to ' + target);
      this.addEventListener('open', () => log('Socket opened ' + target));
      this.addEventListener('error', () => log('Socket failed ' + target));
      this.addEventListener('close', e => log('Socket closed ' + target + ' code=' + e.code + ' clean=' + e.wasClean));
    }
  };
  async function test() {
    health.textContent = 'Checking game servers…';
    const start = performance.now();
    const results = await Promise.all(servers.map(async (url, i) => {
      try {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        log('Server #' + (i + 1) + ' ' + data.phase + ' players=' + data.players + ' bots=' + data.bots + ' build=' + data.build);
        return data.ready ? data : null;
      } catch (error) { log('Server #' + (i + 1) + ' status failed: ' + error.message); return null; }
    }));
    const ms = Math.round(performance.now() - start);
    const up = results.filter(Boolean);
    const players = up.reduce((n, d) => n + d.players, 0);
    if (!up.length) {
      health.textContent = 'Game servers unreachable from this browser. Check your connection; a network filter may block them.';
      health.dataset.state = 'error';
    } else {
      health.textContent = up.length + '/' + servers.length + ' servers online · ' + players + ' playing · ' + ms + ' ms';
      health.dataset.state = up.every(d => d.build === build) ? 'ok' : 'error';
      if (up.some(d => d.build !== build)) health.textContent += ' · New version available: reload this page';
    }
  }
  panel.querySelector('#pf-test').onclick = test;
  async function copy(button, value) {
    const label = button.textContent;
    try { await navigator.clipboard.writeText(value); button.textContent = 'Copied'; }
    catch { button.textContent = 'Clipboard blocked'; panel.open = true; const report = panel.querySelector('pre'); report.hidden = false; report.textContent = value; }
    setTimeout(() => { button.textContent = label; }, 2000);
  }
  panel.querySelector('#pf-copy').onclick = e => copy(e.target, ['Pepersfight ' + build, 'Page: ' + location.origin + location.pathname, 'Browser: ' + navigator.userAgent, 'Online: ' + navigator.onLine, health.textContent, session.textContent, ...lines].join('\n'));
  panel.querySelector('#pf-invite').onclick = e => { const url = new URL(location.href); url.search = '?autojoin=1'; url.hash = ''; copy(e.target, url.href); };
  window.pfNetwork = { build, lines, test };
  log('Client build ' + build + ' origin=' + location.origin);
  test();
})();
