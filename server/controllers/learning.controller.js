'use strict';

const learningService = require('../services/learning.service');
const studySessionService = require('../services/study-session.service');
const { sendServiceError } = require('../utils/error-handler');

function getSummary(req, res) {
  try {
    res.locals.sendSuccess(learningService.getSummary(req.params.userId));
  } catch (err) {
    sendServiceError(res, err);
  }
}

function getProgress(req, res) {
  try {
    const progress = learningService.getProgressData(req.params.userId);
    res.locals.sendSuccess(Object.values(progress.cards).map(learningService.publicCard));
  } catch (err) {
    sendServiceError(res, err);
  }
}

function getToday(req, res) {
  try {
    res.locals.sendSuccess(learningService.getTodayStats(req.params.userId));
  } catch (err) {
    sendServiceError(res, err);
  }
}

function getReviewQueue(req, res) {
  try {
    const queue = learningService.getReviewQueue(req.params.userId, {
      contentType: req.query.contentType || undefined,
      count: req.query.count
    });
    res.locals.sendSuccess(queue);
  } catch (err) {
    sendServiceError(res, err);
  }
}

function getSessionCards(req, res) {
  try {
    const session = studySessionService.getSessionCards(
      req.params.userId,
      req.query.contentType,
      req.query.lesson,
      req.query.session
    );
    res.locals.sendSuccess(session);
  } catch (err) {
    sendServiceError(res, err);
  }
}

function getLessonSessions(req, res) {
  try {
    res.locals.sendSuccess(
      studySessionService.getLessonSessions(req.params.userId, req.query.contentType, req.query.lesson)
    );
  } catch (err) {
    sendServiceError(res, err);
  }
}

function recordReview(req, res) {
  try {
    res.locals.sendSuccess(learningService.recordReview(req.params.userId, req.body || {}));
  } catch (err) {
    sendServiceError(res, err);
  }
}

module.exports = {
  getSummary,
  getProgress,
  getToday,
  getReviewQueue,
  getSessionCards,
  getLessonSessions,
  recordReview
};
