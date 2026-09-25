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
    body: JSON.stringify({ username: `stats_${Date.now()}` })
  });
  userId = (await r.json()).data.id;
  await fetch(`${server.baseURL}/api/learning/${userId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: 'hiragana', contentId: 'hiragana_005', result: 'correct'
    })
  });
});
after(() => server && server.stop());

test('statistics: dashboard has totals + byContentType + byLesson', async () => {
  const r = await fetch(`${server.baseURL}/api/statistics/${userId}`);
  const body = await r.json();
  assert.ok(body.data.totals);
  assert.equal(typeof body.data.totals.learned, 'number');
  assert.equal(typeof body.data.totals.streakDays, 'number');
  assert.ok(body.data.byContentType.hiragana);
  assert.equal(body.data.byContentType.hiragana.total, 104);
  assert.ok(body.data.byLesson);
});

test('statistics: unknown user → 404', async () => {
  const r = await fetch(`${server.baseURL}/api/statistics/user_999`);
  assert.equal(r.status, 404);
});
