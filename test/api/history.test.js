'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let server;
let userId;

before(async () => {
  server = await startServer();
  const r = await fetch(`${server.baseURL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `hist_${Date.now()}` })
  });
  userId = (await r.json()).data.id;

  // Create a few history events
  for (const result of ['correct', 'wrong', 'correct']) {
    await fetch(`${server.baseURL}/api/learning/${userId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: 'hiragana', contentId: 'hiragana_004', result
      })
    });
  }
});
after(() => server && server.stop());

async function get(path) {
  const r = await fetch(`${server.baseURL}${path}`);
  return { status: r.status, body: await r.json() };
}

test('history: months list', async () => {
  const { body } = await get(`/api/history/${userId}/months`);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length >= 1);
});

test('history: current month events', async () => {
  const { body } = await get(`/api/history/${userId}`);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length >= 3);
});

test('history: filter by result=wrong', async () => {
  const { body } = await get(`/api/history/${userId}?result=wrong`);
  for (const e of body.data) assert.equal(e.result, 'wrong');
});

test('history: unknown user → 404', async () => {
  const { status, body } = await get(`/api/history/user_999`);
  assert.equal(status, 404);
  assert.equal(body.error.code, 'USER_NOT_FOUND');
});
