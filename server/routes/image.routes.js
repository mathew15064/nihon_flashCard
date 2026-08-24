'use strict';

const express = require('express');
const imageService = require('../services/image/image.service');

const router = express.Router();

function handleError(res, err) {
  if (err.code && err.status) {
    res.locals.sendError(err.status, err.code, err.message);
  } else {
    console.error(err);
    res.locals.sendError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

// GET /api/images/search?q=apple&limit=8
router.get('/search', (req, res) => {
  imageService
    .search(req.query.q, parseInt(req.query.limit, 10) || 8)
    .then((items) => res.locals.sendSuccess(items))
    .catch((err) => handleError(res, err));
});

module.exports = router;
