'use strict';

const userRepository = require('../repositories/user.repository');
const progressRepository = require('../repositories/progress.repository');
const contentRepository = require('../repositories/content.repository');
const historyRepository = require('../repositories/history.repository');
const { CONTENT_TYPES, ALL_CONTENT_TYPES } = require('../constants/content-types');
const { LEARNING_STATUS } = require('../constants/learning-status');
const { nowIso, isSameUtcDay, currentMonthKey } = require('../utils/date');

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

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function computeStreakDays(userId) {
  // Consecutive UTC days with at least one review, ending today or yesterday.
  const months = historyRepository.listMonths(userId);

  const days = new Set();
  for (const month of months) {
    try {
      for (const event of historyRepository.getMonthEvents(userId, month)) {
        days.add(dayKey(new Date(event.reviewedAt)));
      }
    } catch (err) {
      /* skip unreadable month */
    }
  }

  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function getDashboard(userId) {
  assertUser(userId);

  const progress = progressRepository.getProgress(userId);
  const cards = Object.values(progress.cards);
  const byId = new Map(cards.map((c) => [c.cardId, c]));

  const byContentType = {};
  let learnedTotal = 0;
  let masteredTotal = 0;

  for (const type of ALL_CONTENT_TYPES) {
    const all = contentRepository.getAll(type).length;
    let newC = all;
    let learning = 0;
    let review = 0;
    let mastered = 0;
    for (const card of cards) {
      if (card.contentType !== type) continue;
      newC -= 1;
      if (card.status === LEARNING_STATUS.LEARNING || card.status === LEARNING_STATUS.NEW) learning += 1;
      else if (card.status === LEARNING_STATUS.REVIEW) review += 1;
      else if (card.status === LEARNING_STATUS.MASTERED) mastered += 1;
    }
    byContentType[type] = { total: all, new: newC, learning, review, mastered };
    learnedTotal += learning + review + mastered;
    masteredTotal += mastered;
  }

  const dueNow = cards.filter((c) => c.nextReviewAt && c.nextReviewAt <= nowIso()).length;

  const todayStats = getTodayReviews(userId);

  const byLesson = {};
  const vocab = contentRepository.getAll(CONTENT_TYPES.VOCABULARY);
  for (const item of vocab) {
    const lesson = item.lesson != null ? String(item.lesson) : 'none';
    if (!byLesson[lesson]) byLesson[lesson] = { total: 0, learned: 0 };
    byLesson[lesson].total += 1;
    const card = byId.get(item.id);
    if (card && card.timesReviewed > 0) byLesson[lesson].learned += 1;
  }

  return {
    user: { id: userId },
    totals: {
      learned: learnedTotal,
      mastered: masteredTotal,
      reviewDue: dueNow,
      todayReviews: todayStats.todayReviews,
      todayCorrectRate:
        todayStats.todayReviews > 0
          ? Math.round((todayStats.correct / todayStats.todayReviews) * 100)
          : null,
      streakDays: computeStreakDays(userId)
    },
    byContentType,
    byLesson
  };
}

function getTodayReviews(userId) {
  const now = new Date();
  try {
    const events = historyRepository.getMonthEvents(userId, currentMonthKey(now));
    const today = events.filter((e) => isSameUtcDay(new Date(e.reviewedAt), now));
    return {
      todayReviews: today.length,
      correct: today.filter((e) => e.result === 'correct').length
    };
  } catch (err) {
    return { todayReviews: 0, correct: 0 };
  }
}

module.exports = { getDashboard };
