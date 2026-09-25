'use strict';

const historyService = require('../services/history.service');
const { sendServiceError } = require('../utils/error-handler');

function listMonths(req, res) {
  try {
    res.locals.sendSuccess(historyService.listAvailableMonths(req.params.userId));
  } catch (err) {
    sendServiceError(res, err);
  }
}

function getHistory(req, res) {
  try {
    const result = historyService.getHistory(req.params.userId, req.query);
    res.locals.sendSuccess(result.items, 200, {
      months: result.months,
      total: result.total,
      page: result.page,
      limit: result.limit
    });
  } catch (err) {
    sendServiceError(res, err);
  }
}

module.exports = { listMonths, getHistory };
