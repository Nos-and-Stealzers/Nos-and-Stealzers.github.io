(() => {
  'use strict';
  // Invisible diagnostics only (no on-screen panel). Read with window.pfNetwork in DevTools.
  const build = '3.6.1';
  const lines = [];
  const state = { session: 'idle', build };
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
      if (text.includes('[Pepers] Client connected')) state.session = 'ok';
      else if (text.includes('[Pepers] Client connecting')) state.session = 'pending';
      else if (/\[Pepers\].*(Join failed|Disconnected from server|Transport failure)/.test(text)) state.session = 'error';
    };
  }
  window.addEventListener('error', e => log('JS error: ' + e.message));
  window.addEventListener('unhandledrejection', e => log('Unhandled: ' + String(e.reason)));
  window.pfNetwork = { build, lines, state, report: () => ['Pepersfight ' + build, location.origin + location.pathname, navigator.userAgent, 'session=' + state.session, ...lines].join('\n') };
  log('Client build ' + build + ' origin=' + location.origin);
})();
