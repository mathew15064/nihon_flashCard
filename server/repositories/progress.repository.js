'use strict';

const { getDb } = require('../db/connection');

function rowToCard(r) {
  if (!r) return null;
  return {
    cardId: r.card_id,
    contentType: r.content_type,
    status: r.status,
    timesReviewed: r.times_reviewed,
    correctCount: r.correct_count,
    wrongCount: r.wrong_count,
    streak: r.streak,
    lastReviewedAt: r.last_reviewed_at,
    nextReviewAt: r.next_review_at
  };
}

function getProgress(userId) {
  const rows = getDb()
    .prepare('SELECT * FROM progress WHERE user_id = ?')
    .all(userId);
  const cards = {};
  for (const r of rows) cards[r.card_id] = rowToCard(r);
  return { userId, updatedAt: new Date().toISOString(), cards };
}

function getCard(progress, cardId) {
  return progress.cards[cardId] || null;
}

function upsertCard(userId, card) {
  getDb().prepare(`
    INSERT INTO progress
      (user_id, card_id, content_type, status, times_reviewed, correct_count, wrong_count, streak, last_reviewed_at, next_review_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, card_id) DO UPDATE SET
      status = excluded.status,
      times_reviewed = excluded.times_reviewed,
      correct_count = excluded.correct_count,
      wrong_count = excluded.wrong_count,
      streak = excluded.streak,
      last_reviewed_at = excluded.last_reviewed_at,
      next_review_at = excluded.next_review_at
  `).run(
    userId,
    card.cardId,
    card.contentType,
    card.status,
    card.timesReviewed,
    card.correctCount,
    card.wrongCount,
    card.streak,
    card.lastReviewedAt || null,
    card.nextReviewAt || null
  );
  return card;
}

module.exports = { getProgress, getCard, upsertCard };
