'use strict';

const express = require('express');
const learningService = require('../services/learning.service');
const studySessionService = require('../services/study-session.service');

const router = express.Router();

function handleError(res, err) {
  if (err.code && err.status) {
    res.locals.sendError(err.status, err.code, err.message);
  } else if (err.message && err.message.startsWith('INVALID_CONTENT_TYPE')) {
    res.locals.sendError(400, 'INVALID_CONTENT_TYPE', 'Unknown content type');
  } else if (err.message && err.message.startsWith('CORRUPTED_JSON_FILE')) {
    res.locals.sendError(500, 'INTERNAL_ERROR', 'Stored data is corrupted');
  } else if (err.message && err.message.includes('CONTENT_NOT_FOUND')) {
    res.locals.sendError(404, 'CONTENT_NOT_FOUND', 'Content not found');
  } else {
    console.error(err);
    res.locals.sendError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

router.get('/:userId', (req, res) => {
  try {
    res.locals.sendSuccess(learningService.getSummary(req.params.userId));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:userId/progress', (req, res) => {
  try {
    const progress = learningService.getProgressData(req.params.userId);
    res.locals.sendSuccess(Object.values(progress.cards).map(learningService.publicCard));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:userId/today', (req, res) => {
  try {
    res.locals.sendSuccess(learningService.getTodayStats(req.params.userId));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:userId/review', (req, res) => {
  try {
    const queue = learningService.getReviewQueue(req.params.userId, {
      contentType: req.query.contentType || undefined,
      count: req.query.count
    });
    res.locals.sendSuccess(queue);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:userId/sessions/cards', (req, res) => {
  try {
    const session = studySessionService.getSessionCards(
      req.params.userId,
      req.query.contentType,
      req.query.lesson,
      req.query.session
    );
    const items = session.contentIds.map((id) =>
      require('../repositories/content.repository').findById(req.query.contentType, id)
    );
    res.locals.sendSuccess({ ...session, items });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/learning/:userId/sessions?contentType=vocabulary&lesson=1
router.get('/:userId/sessions', (req, res) => {
  try {
    res.locals.sendSuccess(
      studySessionService.getLessonSessions(req.params.userId, req.query.contentType, req.query.lesson)
    );
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:userId/review', (req, res) => {
  try {
    res.locals.sendSuccess(learningService.recordReview(req.params.userId, req.body || {}));
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
