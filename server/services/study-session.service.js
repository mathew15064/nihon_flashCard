'use strict';

/*
 * Study-session service.
 *
 * A CONTENT LESSON (vocabulary lesson N) is separated from LEARNING SESSIONS:
 * sessions are DERIVED deterministically from existing content order (id) and
 * chunked by DEFAULT_SESSION_SIZE. Sessions own NO progress — progress stays
 * per card in the existing progress.json. Review scheduling is unaffected.
 */

const contentRepository = require('../repositories/content.repository');
const progressRepository = require('../repositories/progress.repository');
const learningService = require('./learning.service');
const { assertType } = require('./content.service');
const { chunkItems, totalSessions, DEFAULT_SESSION_SIZE } = require('../utils/session-chunker');

function fail(status, code, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  throw err;
}

function lessonItems(contentType, lesson) {
  assertType(contentType);
  const items = contentRepository
    .getAll(contentType)
    .filter((i) => String(i.lesson) === String(lesson))
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

  if (!items.length) {
    fail(404, 'LESSON_NOT_FOUND', `No ${contentType} found for lesson ${lesson}`);
  }
  return items;
}

function sessionProgress(progress, contentIds) {
  // Derived: a card counts once it has any learning state beyond 'new'.
  let completed = 0;
  for (const id of contentIds) {
    const card = progress.cards[id];
    if (card && card.status && card.status !== 'new') completed += 1;
  }
  return completed;
}

function getLessonSessions(userId, contentType, lesson) {
  learningService.getSummary(userId); // validates user existence via existing service
  assertType(contentType);
  if (!String(lesson).trim()) fail(400, 'VALIDATION_ERROR', 'Query parameter "lesson" is required');

  const items = lessonItems(contentType, lesson);
  const chunks = chunkItems(items);

  let progressCards = { cards: {} };
  try {
    progressCards = progressRepository.getProgress(userId);
  } catch (err) {
    /* new user without progress file — all sessions simply at 0 */
  }

  const sessions = chunks.map((chunk, i) => {
    const ids = chunk.map((c) => c.id);
    const completed = sessionProgress({ cards: progressCards.cards || {} }, ids);
    return {
      sessionIndex: i + 1,
      count: ids.length,
      contentIds: ids,
      completed,
      progress: Math.round((completed / ids.length) * 100)
    };
  });

  return {
    contentType,
    lesson: Number(lesson),
    sessionSize: DEFAULT_SESSION_SIZE,
    totalCards: items.length,
    totalSessions: totalSessions(items.length),
    sessions
  };
}

function getSessionCards(userId, contentType, lesson, sessionIndex) {
  const data = getLessonSessions(userId, contentType, lesson);
  const idx = Number(sessionIndex);
  if (!Number.isInteger(idx) || idx < 1 || idx > data.totalSessions) {
    fail(404, 'SESSION_NOT_FOUND', `Session ${sessionIndex} does not exist for lesson ${lesson}`);
  }
  const session = data.sessions[idx - 1];
  const byId = new Map(contentRepository.getAll(contentType).map(i => [i.id, i]));
  const items = session.contentIds.map(id => byId.get(id)).filter(Boolean);
  return { ...session, items };
}

module.exports = { getLessonSessions, getSessionCards };
