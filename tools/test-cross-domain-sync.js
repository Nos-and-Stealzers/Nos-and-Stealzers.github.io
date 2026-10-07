'use strict';
/* Offline regression checks; no network or real account writes.
 * Run: node --test tools/test-cross-domain-sync.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
function config(origin) {
  const w = { URL, location: new URL(origin), addEventListener() {} };
  w.window = w;
  vm.createContext(w);
  vm.runInContext(source('js/core/config.js'), w);
  return w;
}
const domains = Array.from(config('https://www.arcadecampushub.online').SITE.domains);
const mirrors = domains.filter(d => !new URL(d).hostname.endsWith('.vercel.app'));

function bridge(file) {
  let listener;
  const replies = [];
  const parent = { postMessage(data, origin) { replies.push({ data, origin }); } };
  const w = { parent, location: new URL('https://play.arcadecampushub.online'),
    navigator: { cookieEnabled: true }, indexedDB: undefined, document: { cookie: '' },
    localStorage: { length: 0, key() { return null; } },
    addEventListener(name, fn) { if (name === 'message') listener = fn; } };
  w.window = w;
  vm.runInNewContext(source(file).match(/<script>([\s\S]*?)<\/script>/)[1], w);
  return async (origin, foreign = false) => {
    replies.length = 0;
    listener({ origin, source: foreign ? {} : parent,
      data: { channel: 'ach-save-bridge', action: 'ping', id: 1 } });
    await new Promise(resolve => setImmediate(resolve));
    return replies;
  };
}

test('both deployed and template save bridges answer every configured hub origin', async () => {
  for (const file of ['save-bridge.html', 'tools/save-bridge.html']) {
    const send = bridge(file);
    for (const origin of domains) {
      const replies = await send(origin);
      assert.equal(replies.length, 1, file + ': ' + origin);
      assert.equal(replies[0].origin, origin);
      assert.equal(replies[0].data.ok, true);
    }
    for (const origin of ['https://evil.example', 'https://geniussis.space.evil.example',
      'http://geniussis.space', 'https://preview.geniussis.space']) {
      assert.equal((await send(origin)).length, 0, file + ': ' + origin);
    }
    assert.equal((await send('https://geniussis.space', true)).length, 0, 'foreign source');
  }
});

test('only exact configured hub origins with custom-domain play hosts activate the proxy', () => {
  for (const origin of mirrors) {
    const w = config(origin);
    assert.equal(w.SITE.gameProxy.active, true, origin);
    assert.equal(w.SITE.gameHosts['games-huge'],
      'https://play.' + w.location.hostname.replace(/^www\./, '') + '/games-huge', origin);
  }
  for (const origin of ['https://websitegames-topaz.vercel.app',
    'https://preview.arcadecampushub.online', 'https://play.arcadecampushub.online',
    'https://play.play.arcadecampushub.online', 'https://www.www.securly.site',
    'https://arcadecampushub.online.evil.example', 'http://arcadecampushub.online',
    'https://arcadecampushub.online:8443', 'http://localhost:8787']) {
    const w = config(origin);
    assert.equal(w.SITE.gameProxy.active, false, origin);
    assert.equal(w.SITE.gameHosts['games-huge'], 'https://arcadecampushub.github.io/games-huge', origin);
    assert.equal(Object.keys(w.SITE.gameProxy.direct).length, 0, origin);
  }
});

test('self-hosted and proxied progress use canonical cloud rows on every domain', () => {
  for (const origin of domains) {
    const w = config(origin);
    vm.runInContext(source('js/features/game-saves.js'), w);
    assert.equal(w.GameSaves.hostKey(w.SITE.gameHosts.self), 'www.arcadecampushub.online', origin);
    assert.equal(w.GameSaves.hostKey(w.SITE.gameHosts['games-huge']), 'arcadecampushub.github.io', origin);
    const hosts = Array.from(w.GameSaves.hosts());
    assert.equal(hosts.filter(base => new URL(base).host === new URL(w.SITE.gameHosts['games-huge']).host).length, 1);
  }
});

test('SSO authorizes every configured origin as both source and target', async () => {
  const handler = require('../api/sso.js');
  const savedFetch = global.fetch;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-test-service-key';
  global.fetch = async url => ({ ok: true, json: async () =>
    url.endsWith('/auth/v1/user') ? { id: 'offline-user', email: 'test@example.invalid' } :
    url.includes('/rest/v1/profiles') ? [{ banned: false }] : { hashed_token: 'offline-code' } });
  try {
    for (const origin of domains) {
      for (const [from, target] of [[origin, domains[0]], [domains[0], origin]]) {
        let body;
        const res = { setHeader() {}, end(text) { body = JSON.parse(text); } };
        await handler({ method: 'POST', headers: { origin: from },
          body: { token: 'offline-test-token', target } }, res);
        assert.equal(res.statusCode, 200, from + ' -> ' + target);
        assert.equal(body.code, 'offline-code');
      }
    }
  } finally {
    global.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});

function device(origin, cloud) {
  const w = config(origin), events = {}, disk = new Map(), timers = new Map();
  let seq = 0;
  w.addEventListener = (name, fn) => (events[name] ||= []).push(fn);
  w.dispatchEvent = e => (events[e.type] || []).forEach(fn => fn(e));
  w.CustomEvent = function(type, options) { this.type = type; this.detail = options.detail; };
  w.document = { readyState: 'complete', addEventListener: w.addEventListener,
    dispatchEvent: w.dispatchEvent, documentElement: { setAttribute() {} } };
  w.localStorage = { getItem: key => disk.get(key) ?? null,
    setItem: (key, value) => disk.set(key, String(value)), removeItem: key => disk.delete(key) };
  w.setTimeout = (fn, delay) => { timers.set(++seq, { fn, delay }); return seq; };
  w.clearTimeout = id => timers.delete(id);
  w.setInterval = () => {};
  w.API = { available: async () => true, me: async () => ({ user: { id: 'same-account' } }),
    unread: async () => ({}), putSave: async save => ({ save }),
    getPrefs: async () => structuredClone(cloud.prefs),
    putPrefs: async prefs => { cloud.prefs = structuredClone(prefs); } };
  for (const file of ['js/core/store.js', 'js/core/session.js']) vm.runInContext(source(file), w);
  return { w, async flushPrefs() {
    for (const [id, timer] of Array.from(timers)) if (timer.delay === 1500) {
      timers.delete(id); await timer.fn();
    }
  } };
}

test('display preferences follow the same account between isolated mirror storage buckets', async () => {
  const cloud = { prefs: null };
  const a = device('https://www.arcadecampushub.online', cloud);
  await a.w.Session.ready;
  await a.w.Session.pullPrefs();
  a.w.Store.setSetting('skin', 'grape');
  a.w.Store.setSetting('textSize', 'huge');
  await a.flushPrefs();
  assert.equal(cloud.prefs.settings.skin, 'grape');
  const b = device('https://www.geniussis.space', cloud);
  await b.w.Session.ready;
  await b.w.Session.pullPrefs();
  assert.equal(b.w.Store.settings().skin, 'grape');
  assert.equal(b.w.Store.settings().textSize, 'huge');
  // Advance the local edit clock deterministically past the downloaded prefs.
  vm.runInContext('Date = class extends Date { static now() { return ' + (cloud.prefs.at + 1) + '; } };', b.w);
  b.w.Store.setSetting('skin', 'paper');
  await b.flushPrefs();
  await a.w.Session.pullPrefs();
  assert.equal(a.w.Store.settings().skin, 'paper');
  assert.equal(a.w.Store.settings().textSize, 'huge');
});

test('proxy play hosts are all explicitly routed in the local Vercel configuration', () => {
  const routes = JSON.parse(source('vercel.json')).rewrites;
  for (const origin of mirrors) {
    const host = new URL(config(origin).SITE.gameProxy.to).hostname;
    assert.ok(routes.some(r => (r.has || []).some(h => h.type === 'host' && h.value === host)), host);
  }
});
