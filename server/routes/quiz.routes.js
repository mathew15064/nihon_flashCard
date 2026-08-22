'use strict';

const express = require('express');
const controller = require('../controllers/quiz.controller');

const router = express.Router();

router.post('/sessions', controller.createSession);
router.post('/sessions/:sessionId/answers', controller.submitAnswer);
router.get('/sessions/:sessionId/result', controller.getResult);

module.exports = router;
