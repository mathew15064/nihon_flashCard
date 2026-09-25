'use strict';

const quizService = require('../services/quiz.service');
const { sendServiceError } = require('../utils/error-handler');

exports.createSession = (req, res) => {
  try {
    res.locals.sendSuccess(quizService.createSession(req.body || {}), 201);
  } catch (err) {
    sendServiceError(res, err);
  }
};

exports.submitAnswer = (req, res) => {
  try {
    const userId = req.query.userId || (req.body || {}).userId;
    res.locals.sendSuccess(
      quizService.submitAnswer(req.params.sessionId, userId, req.body || {})
    );
  } catch (err) {
    sendServiceError(res, err);
  }
};

exports.getResult = (req, res) => {
  try {
    const userId = req.query.userId;
    res.locals.sendSuccess(quizService.getResult(req.params.sessionId, userId));
  } catch (err) {
    sendServiceError(res, err);
  }
};
