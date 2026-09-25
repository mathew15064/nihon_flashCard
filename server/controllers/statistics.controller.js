'use strict';

const statisticsService = require('../services/statistics.service');
const { sendServiceError } = require('../utils/error-handler');

function getDashboard(req, res) {
  try {
    res.locals.sendSuccess(statisticsService.getDashboard(req.params.userId));
  } catch (err) {
    sendServiceError(res, err);
  }
}

module.exports = { getDashboard };
