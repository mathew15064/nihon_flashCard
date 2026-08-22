'use strict';

const contentService = require('../services/content.service');

function makeContentController(contentType) {
  function handleError(res, err) {
    if (err.code && err.status) {
      res.locals.sendError(err.status, err.code, err.message);
    } else if (err.message && err.message.startsWith('INVALID_CONTENT_TYPE')) {
      res.locals.sendError(400, 'INVALID_CONTENT_TYPE', 'Unknown content type');
    } else {
      console.error(err);
      res.locals.sendError(500, 'INTERNAL_ERROR', 'Internal server error');
    }
  }

  return {
    list(req, res) {
      try {
        const result = contentService.list(contentType, req.query);
        res.locals.sendSuccess(result.items, 200, { total: result.total, page: result.page, limit: result.limit });
      } catch (err) {
        handleError(res, err);
      }
    },
    random(req, res) {
      try {
        const count = parseInt(req.query.count, 10) || 10;
        res.locals.sendSuccess(contentService.random(contentType, count));
      } catch (err) {
        handleError(res, err);
      }
    },
    get(req, res) {
      try {
        res.locals.sendSuccess(contentService.getById(contentType, req.params.id));
      } catch (err) {
        handleError(res, err);
      }
    },
    create(req, res) {
      try {
        res.locals.sendSuccess(contentService.create(contentType, req.body), 201);
      } catch (err) {
        handleError(res, err);
      }
    },
    update(req, res) {
      try {
        res.locals.sendSuccess(contentService.update(contentType, req.params.id, req.body));
      } catch (err) {
        handleError(res, err);
      }
    },
    remove(req, res) {
      try {
        res.locals.sendSuccess(contentService.remove(contentType, req.params.id));
      } catch (err) {
        handleError(res, err);
      }
    }
  };
}

module.exports = { makeContentController };
