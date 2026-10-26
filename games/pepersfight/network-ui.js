(() => {
  'use strict';
  // Invisible diagnostics only (no on-screen panel). Read with window.pfNetwork in DevTools.
  const build = '3.7.18';
  const lines = [];
  const state = { session: 'idle', build };
  // NGO lifecycle signals are authoritative; transport opens and console text
  // are not admission. Copy only allowlisted fields (never reasons/identities).
  window.pfSessionLifecycle = signal => {
    try {
      if (!signal || !['pending', 'connected', 'left', 'error', 'disconnected'].includes(signal.state) || typeof signal.build !== 'string' || !/^\d+\.\d+\.\d+$/.test(signal.build)) return;
      state.session = signal.state;
      state.build = signal.build;
    } catch (e) {}
  };
  window.pfSessionLifecycle(window.__pfSessionLifecycle);
  const log = text => {
    lines.push(new Date().toISOString() + ' ' + text);
    if (lines.length > 150) lines.shift();
  };
  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      const text = args.map(String).join(' ');
      if (text.includes('[Pepers]') || /out of bounds|Exception|queue is full/i.test(text)) log(level + ': ' + text);
    };
  }
  window.addEventListener('error', e => log('JS error: ' + e.message));
  window.addEventListener('unhandledrejection', e => log('Unhandled: ' + String(e.reason)));
  window.pfNetwork = { build, lines, state, report: () => ['Pepersfight ' + build, location.origin + location.pathname, navigator.userAgent, 'session=' + state.session, ...lines].join('\n') };
  log('Client build ' + build + ' origin=' + location.origin);
})();
