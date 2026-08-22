'use strict';

$(function () {
  const $list = $('#user-list');
  const $error = $('#error');

  function showError(message) {
    $error.text(message).removeClass('hidden');
  }

  function hideError() {
    $error.addClass('hidden');
  }

  function userCard(user) {
    const inactive = user.status === 'inactive';
    return $(`
      <li class="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between">
        <div>
          <p class="font-semibold text-slate-800"></p>
          <p class="text-xs text-slate-400"></p>
        </div>
        <button class="select-btn bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg">
          Select
        </button>
      </li>
    `)
      .find('p.font-semibold').text(user.displayName).end()
      .find('p.text-xs')
        .text(inactive ? `${user.username} · inactive` : `@${user.username}`)
      .end()
      .find('.select-btn')
        .prop('disabled', inactive)
        .on('click', () => selectUser(user))
      .end();
  }

  function selectUser(user) {
    currentUser.set(user.id);
    window.location.href = '/pages/dashboard.html';
  }

  function loadUsers() {
    api.get('/api/users?status=active')
      .done(function (users) {
        $list.empty();
        if (!users.length) {
          $list.append('<li class="text-slate-400 text-sm">No users yet. Create one to start.</li>');
          return;
        }
        users.forEach((u) => $list.append(userCard(u)));
      })
      .fail(function (err) {
        showError(err.message || 'Could not load users');
      });
  }

  $('#new-user-btn').on('click', function () {
    $('#new-user-form').toggleClass('hidden');
    $('#username-input').trigger('focus');
    hideError();
  });

  $('#new-user-form').on('submit', function (e) {
    e.preventDefault();
    hideError();
    api
      .post('/api/users', {
        username: $('#username-input').val(),
        displayName: $('#displayname-input').val()
      })
      .done(function (user) {
        $('#username-input').val('');
        $('#displayname-input').val('');
        $('#new-user-form').addClass('hidden');
        selectUser(user);
      })
      .fail(function (err) {
        showError(err.message || 'Could not create user');
      });
  });

  loadUsers();
});
