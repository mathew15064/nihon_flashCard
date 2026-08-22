'use strict';

const userService = require('../services/user.service');

function list(req, res) {
  try {
    res.locals.sendSuccess(userService.listUsers(req.query));
  } catch (err) {
    handleError(res, err);
  }
}

function get(req, res) {
  try {
    res.locals.sendSuccess(userService.touchActivity(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
}

function create(req, res) {
  try {
    const user = userService.createUser(req.body || {});
    res.locals.sendSuccess(user, 201);
  } catch (err) {
    handleError(res, err);
  }
}

function update(req, res) {
  try {
    res.locals.sendSuccess(userService.updateUser(req.params.id, req.body || {}));
  } catch (err) {
    handleError(res, err);
  }
}

function remove(req, res) {
  try {
    res.locals.sendSuccess(
      userService.deleteUser(req.params.id, { force: req.query.force === 'true' })
    );
  } catch (err) {
    handleError(res, err);
  }
}

function handleError(res, err) {
  if (err.code && err.status) {
    res.locals.sendError(err.status, err.code, err.message);
  } else {
    console.error(err);
    res.locals.sendError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

module.exports = { list, get, create, update, remove };
