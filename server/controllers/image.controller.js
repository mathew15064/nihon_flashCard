'use strict';

const imageService = require('../services/image/image.service');
const { sendServiceError } = require('../utils/error-handler');

function search(req, res) {
  try {
    const promise = imageService.search(req.query.q, parseInt(req.query.limit, 10) || 8);
    promise
      .then((items) => res.locals.sendSuccess(items))
      .catch((err) => sendServiceError(res, err));
  } catch (err) {
    sendServiceError(res, err);
  }
}

module.exports = { search };
