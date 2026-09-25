'use strict';

$(function () {
  const TYPE_LABELS = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
    kanji: 'Kanji',
    vocabulary: 'Vocabulary'
  };

  function statTile(label, value) {
    return $(`
      <div class="apple-card text-center">
        <p class="text-4xl font-semibold text-ink"></p>
        <p class="apple-caption mt-1"></p>
      </div>
    `)
      .find('p.font-semibold').text(value).end()
      .find('p.apple-caption').text(label).end();
  }

  function typeBar(type, stats) {
    const learned = stats.learning + stats.review + stats.mastered;
    const pct = stats.total ? Math.round((learned / stats.total) * 100) : 0;
    const row = $(`
      <div class="apple-card">
        <div class="flex justify-between items-baseline mb-3">
          <span class="text-base font-semibold"></span>
          <span class="apple-caption"></span>
        </div>
        <div class="h-1.5 bg-divider rounded-full overflow-hidden">
          <div class="h-full bg-action rounded-full transition-all" style="width:0%"></div>
        </div>
        <p class="apple-caption mt-2"></p>
      </div>
    `);
    row.find('span.font-semibold').text(TYPE_LABELS[type] || type);
    row.find('span.apple-caption').first().text(`${learned} / ${stats.total}`);
    row.find('.bg-action').css('width', pct + '%');
    row.find('p.apple-caption').text(
      `new ${stats.new} · learning ${stats.learning} · review ${stats.review} · mastered ${stats.mastered}`
    );
    return row;
  }

  function lessonRow(lesson, stats) {
    const pct = stats.total ? Math.round((stats.learned / stats.total) * 100) : 0;
    return $(`
      <div class="apple-card flex items-center gap-4 py-4">
        <span class="text-sm text-ink-muted whitespace-nowrap"></span>
        <span class="text-sm text-ink-muted w-20 text-right"></span>
        <div class="flex-1 h-1.5 bg-divider rounded-full overflow-hidden">
          <div class="h-full bg-correct rounded-full transition-all" style="width:0%"></div>
        </div>
      </div>
    `)
      .find('span').first().append($(`<b class="text-ink font-semibold">${lesson}</b>`)).end()
      .find('span.w-20').text(`${stats.learned}/${stats.total}`).end()
      .find('.bg-correct').css('width', pct + '%')
      .end();
  }

  function render(stats) {
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
      $('#current-user').text(user.displayName);
      $('#welcome').text(I18n.t('dashboard.welcome', { name: user.displayName }));

      api
        .get(`/api/statistics/${user.id}`)
        .done(render)
        .fail(function (err) {
          $('#stats-loading')
            .text(I18n.t('dashboard.loadError'))
            .removeClass('apple-caption')
            .addClass('text-red-600');
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
    currentUser.validate().done(function (user) {
      $('#current-user').text(user.displayName);
      $('#welcome').text(I18n.t('dashboard.welcome', { name: user.displayName }));
      api.get(`/api/statistics/${user.id}`).done(render);
    });
  });
});
