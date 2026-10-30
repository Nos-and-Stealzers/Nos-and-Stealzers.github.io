'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'games/flash.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

function load(swf) {
  const href = 'https://hub.test/games/flash.html?swf=' + encodeURIComponent(swf);
  let config, requestedScript;
  const stage = {innerHTML: '', appendChild() {}};
  const player = {focus() {}, load(c) { config = c; return Promise.resolve(); }};
  const document = {
    getElementById() { return stage; },
    createElement() { return {}; },
    head: {appendChild(s) { requestedScript = s; }}
  };
  const window = {setTimeout() {}, RufflePlayer: {newest() {return {createPlayer() {return player; }}; }}};
  vm.runInNewContext(script, {window, document, URL, URLSearchParams, location: new URL(href)});
  if (requestedScript) requestedScript.onload();
  return {config, stage};
}

test('SSF2 is a standalone demo, not a loader needing absent DAT archives', () => {
  const bytes = fs.readFileSync(path.join(root, 'games/swf/super-smash-flash-2.swf'));
  const data = bytes.subarray(0, 3).toString() === 'CWS' ? zlib.inflateSync(bytes.subarray(8)) : bytes.subarray(8);
  assert.equal(/\bDAT\d+\.ssf\b/.test(data.toString('latin1')), false,
    'The beta SWF cannot play without its matching external data/ archives');
});

test('protocol-relative remote SWFs never receive same-origin script privileges', () => {
  const {config} = load('//other.test/game.swf');
  assert.equal(config.allowScriptAccess, false);
});

test('external fighter files resolve beside the SWF, not beside flash.html', () => {
  const {config} = load('/games/swf/bleach-vs-naruto.swf');
  assert.equal(config.base, 'https://hub.test/games/swf/');
  assert.equal(new URL('fighter/yihu.swf', config.base).href, 'https://hub.test/games/swf/fighter/yihu.swf');
});

test('remote SWFs keep URL flags and resolve assets on their own origin', () => {
  const url = 'https://archive.test/games/learntofly2.swf?from=chat.kongregate.com';
  const {config} = load(url);
  assert.equal(config.url, url);
  assert.equal(config.base, 'https://archive.test/games/');
  assert.equal(config.allowScriptAccess, false);
  assert.equal(load('swf/game.swf').config.base, 'https://hub.test/games/swf/');
  assert.equal(load('swf/game.swf').config.allowScriptAccess, true);
});

test('non-http SWF schemes do not start a player', () => {
  for (const url of ['javascript:alert(1)', 'data:application/x-shockwave-flash,abc', 'file:///x.swf']) {
    assert.equal(load(url).config, undefined);
  }
});

test('Bleach vs Naruto has every referenced fighter, assist and music dependency', () => {
  const dir = path.join(root, 'games/swf');
  const swf = fs.readFileSync(path.join(dir, 'bleach-vs-naruto.swf'));
  const bytes = zlib.inflateSync(swf.subarray(8));
  const names = [...new Set(bytes.toString('latin1').match(/[A-Za-z0-9_-]+\.(?:swf|mp3)\b/g))];
  assert.ok(names.length >= 50, 'parse enough of the game to exercise the asset manifest');
  for (const name of names) {
    // These two are embedded sound linkage names, not external loadSound URLs.
    if (/^keysound[12]\.mp3$/.test(name)) continue;
    const candidates = ['fighter', 'fighter/fz', 'music'].map(folder => path.join(dir, folder, name));
    const found = candidates.find(file => fs.existsSync(file));
    assert.ok(found, 'Missing Bleach vs Naruto dependency: ' + name);
    const data = fs.readFileSync(found);
    if (name.endsWith('.swf')) {
      assert.match(data.subarray(0, 3).toString(), /^(?:FWS|CWS)$/);
      const body = data.subarray(0, 3).toString() === 'CWS' ? zlib.inflateSync(data.subarray(8)) : data.subarray(8);
      assert.equal(body.length + 8, data.readUInt32LE(4), 'Truncated SWF: ' + name);
    }
  }
});

test('catalog JSON and browser mirror agree, including the honest SSF2 demo label', () => {
  const games = JSON.parse(fs.readFileSync(path.join(root, 'data/games.json'), 'utf8'));
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'data/games.js'), 'utf8'), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.GAME_CATALOG)), games);
  const ssf = games.find(g => g.id === 'flash-super-smash-flash-2');
  assert.match(ssf.title, /Demo v0\.4a/);
  assert.match(ssf.notice, /not the full beta/);
});
