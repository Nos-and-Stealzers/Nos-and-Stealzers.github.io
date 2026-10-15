(() => {
  'use strict';
  const build = '2.0.2';
  const lines = [];
  const panel = document.createElement('details');
  panel.id = 'network-panel';
  panel.innerHTML = '<summary>Connection & help</summary><strong>Pepersfight ' + build + '</strong><p id="pf-health">Checking public server…</p><p id="pf-session">Not connected to a match</p><div class="network-actions"><button id="pf-test">Test connection</button><button id="pf-copy">Copy report</button><button id="pf-invite">Copy public lobby link</button></div><p class="network-note">Friends on different networks: use Play Online on both devices. LAN addresses such as 192.168.x.x are not public servers. Browser joins need WSS.</p><p class="network-note">Appearance: Settings → Appearance. New abilities: see the in-game ability bar.</p><pre id="remote-probe" hidden></pre>';
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
      const target = safe.protocol + '//' + safe.host + safe.pathname;
      log('Socket connecting ' + target);
      this.addEventListener('open', () => log('Socket opened ' + target));
      this.addEventListener('error', () => log('Socket failed ' + target));
      this.addEventListener('close', e => log('Socket closed ' + target + ' code=' + e.code + ' clean=' + e.wasClean));
    }
  };
  async function test() {
    health.textContent = 'Checking public server…';
    const start = performance.now();
    try {
      const response = await fetch('https://pepersfight.stealzerslab.fun/status', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Status HTTP ' + response.status);
      const data = await response.json();
      if (!data.ready) throw new Error('Server is starting');
      const ms = Math.round(performance.now() - start);
      health.textContent = data.name + ': ' + data.players + '/' + data.max + ' players · ' + data.phase + ' · status ' + ms + ' ms';
      health.dataset.state = data.build === build ? 'ok' : 'error';
      if (data.build !== build) health.textContent += ' · New build available: reload this page';
      log('Health ' + JSON.stringify(data) + ' HTTP duration=' + ms + 'ms');
    } catch (error) {
      health.textContent = 'Server status unreachable from this browser. Check the report; a network filter may block the hostname.';
      health.dataset.state = 'error';
      log('Health failed: ' + error.message);
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
