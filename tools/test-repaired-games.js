'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'games/repaired/stick-fighter-main.js'), 'utf8');
const start = src.indexOf('async CreateWorker(');
const end = src.indexOf('_GetWindowInnerWidth()', start);
const method = src.slice(start, end);

test('Construct fetches the correct dispatch and job worker under scripts/', async () => {
  const requested = [];
  const env = {
    URL: class extends URL {static createObjectURL() {return 'blob:test';}},
    location: {origin: 'https://hub.test'},
    fetch: async url => {requested.push(String(url)); return {ok: true, blob: async () => new Blob(['// real worker body is served remotely'])};},
    Worker: class {constructor(url) {this.url = url;}}
  };
  const klass = vm.runInNewContext('(class {' + method + '})', env);
  const obj = new klass(); obj._exportType = 'html5';
  const base = 'https://rawcdn.githack.com/cooldude2349/everything/c971830969590ba871cdc88e79d6c9d181ffc74b/stickfight/scripts/';
  await obj.CreateWorker('dispatchworker.js', base, {});
  await obj.CreateWorker('jobworker.js', base, {});
  assert.deepEqual(requested, [base + 'dispatchworker.js', base + 'jobworker.js']);
});

test('repaired catalog entries keep ids but use the verified local launchers', () => {
  const games = JSON.parse(fs.readFileSync(path.join(root, 'data/games.json'), 'utf8'));
  const expected = {'nebula-brawlsimulator-3d': 'brawl-simulator-3d.html', 'nebula-genericfightermaybe': 'generic-fighter-maybe.html', 'nebula-stickfighter': 'stick-fighter.html'};
  for (const [id, file] of Object.entries(expected)) {
    const game = games.find(g => g.id === id);
    assert.equal(game.host, 'self');
    assert.equal(game.source, 'games/repaired/' + file);
    assert.equal(game.source, game.direct);
    const html = fs.readFileSync(path.join(root, game.source), 'utf8');
    assert.match(html, /https:\/\/rawcdn\.githack\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/gh\/(?:genizy|cooldude2349)\//);
  }
});

test('a remote base cannot redirect the local Construct bootstrap to GitHack root', () => {
  const html = fs.readFileSync(path.join(root, 'games/repaired/stick-fighter.html'), 'utf8');
  assert.ok(html.includes('import(location.origin + "/games/repaired/stick-fighter-main.js")'));
  assert.match(src, /runtimeBaseUrl:"https:\/\/rawcdn\.githack\.com\//);
  assert.doesNotMatch(html, /register-sw\.js/);
});
