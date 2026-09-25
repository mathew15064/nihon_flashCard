'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let server;
before(async () => { server = await startServer(); });
after(() => server && server.stop());

const post = (path, body) =>
  fetch(`${server.baseURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

test('GET /api/users returns array', async () => {
  const r = await fetch(`${server.baseURL}/api/users`);
  const body = await r.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
});

test('POST /api/users creates user', async () => {
  const username = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const r = await post('/api/users', { username, displayName: 'Test A' });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.data.username, username);
  assert.equal(body.data.status, 'active');
});

test('POST /api/users duplicate → 409 USERNAME_TAKEN', async () => {
  const username = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await post('/api/users', { username });
  const r = await post('/api/users', { username });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error.code, 'USERNAME_TAKEN');
});

test('GET /api/users/user_999 → 404 USER_NOT_FOUND', async () => {
  const r = await fetch(`${server.baseURL}/api/users/user_999`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, 'USER_NOT_FOUND');
});
