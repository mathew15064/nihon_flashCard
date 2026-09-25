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
    body: JSON.stringify({ username: `sess_${Date.now()}` })
  });
  userId = (await r.json()).data.id;
});
after(() => server && server.stop());

async function get(path) {
  const r = await fetch(`${server.baseURL}${path}`);
  return { status: r.status, body: await r.json() };
}

test('sessions: list for vocabulary lesson 1', async () => {
  const { body } = await get(
    `/api/learning/${userId}/sessions?contentType=vocabulary&lesson=1`
  );
  assert.equal(body.data.lesson, 1);
  assert.ok(body.data.totalCards >= 1);
  assert.ok(Array.isArray(body.data.sessions));
  assert.equal(body.data.sessionSize, 10);
});

test('sessions: cards for session 1', async () => {
  const { body } = await get(
    `/api/learning/${userId}/sessions/cards?contentType=vocabulary&lesson=1&session=1`
  );
  assert.ok(Array.isArray(body.data.items));
  assert.equal(body.data.items.length, body.data.contentIds.length);
  assert.ok(body.data.items[0].id);
});

test('sessions: unknown lesson → 404', async () => {
  const { status, body } = await get(
    `/api/learning/${userId}/sessions?contentType=vocabulary&lesson=99`
  );
  assert.equal(status, 404);
  assert.equal(body.error.code, 'LESSON_NOT_FOUND');
});

test('sessions: out-of-range session → 404', async () => {
  const { status, body } = await get(
    `/api/learning/${userId}/sessions/cards?contentType=vocabulary&lesson=1&session=99`
  );
  assert.equal(status, 404);
  assert.equal(body.error.code, 'SESSION_NOT_FOUND');
});
