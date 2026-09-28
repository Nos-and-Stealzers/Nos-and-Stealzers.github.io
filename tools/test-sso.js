'use strict';
/* api/sso.js: who may get a one-time sign-in code, and for where. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const handler = require(path.join(__dirname, '..', 'api', 'sso.js'));
const HUB = 'https://www.arcadecampushub.online';
const MIRROR = 'https://arcadecampushub.space';

/* Fake Supabase: a valid token "good", user u1, optionally banned. */
function supabase(opts) {
  opts = opts || {};
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (url.endsWith('/auth/v1/user')) {
      return init.headers.Authorization === 'Bearer good'
        ? json(200, { id: 'u1', email: 'u1@example.com' })
        : json(401, { msg: 'bad jwt' });
    }
    if (url.includes('/rest/v1/profiles')) return json(200, opts.noProfile ? [] : [{ banned: !!opts.banned }]);
    if (url.endsWith('/auth/v1/admin/generate_link')) return json(200, { hashed_token: 'code_0123456789abcdef' });
    return json(404, {});
  };
  return calls;
}

function run(method, origin, body, env) {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (env === undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  else if (env === null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const req = { method, headers: origin ? { origin } : {}, body: body === undefined ? undefined : JSON.stringify(body) };
  return new Promise((resolve) => {
    const res = {
      statusCode: 0, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(text) { resolve({ status: this.statusCode, body: JSON.parse(text), headers: this.headers }); }
    };
    handler(req, res);
  }).finally(() => {
    if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });
}

test('issues a code for a signed-in user, for one of the hub sites', async () => {
  const calls = supabase();
  const out = await run('POST', HUB, { token: 'good', target: MIRROR });
  assert.equal(out.status, 200);
  assert.equal(out.body.code, 'code_0123456789abcdef');
  assert.equal(out.headers['cache-control'], 'no-store');
  const gen = calls.find(c => c.url.endsWith('/generate_link'));
  assert.deepEqual(JSON.parse(gen.init.body), { type: 'magiclink', email: 'u1@example.com' });
  /* The service key goes to Supabase only, and only on the admin calls. */
  const user = calls.find(c => c.url.endsWith('/auth/v1/user'));
  assert.notEqual(user.init.headers.apikey, 'service-key');
});

test('refuses requests from pages that are not the hub', async () => {
  supabase();
  for (const origin of ['https://evil.example', 'https://arcadecampushub.online.evil.com', '', 'null']) {
    const out = await run('POST', origin, { token: 'good', target: MIRROR });
    assert.equal(out.status, 403, origin);
  }
});

test('never hands a code to a site outside the list', async () => {
  const calls = supabase();
  for (const target of ['https://evil.example', 'https://arcadecampushub.space.evil.com', 'http://arcadecampushub.space',
    'https://arcadecampushub.space/', 'javascript:alert(1)', '']) {
    const out = await run('POST', HUB, { token: 'good', target });
    assert.equal(out.status, 400, target);
  }
  assert.equal(calls.length, 0, 'no upstream calls for a bad target');
});

test('refuses bad or missing sessions', async () => {
  supabase();
  assert.equal((await run('POST', HUB, { token: 'forged', target: MIRROR })).status, 401);
  assert.equal((await run('POST', HUB, { target: MIRROR })).status, 401);
  assert.equal((await run('POST', HUB, 'not json')).status, 401);
});

test('refuses banned or missing accounts', async () => {
  supabase({ banned: true });
  assert.equal((await run('POST', HUB, { token: 'good', target: MIRROR })).status, 403);
  supabase({ noProfile: true });
  assert.equal((await run('POST', HUB, { token: 'good', target: MIRROR })).status, 403);
});

test('GET only says whether it is set up; off until the service key is set', async () => {
  supabase();
  assert.deepEqual((await run('GET', HUB)).body, { ready: true });
  assert.deepEqual((await run('GET', HUB, undefined, null)).body, { ready: false });
  assert.equal((await run('PUT', HUB)).status, 405);
  assert.equal((await run('POST', HUB, { token: 'good', target: MIRROR }, null)).status, 503);
});
