'use strict';

$(function () {
  let lastStats = null;
  let currentUserObj = null;

  function getContentTypeLabel(type) {
    return I18n.t(`content.${type}`) || type;
  }

  function statTile(label, value) {
    return $(`
      <div class="bg-white rounded-xl shadow p-4 text-center">
        <p class="text-2xl font-bold text-slate-800"></p>
        <p class="text-xs text-slate-500"></p>
      </div>
    `)
      .find('p.font-bold').text(value).end()
      .find('p.text-xs').text(label).end();
  }

  function typeBar(type, stats) {
    const learned = stats.learning + stats.review + stats.mastered;
    const pct = stats.total ? Math.round((learned / stats.total) * 100) : 0;
    const row = $(`
      <div class="bg-white rounded-xl shadow p-4">
        <div class="flex justify-between text-sm mb-2">
          <span class="font-medium text-slate-700"></span>
          <span class="text-slate-500"></span>
        </div>
        <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div class="h-full bg-indigo-500 rounded-full" style="width:0%"></div>
        </div>
        <p class="text-xs text-slate-400 mt-1"></p>
      </div>
    `);
    row.find('span.font-medium').text(getContentTypeLabel(type));
    row.find('span.text-slate-500').text(`${learned} / ${stats.total}`);
    row.find('.bg-indigo-500').css('width', pct + '%');
    row.find('p.text-xs').text(
      `${I18n.t('status.new')} ${stats.new} · ${I18n.t('status.learning')} ${stats.learning} · ${I18n.t('status.review')} ${stats.review} · ${I18n.t('status.mastered')} ${stats.mastered}`
    );
    return row;
  }

  function lessonRow(lesson, stats) {
    const pct = stats.total ? Math.round((stats.learned / stats.total) * 100) : 0;
    return $(`
      <div class="flex items-center gap-3 bg-white rounded-lg shadow px-4 py-2 text-sm">
        <span class="w-20 text-slate-600"></span>
        <span class="w-24 text-right text-slate-500"></span>
        <div class="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div class="h-full bg-emerald-500 rounded-full" style="width:0%"></div>
        </div>
      </div>
    `)
      .find('span.w-20').text(I18n.t('dashboard.lessonLabel')).append($(`<b class="text-slate-800 ml-1">${lesson}</b>`)).end()
      .find('span.w-24').text(`${stats.learned}/${stats.total}`).end()
      .find('.bg-emerald-500').css('width', pct + '%')
      .end();
  }

  function render(stats) {
    lastStats = stats;
    $('#stats-loading').addClass('hidden');
    const t = stats.totals;
    $('#totals')
      .empty()
      .append(statTile(I18n.t('dashboard.learned'), t.learned))
      .append(statTile(I18n.t('dashboard.dueForReview'), t.reviewDue))
      .append(statTile(I18n.t('dashboard.todayReviews'), t.todayReviews))
      .append(statTile(I18n.t('dashboard.dayStreak'), t.streakDays));

    const $byType = $('#by-type').empty();
    Object.entries(stats.byContentType).forEach(([type, s]) => {
      if (s.total > 0 || s.learning > 0) $byType.append(typeBar(type, s));
    });

    const lessons = Object.entries(stats.byLesson || {}).sort(
      (a, b) => Number(a[0]) - Number(b[0])
    );
    if (lessons.length) {
      $('#lesson-section').removeClass('hidden');
      const $byLesson = $('#by-lesson').empty();
      lessons.forEach(([lesson, s]) => $byLesson.append(lessonRow(lesson, s)));
    }
  }

  currentUser
    .validate()
    .done(function (user) {
      currentUserObj = user;
      $('#current-user').text(user.displayName);
      $('#welcome').text(I18n.t('dashboard.welcome', { name: user.displayName }));

      api
        .get(`/api/statistics/${user.id}`)
        .done(render)
        .fail(function (err) {
          $('#stats-loading').text(I18n.t('dashboard.loadError')).addClass('text-red-500');
          console.error(err);
        });
    })
    .fail(function () {
      currentUser.clear();
      window.location.href = '/';
    });

  $('#switch-user-btn').on('click', function () {
    currentUser.clear();
    window.location.href = '/';
  });

  $(document).on('locale:changed', function () {
    I18n.apply();
    if (currentUserObj) {
      $('#welcome').text(I18n.t('dashboard.welcome', { name: currentUserObj.displayName }));
    }
    if (lastStats) render(lastStats);
  });
});
