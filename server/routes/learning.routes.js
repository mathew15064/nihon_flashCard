'use strict';

const express = require('express');
const controller = require('../controllers/learning.controller');

const router = express.Router();

router.get('/:userId', controller.getSummary);
router.get('/:userId/progress', controller.getProgress);
router.get('/:userId/today', controller.getToday);
router.get('/:userId/review', controller.getReviewQueue);
router.get('/:userId/sessions/cards', controller.getSessionCards);
router.get('/:userId/sessions', controller.getLessonSessions);
router.post('/:userId/review', controller.recordReview);

module.exports = router;
