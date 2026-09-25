'use strict';

$(function () {
  const $list = $('#event-list');
  const $error = $('#error');
  let page = 1;

  function showError(msg) {
    $error.text(msg).removeClass('hidden');
  }

  function eventRow(event) {
    const correct = event.result === 'correct';
    return $(`
      <li class="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between">
        <div>
          <p class="text-slate-800 font-medium text-sm"></p>
          <p class="text-xs text-slate-400"></p>
        </div>
        <span class="text-xs font-semibold px-3 py-1 rounded-full"></span>
      </li>
    `)
      .find('p.font-medium').text(`${event.contentType} · ${event.cardId}`).end()
      .find('p.text-xs').text(new Date(event.reviewedAt).toLocaleString()).end()
      .find('span')
        .text(correct ? I18n.t('history.correct') : I18n.t('history.wrong'))
        .addClass(correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
      .end();
  }

  function load() {
    $error.addClass('hidden');
    const month = $('#month').val();
    let url = `/api/history/${currentUser.get()}?page=${page}&limit=50`;
    if (month === 'all') url += '&all=true';
    else if (month) url += `&month=${encodeURIComponent(month)}`;

    api.get(url)
      .done(function (events) {
        render(events, api.lastMeta);
      })
      .fail(function (err) {
        $list.empty().append($('<li class="text-slate-400 text-sm"></li>').text(I18n.t('history.noHistory')));
        if (err.code !== 'NO_USER') showError(err.message || I18n.t('history.loadError'));
      });
  }

  function render(items, meta) {
    $list.empty();
    $('#summary').addClass('hidden');

    if (!items.length) {
      $list.append($('<li class="text-slate-400 text-sm"></li>').text(I18n.t('history.empty')));
      updatePager(meta);
      return;
    }

    items.forEach((e) => $list.append(eventRow(e)));
    updatePager(meta);
  }

  function updatePager(meta) {
    const total = meta && meta.total != null ? meta.total : null;
    $('#prev-btn').prop('disabled', page <= 1 || total === null);
    $('#next-btn').prop(
      'disabled',
      total === null || page * ((meta && meta.limit) || 50) >= total
    );
  }

  $('#prev-btn').on('click', function () {
    if (page > 1) { page -= 1; load(); }
  });
  $('#next-btn').on('click', function () {
    page += 1;
    load();
  });
  $('#month').on('change', function () {
    page = 1;
    load();
  });

  $(document).on('locale:changed', function () {
    I18n.apply();
    load();
  });

  currentUser
    .validate()
    .done(function () {
      api.get(`/api/history/${currentUser.get()}/months`).done(function (months) {
        const $month = $('#month');
        months
          .filter((m) => m !== '')
          .forEach((m) => {
            $month.append(`<option value="${m}">${m}</option>`);
          });
      });
      load();
    })
    .fail(function () {
      currentUser.clear();
      window.location.href = '/';
    });
});
