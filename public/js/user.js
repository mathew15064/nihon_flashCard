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
      <li class="apple-card flex items-center justify-between">
        <div>
          <p class="font-semibold text-ink"></p>
          <p class="apple-caption"></p>
        </div>
        <button class="select-btn apple-btn apple-btn-primary">
        </button>
      </li>
    `)
      .find('p.font-semibold').text(user.displayName).end()
      .find('p.apple-caption')
        .text(inactive ? `${user.username} · inactive` : `@${user.username}`)
      .end()
      .find('.select-btn')
        .text(I18n.t('userSelect.select'))
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
          $list.append($('<li class="text-ink-muted text-sm"></li>').text(I18n.t('userSelect.noUsers')));
          return;
        }
        users.forEach((u) => $list.append(userCard(u)));
      })
      .fail(function (err) {
        showError(err.message || I18n.t('userSelect.loadError'));
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
        showError(err.message || I18n.t('userSelect.createError'));
      });
  });

  $(document).on('locale:changed', function () {
    I18n.apply();
    loadUsers();
  });

  loadUsers();
});
