'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let server;
before(async () => { server = await startServer(); });
after(() => server && server.stop());

test('GET /api/health returns ok', async () => {
  const r = await fetch(`${server.baseURL}/api/health`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
});

test('GET /api/nope → NOT_FOUND envelope', async () => {
  const r = await fetch(`${server.baseURL}/api/nope`);
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'NOT_FOUND');
});
