const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
test('home offers a labeled native game search before discovery sections', () => {
  assert.match(html, /<form[^>]+role="search"[^>]+action="browse.html"/);
  assert.match(html, /<label[^>]+for="home-search"/);
  assert.match(html, /id="home-search"[^>]+name="q"/);
  assert.ok(html.indexOf('id="home-search"') < html.indexOf('id="marquee"'));
});
