'use strict';

$(function () {
  api.get('/api/health')
    .done(function () {
      $('#status').text('Server connected. User selection coming in Phase 2.');
    })
    .fail(function () {
      $('#status').text('Cannot reach server.');
    });
});
