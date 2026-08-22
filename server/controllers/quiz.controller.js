'use strict';

const quizService = require('../services/quiz.service');

function handleError(res, err) {
  if (err.code && err.status) {
    res.locals.sendError(err.status, err.code, err.message);
  } else {
    console.error(err);
    res.locals.sendError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

exports.createSession = (req, res) => {
  try {
    res.locals.sendSuccess(quizService.createSession(req.body || {}), 201);
  } catch (err) {
    handleError(res, err);
  }
};

exports.submitAnswer = (req, res) => {
  try {
    const userId = req.query.userId || (req.body || {}).userId;
    res.locals.sendSuccess(
      quizService.submitAnswer(req.params.sessionId, userId, req.body || {})
    );
  } catch (err) {
    handleError(res, err);
  }
};

exports.getResult = (req, res) => {
  try {
    const userId = req.query.userId;
    res.locals.sendSuccess(quizService.getResult(req.params.sessionId, userId));
  } catch (err) {
    handleError(res, err);
  }
};
