'use strict';

function sendServiceError(res, err) {
  if (err && err.code && err.status) {
    res.locals.sendError(err.status, err.code, err.message);
  } else {
    console.error(err);
    res.locals.sendError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

module.exports = { sendServiceError };
