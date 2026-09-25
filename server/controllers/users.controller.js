'use strict';

const userService = require('../services/user.service');
const { sendServiceError } = require('../utils/error-handler');

function list(req, res) {
  try {
    res.locals.sendSuccess(userService.listUsers(req.query));
  } catch (err) {
    sendServiceError(res, err);
  }
}

function get(req, res) {
  try {
    res.locals.sendSuccess(userService.touchActivity(req.params.id));
  } catch (err) {
    sendServiceError(res, err);
  }
}

function create(req, res) {
  try {
    const user = userService.createUser(req.body || {});
    res.locals.sendSuccess(user, 201);
  } catch (err) {
    sendServiceError(res, err);
  }
}

function update(req, res) {
  try {
    res.locals.sendSuccess(userService.updateUser(req.params.id, req.body || {}));
  } catch (err) {
    sendServiceError(res, err);
  }
}

function remove(req, res) {
  try {
    res.locals.sendSuccess(
      userService.deleteUser(req.params.id, { force: req.query.force === 'true' })
    );
  } catch (err) {
    sendServiceError(res, err);
  }
}

module.exports = { list, get, create, update, remove };
