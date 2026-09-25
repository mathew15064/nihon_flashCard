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
    body: JSON.stringify({ username: `lrn_${Date.now()}` })
  });
  const body = await r.json();
  userId = body.data.id;
});
after(() => server && server.stop());

async function post(path, body) {
  const r = await fetch(`${server.baseURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json() };
}

async function get(path) {
  const r = await fetch(`${server.baseURL}${path}`);
  return { status: r.status, body: await r.json() };
}

test('learning: summary starts empty', async () => {
  const { body } = await get(`/api/learning/${userId}`);
  assert.equal(body.data.totalTracked, 0);
});

test('learning: record correct answer creates progress', async () => {
  const r = await post(`/api/learning/${userId}/review`, {
    contentType: 'hiragana',
    contentId: 'hiragana_001',
    result: 'correct'
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.timesReviewed, 1);
  assert.equal(r.body.data.correctCount, 1);
  assert.equal(r.body.data.streak, 1);
  assert.ok(r.body.data.nextReviewAt);
});

test('learning: wrong answer resets streak', async () => {
  await post(`/api/learning/${userId}/review`, {
    contentType: 'hiragana', contentId: 'hiragana_002', result: 'correct'
  });
  const r = await post(`/api/learning/${userId}/review`, {
    contentType: 'hiragana', contentId: 'hiragana_002', result: 'wrong'
  });
  assert.equal(r.body.data.streak, 0);
  assert.equal(r.body.data.wrongCount, 1);
});

test('learning: progress list', async () => {
  const { body } = await get(`/api/learning/${userId}/progress`);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length >= 2);
});

test('learning: review queue returns cards', async () => {
  const { body } = await get(`/api/learning/${userId}/review?count=5`);
  assert.ok(Array.isArray(body.data));
});

test('learning: invalid content type → 400', async () => {
  const r = await post(`/api/learning/${userId}/review`, {
    contentType: 'bogus', contentId: 'x', result: 'correct'
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_CONTENT_TYPE');
});

test('learning: invalid result → 400', async () => {
  const r = await post(`/api/learning/${userId}/review`, {
    contentType: 'hiragana', contentId: 'hiragana_003', result: 'maybe'
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'VALIDATION_ERROR');
});
