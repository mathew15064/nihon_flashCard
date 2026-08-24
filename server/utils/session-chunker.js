'use strict';

const { DEFAULT_SESSION_SIZE } = require('../constants/study-session');

/*
 * Deterministic study-session chunking.
 * Items MUST already be in a stable order (e.g. sorted by id) before
 * chunking — session membership is derived, never stored or randomized.
 */

function chunkItems(items, size = DEFAULT_SESSION_SIZE) {
  const sessionSize = Math.max(1, Number(size) || DEFAULT_SESSION_SIZE);
  const chunks = [];
  for (let i = 0; i < items.length; i += sessionSize) {
    chunks.push(items.slice(i, i + sessionSize));
  }
  return chunks; // remainder is kept as a smaller final session
}

function totalSessions(itemCount, size = DEFAULT_SESSION_SIZE) {
  const sessionSize = Math.max(1, Number(size) || DEFAULT_SESSION_SIZE);
  return Math.ceil(itemCount / sessionSize);
}

module.exports = { chunkItems, totalSessions, DEFAULT_SESSION_SIZE };
