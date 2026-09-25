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
    body: JSON.stringify({ username: `quiz_${Date.now()}` })
  });
  userId = (await r.json()).data.id;
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

test('quiz: create session returns questions with options', async () => {
  const { status, body } = await post('/api/quiz/sessions', {
    userId, contentType: 'hiragana', questionType: 'random', count: 5
  });
  assert.equal(status, 201);
  assert.ok(body.data.sessionId);
  assert.equal(body.data.questions.length, 5);
  assert.ok(body.data.questions[0].options.length >= 3);
  assert.ok(!body.data.questions[0]._correctOptionId);
});

test('quiz: answer, then result requires completion', async () => {
  const created = await post('/api/quiz/sessions', {
    userId, contentType: 'hiragana', questionType: 'random', count: 5
  });
  const session = created.body.data;

  // Answer only first question, result should fail
  await post(
    `/api/quiz/sessions/${session.sessionId}/answers?userId=${userId}`,
    { questionId: session.questions[0].questionId, optionId: 'A' }
  );
  const early = await fetch(
    `${server.baseURL}/api/quiz/sessions/${session.sessionId}/result?userId=${userId}`
  );
  assert.equal(early.status, 409);

  // Answer remaining
  for (const q of session.questions.slice(1)) {
    await post(
      `/api/quiz/sessions/${session.sessionId}/answers?userId=${userId}`,
      { questionId: q.questionId, optionId: 'A' }
    );
  }
  const done = await fetch(
    `${server.baseURL}/api/quiz/sessions/${session.sessionId}/result?userId=${userId}`
  );
  const body = await done.json();
  assert.equal(body.data.total, 5);
  assert.equal(typeof body.data.score, 'number');
});

test('quiz: invalid content type → 400', async () => {
  const { status, body } = await post('/api/quiz/sessions', {
    userId, contentType: 'bogus', questionType: 'random', count: 5
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'INVALID_CONTENT_TYPE');
});

test('quiz: invalid count → 400', async () => {
  const { status, body } = await post('/api/quiz/sessions', {
    userId, contentType: 'hiragana', questionType: 'random', count: 7
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});
