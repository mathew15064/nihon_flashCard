'use strict';

const userRepository = require('../repositories/user.repository');
const progressRepository = require('../repositories/progress.repository');
const historyRepository = require('../repositories/history.repository');
const contentRepository = require('../repositories/content.repository');
const contentService = require('./content.service');
const { ALL_CONTENT_TYPES } = require('../constants/content-types');
const { LEARNING_STATUS } = require('../constants/learning-status');
const { ALL_REVIEW_RESULTS } = require('../constants/review-result');
const scheduler = require('../utils/review-scheduler');
const { nowIso, isSameUtcDay } = require('../utils/date');

function assertUser(userId) {
  const user = userRepository.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return user;
}

function resolveCardId(contentType, contentId) {
  if (typeof contentId === 'string' && new RegExp(`^${contentType}_\\d+$`).test(contentId)) {
    return contentService.getById(contentType, contentId).id;
  }
  const numeric = Number(contentId);
  if (!Number.isInteger(numeric) || numeric < 1) {
    const err = new Error('contentId must be a positive integer or a stable card id');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }
  const padded = String(numeric).padStart(3, '0');
  return contentService.getById(contentType, `${contentType}_${padded}`).id;
}

function getSummary(userId) {
  assertUser(userId);
  const progress = progressRepository.getProgress(userId);
  const cards = Object.values(progress.cards);
  return {
    totalTracked: cards.length,
    byStatus: cards.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {}),
    dueNow: cards.filter((c) => c.nextReviewAt && c.nextReviewAt <= nowIso()).length
  };
}

function getProgressData(userId) {
  assertUser(userId);
  return progressRepository.getProgress(userId);
}

function recordReview(userId, { contentType, contentId, result }) {
  const user = assertUser(userId);
  if (user.status !== 'active') {
    const err = new Error('User is inactive');
    err.code = 'USER_INACTIVE';
    err.status = 409;
    throw err;
  }
  if (!ALL_CONTENT_TYPES.includes(contentType)) {
    const err = new Error(`contentType must be one of: ${ALL_CONTENT_TYPES.join(', ')}`);
    err.code = 'INVALID_CONTENT_TYPE';
    err.status = 400;
    throw err;
  }
  if (!ALL_REVIEW_RESULTS.includes(result)) {
    const err = new Error(`result must be one of: ${ALL_REVIEW_RESULTS.join(', ')}`);
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  const cardId = resolveCardId(contentType, contentId);
  const now = new Date();

  const progress = progressRepository.getProgress(userId);
  let card =
    progressRepository.getCard(progress, cardId) ||
    {
      cardId,
      contentType,
      status: 'new',
      timesReviewed: 0,
      correctCount: 0,
      wrongCount: 0,
      streak: 0
    };

  card.timesReviewed += 1;
  if (result === 'correct') card.correctCount += 1;
  else card.wrongCount += 1;

  scheduler.schedule(card, result, now);
  card.lastReviewedAt = now.toISOString();

  progressRepository.upsertCard(userId, card);

  historyRepository.appendEvent(userId, {
    cardId,
    contentType,
    reviewedAt: card.lastReviewedAt,
    result
  });

  return publicCard(card);
}

function getReviewQueue(userId, { contentType, count = 10 } = {}) {
  assertUser(userId);
  if (contentType && !ALL_CONTENT_TYPES.includes(contentType)) {
    const err = new Error(`contentType must be one of: ${ALL_CONTENT_TYPES.join(', ')}`);
    err.code = 'INVALID_CONTENT_TYPE';
    err.status = 400;
    throw err;
  }
  const limit = Math.min(Math.max(1, Number(count) || 10), 100);
  const now = nowIso();

  const progress = progressRepository.getProgress(userId);
  const due = Object.values(progress.cards)
    .filter((c) => c.nextReviewAt && c.nextReviewAt <= now)
    .filter((c) => !contentType || c.contentType === contentType)
    .sort((a, b) => (a.nextReviewAt < b.nextReviewAt ? -1 : 1));

  // fill with random NEW cards of the requested type(s)
  const types = contentType ? [contentType] : ALL_CONTENT_TYPES;
  let remaining = limit - due.length;
  const fresh = [];
  for (const type of types) {
    if (remaining <= 0) break;
    const items = contentRepository.getAll(type).filter((i) => !progress.cards[i.id]);
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    for (const item of items.slice(0, remaining)) {
      fresh.push({
        cardId: item.id,
        contentType: type,
        status: LEARNING_STATUS.NEW
      });
    }
    remaining -= Math.min(items.length, remaining);
  }

  return [...due, ...fresh].slice(0, limit).map((card) => {
    const base = card.cardId ? publicCard(card) : card;
    const content = contentRepository.getAll(base.contentType).find((i) => i.id === base.cardId);
    return { ...base, content };
  });
}

function publicCard(card) {
  const { cardId, contentType, status, timesReviewed, correctCount, wrongCount, streak, lastReviewedAt, nextReviewAt } = card;
  return { cardId, contentType, status, timesReviewed, correctCount, wrongCount, streak, lastReviewedAt, nextReviewAt };
}

function getTodayStats(userId) {
  assertUser(userId);
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  let events = [];
  try {
    events = historyRepository.getMonthEvents(userId, monthKey);
  } catch (err) {
    events = [];
  }
  const todayEvents = events.filter((e) => isSameUtcDay(new Date(e.reviewedAt), now));
  return {
    todayReviews: todayEvents.length,
    correct: todayEvents.filter((e) => e.result === 'correct').length,
    wrong: todayEvents.filter((e) => e.result === 'wrong').length
  };
}

module.exports = { getSummary, getProgressData, recordReview, getTodayStats, publicCard, getReviewQueue };
