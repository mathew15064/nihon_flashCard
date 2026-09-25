'use strict';

const { getDb } = require('../db/connection');

function rowToEvent(r) {
  return {
    cardId: r.card_id,
    contentType: r.content_type,
    reviewedAt: r.reviewed_at,
    result: r.result
  };
}

function appendEvent(userId, event) {
  getDb().prepare(
    'INSERT INTO history (user_id, card_id, content_type, reviewed_at, result) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, event.cardId, event.contentType, event.reviewedAt, event.result);
  return event;
}

function getMonthEvents(userId, monthKey) {
  return getDb()
    .prepare("SELECT * FROM history WHERE user_id = ? AND substr(reviewed_at, 1, 7) = ? ORDER BY reviewed_at")
    .all(userId, monthKey)
    .map(rowToEvent);
}

function listMonths(userId) {
  return getDb()
    .prepare("SELECT DISTINCT substr(reviewed_at, 1, 7) AS m FROM history WHERE user_id = ? ORDER BY m DESC")
    .all(userId)
    .map((r) => r.m);
}

function hasAnyHistory(userId) {
  const r = getDb().prepare('SELECT 1 FROM history WHERE user_id = ? LIMIT 1').get(userId);
  return Boolean(r);
}

module.exports = { appendEvent, getMonthEvents, listMonths, hasAnyHistory };
