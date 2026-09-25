'use strict';

const contentService = require('../services/content.service');
const { sendServiceError } = require('../utils/error-handler');

function makeContentController(contentType) {
  return {
    list(req, res) {
      try {
        const result = contentService.list(contentType, req.query);
        res.locals.sendSuccess(result.items, 200, {
          total: result.total,
          page: result.page,
          limit: result.limit
        });
      } catch (err) {
        sendServiceError(res, err);
      }
    },
    random(req, res) {
      try {
        const count = parseInt(req.query.count, 10) || 10;
        res.locals.sendSuccess(contentService.random(contentType, count));
      } catch (err) {
        sendServiceError(res, err);
      }
    },
    get(req, res) {
      try {
        res.locals.sendSuccess(contentService.getById(contentType, req.params.id));
      } catch (err) {
        sendServiceError(res, err);
      }
    },
    create(req, res) {
      try {
        res.locals.sendSuccess(contentService.create(contentType, req.body), 201);
      } catch (err) {
        sendServiceError(res, err);
      }
    },
    update(req, res) {
      try {
        res.locals.sendSuccess(contentService.update(contentType, req.params.id, req.body));
      } catch (err) {
        sendServiceError(res, err);
      }
    },
    remove(req, res) {
      try {
        res.locals.sendSuccess(contentService.remove(contentType, req.params.id));
      } catch (err) {
        sendServiceError(res, err);
      }
    }
  };
}

module.exports = { makeContentController };
