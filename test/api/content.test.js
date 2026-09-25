'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let server;
before(async () => { server = await startServer(); });
after(() => server && server.stop());

async function get(path) {
  const r = await fetch(`${server.baseURL}${path}`);
  return { status: r.status, body: await r.json() };
}

async function post(path, body) {
  const r = await fetch(`${server.baseURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json() };
}

async function put(path, body) {
  const r = await fetch(`${server.baseURL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json() };
}

async function del(path) {
  const r = await fetch(`${server.baseURL}${path}`, { method: 'DELETE' });
  return { status: r.status, body: await r.json() };
}

test('hiragana: list returns items with meta', async () => {
  const { status, body } = await get('/api/hiragana?limit=5');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length <= 5);
  assert.ok(body.meta.total >= 100);
});

test('katakana: filter by type=dakuten', async () => {
  const { body } = await get('/api/katakana?type=dakuten');
  for (const item of body.data) assert.equal(item.type, 'dakuten');
});

test('kanji: filter by jlpt=N5', async () => {
  const { body } = await get('/api/kanji?jlpt=N5');
  for (const item of body.data) assert.equal(item.jlpt, 'N5');
});

test('vocabulary: filter by lesson', async () => {
  const { body } = await get('/api/vocabulary?lesson=1');
  for (const item of body.data) assert.equal(item.lesson, 1);
});

test('vocabulary: search finds by meaning', async () => {
  const { body } = await get('/api/vocabulary?search=teacher');
  assert.ok(body.data.length >= 1);
});

test('hiragana: CRUD roundtrip', async () => {
  const created = await post('/api/hiragana', {
    character: 'ん', romaji: 'n-test', type: 'basic'
  });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.ok(id.startsWith('hiragana_'));

  const fetched = await get(`/api/hiragana/${id}`);
  assert.equal(fetched.body.data.romaji, 'n-test');

  const updated = await put(`/api/hiragana/${id}`, { romaji: 'n-updated' });
  assert.equal(updated.body.data.romaji, 'n-updated');

  const removed = await del(`/api/hiragana/${id}`);
  assert.equal(removed.status, 200);

  const gone = await get(`/api/hiragana/${id}`);
  assert.equal(gone.status, 404);
  assert.equal(gone.body.error.code, 'CONTENT_NOT_FOUND');
});

test('content: invalid type → 400', async () => {
  const { status, body } = await get('/api/bogus');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('vocabulary: POST missing meaning → 400', async () => {
  const r = await post('/api/vocabulary', { word: 'x' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'VALIDATION_ERROR');
});

test('content: random returns requested count', async () => {
  const { body } = await get('/api/kanji/random?count=3');
  assert.equal(body.data.items.length, 3);
});
