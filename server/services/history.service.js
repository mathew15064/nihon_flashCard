'use strict';

const userRepository = require('../repositories/user.repository');
const historyRepository = require('../repositories/history.repository');
const { ALL_CONTENT_TYPES } = require('../constants/content-types');

const MONTH_RE = /^\d{4}-\d{2}$/;

function assertUser(userId) {
  if (!userRepository.findById(userId)) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    err.status = 404;
    throw err;
  }
}

function listAvailableMonths(userId) {
  return jsonListMonths(userId);
}

function jsonListMonths(userId) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', '..', 'data', 'learning', 'users', userId, 'history');
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => MONTH_RE.test(f.replace('.json', '')))
      .map((f) => f.replace('.json', ''))
      .sort()
      .reverse();
  } catch (err) {
    return [];
  }
}

function getHistory(userId, query = {}) {
  assertUser(userId);

  const now = new Date();
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  let monthKeys;

  if (query.month && MONTH_RE.test(query.month)) {
    monthKeys = [query.month];
  } else if (query.all === 'true') {
    monthKeys = listAvailableMonths(userId);
    if (!monthKeys.length) monthKeys = [defaultMonth];
  } else {
    monthKeys = [defaultMonth];
  }

  let events = [];
  for (const key of monthKeys) {
    for (const event of historyRepository.getMonthEvents(userId, key)) {
      events.push({ ...event, month: key });
    }
  }

  if (query.contentType) {
    if (!ALL_CONTENT_TYPES.includes(query.contentType)) {
      const err = new Error(`contentType must be one of: ${ALL_CONTENT_TYPES.join(', ')}`);
      err.code = 'INVALID_CONTENT_TYPE';
      err.status = 400;
      throw err;
    }
    events = events.filter((e) => e.contentType === query.contentType);
  }
  if (query.result) {
    if (!['correct', 'wrong'].includes(query.result)) {
      const err = new Error('result must be correct or wrong');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }
    events = events.filter((e) => e.result === query.result);
  }

  events.sort((a, b) => (a.reviewedAt < b.reviewedAt ? 1 : -1));

  const total = events.length;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 50), 500);
  const start = (page - 1) * limit;

  return {
    months: monthKeys,
    total,
    page,
    limit,
    items: events.slice(start, start + limit)
  };
}

module.exports = { getHistory, listAvailableMonths };
