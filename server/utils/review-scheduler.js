'use strict';

const { LEARNING_STATUS } = require('../constants/learning-status');
const dateUtil = require('./date');

// Interval ladder (in minutes) indexed by streak after a correct answer.
const LADDER_MINUTES = [10, 1440, 4320, 10080, 20160, 43200];
const WRONG_DELAY_MINUTES = 10;

function schedule(card, result, now = new Date()) {
  if (result === 'correct') {
    card.streak = (card.streak || 0) + 1;
    const step = Math.min(card.streak - 1, LADDER_MINUTES.length - 1);
    card.nextReviewAt = dateUtil.addMinutes(LADDER_MINUTES[step], now);
    card.status =
      step === LADDER_MINUTES.length - 1
        ? LEARNING_STATUS.MASTERED
        : card.streak >= 2
          ? LEARNING_STATUS.REVIEW
          : LEARNING_STATUS.LEARNING;
  } else {
    card.streak = 0;
    card.nextReviewAt = dateUtil.addMinutes(WRONG_DELAY_MINUTES, now);
    card.status = LEARNING_STATUS.LEARNING;
  }
  return card;
}

module.exports = { schedule, LADDER_MINUTES, WRONG_DELAY_MINUTES };
