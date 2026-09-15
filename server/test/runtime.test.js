"use strict";
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-runtime-'));
process.env.ARCADE_DB = path.join(dir, 'test.db');
const app = require('../app');
(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const response = await fetch(base + '/js/core/config.js');
    assert.equal(response.status, 200);
    const context = {window: {}};
    vm.runInNewContext(await response.text(), context);
    assert.equal(context.window.SITE.backend, 'node', 'Node-hosted frontend must use its actual working backend');
    assert.equal(context.window.SITE.apiBase, '', 'Node-hosted frontend uses same-origin cookies');
    assert.match(response.headers.get('cache-control'), /no-store/);
    for (const resource of ['/server/app.js', '/server/package.json', '/server/test/runtime.test.js', '/supabase/schema.sql', '/selfhost/README.md', '/workbench-src/package.json', '/tools/test-security.js']) {
      const r = await fetch(base + resource);
      assert.equal(r.status, 404, 'Private implementation must not be publicly served: ' + resource);
    }
    assert.equal((await fetch(base + '/index.html')).status, 200);
    assert.equal((await fetch(base + '/js/core/api.js')).status, 200);
    console.log('PASS runtime config, private-path protection and public site assets');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    require('../db').db.close();
    fs.rmSync(dir, {recursive:true, force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
