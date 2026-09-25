'use strict';

$(function () {
  function getContentTypes() {
    return [
      { value: 'hiragana', label: I18n.t('content.hiragana') },
      { value: 'katakana', label: I18n.t('content.katakana') },
      { value: 'kanji', label: I18n.t('content.kanji') },
      { value: 'vocabulary', label: I18n.t('content.vocabulary') },
      { value: 'mixed', label: 'Mixed' }
    ];
  }

  const QUESTION_TYPES = {
    all: [
      { value: 'random', label: 'Random' },
      { value: 'jp-to-meaning', label: 'JP → Meaning' },
      { value: 'meaning-to-jp', label: 'Meaning → JP' }
    ],
    kanji: [
      { value: 'jp-to-reading', label: 'Kanji → Reading' },
      { value: 'reading-to-jp', label: 'Reading → Kanji' }
    ],
    vocabulary: [
      { value: 'jp-to-reading', label: 'Word → Reading' },
      { value: 'reading-to-jp', label: 'Reading → Word' }
    ]
  };

  const $error = $('#error');
  const $config = $('#config-view');
  const $play = $('#play-view');
  const $result = $('#result-view');

  let selectedType = 'vocabulary';
  let selectedCount = 10;
  let selectedQType = 'random';
  let session = null;      // {sessionId, questions}
  let index = 0;
  let score = { correct: 0, wrong: 0 };
  let locked = false;

  function showError(msg) {
    $error.text(msg).removeClass('hidden');
  }

  function hideError() {
    $error.addClass('hidden');
  }

  function pill(value, label, group, active) {
    const cls = 'apple-btn text-sm !py-2 !px-5 ' + (active ? 'apple-btn-primary' : 'apple-btn-secondary');
    return $(`<button data-group="${group}" data-value="${value}" class="${cls}">${label}</button>`);
  }

  function renderConfig() {
    const $types = $('#type-options').empty();
    getContentTypes().forEach((t) =>
      $types.append(pill(t.value, t.label, 'type', t.value === selectedType)));

    const $counts = $('#count-options').empty();
    [5, 10, 20].forEach((c) =>
      $counts.append(pill(String(c), String(c), 'count', c === selectedCount)));

    const $qtypes = $('#qtype-options').empty();
    let qts = [...QUESTION_TYPES.all];
    if (selectedType === 'kanji') qts = qts.concat(QUESTION_TYPES.kanji);
    if (selectedType === 'vocabulary') qts = qts.concat(QUESTION_TYPES.vocabulary);
    if (selectedType === 'mixed') qts = qts.concat([...QUESTION_TYPES.kanji, ...QUESTION_TYPES.vocabulary]);
    if (!qts.some((q) => q.value === selectedQType)) selectedQType = 'random';
    qts.forEach((q) => $qtypes.append(pill(q.value, q.label, 'qtype', q.value === selectedQType)));
  }

  $(document).on('click', '#config-view [data-group]', function () {
    const group = $(this).data('group');
    const value = $(this).data('value');
    if (group === 'type') {
      selectedType = value;
      renderConfig();
      return;
    }
    if (group === 'count') selectedCount = Number(value);
    if (group === 'qtype') selectedQType = value;

    $(this).closest('div').find('button').each(function () {
      $(this)
        .toggleClass('apple-btn-primary', $(this).data('value') == value)
        .toggleClass('apple-btn-secondary', $(this).data('value') != value);
    });
  });

  function show(view) {
    $config.toggleClass('hidden', view !== 'config');
    $play.toggleClass('hidden', view !== 'play');
    $result.toggleClass('hidden', view !== 'result');
  }

  async function startQuiz() {
    hideError();
    $('#start-btn').prop('disabled', true).text(I18n.t('quiz.generating'));
    try {
      session = await api.post('/api/quiz/sessions', {
        userId: currentUser.get(),
        contentType: selectedType,
        questionType: selectedQType,
        count: selectedCount
      });
      index = 0;
      score = { correct: 0, wrong: 0 };
      show('play');
      renderQuestion();
    } catch (err) {
      showError(err.message || I18n.t('quiz.loadError'));
    } finally {
      $('#start-btn').prop('disabled', false).text(I18n.t('quiz.start'));
    }
  }

  function renderQuestion() {
    const q = session.questions[index];
    locked = false;
    $('#quiz-progress').text(I18n.t('quiz.questionProgress', { n: index + 1, total: session.questions.length }));
    $('#question-prompt').text(q.prompt);

    const $options = $('#options').empty();
    q.options.forEach((o) => {
      $options.append(
        $(`<button data-option="${o.id}" class="opt-btn apple-card w-full text-left text-lg font-medium text-ink break-words hover:border-action transition-colors">${o.id}. ${escapeHtml(o.text)}</button>`)
          .on('click', () => answer(o.id))
      );
    });

    $('#feedback').addClass('hidden').empty();
    $('#next-btn').addClass('hidden');
    $('#next-btn').text(index === session.questions.length - 1 ? I18n.t('quiz.seeResult') : I18n.t('quiz.next'));
  }

  function escapeHtml(s) {
    return $('<div>').text(s).html();
  }

  async function answer(optionId) {
    if (locked) return;
    locked = true;

    try {
      const res = await api.post(
        `/api/quiz/sessions/${session.sessionId}/answers?userId=${currentUser.get()}`,
        { questionId: session.questions[index].questionId, optionId }
      );

      $('.opt-btn').each(function () {
        const $b = $(this);
        const id = $b.data('option');
        $b.prop('disabled', true).removeClass('hover:border-action hover:border-indigo-400');
        if (id === res.correctOptionId) {
          $b.addClass('!border-correct !text-correct');
        } else if (id === optionId) {
          $b.addClass('!border-wrong !text-wrong line-through');
        } else {
          $b.addClass('opacity-50');
        }
      });

      if (res.correct) score.correct += 1;
      else score.wrong += 1;

      const $fb = $('#feedback')
        .removeClass('hidden bg-correct/10 text-correct bg-wrong/10 text-wrong')
        .addClass(res.correct ? 'bg-correct/10 text-correct' : 'bg-wrong/10 text-wrong');
      $fb.append(`<p class="font-semibold">${res.correct ? I18n.t('quiz.correct') : I18n.t('quiz.wrong')}</p>`);
      $fb.append(`<p class="text-sm mt-1">${escapeHtml(res.explanation)}</p>`);

      $('#next-btn').removeClass('hidden').trigger('focus');
    } catch (err) {
      showError(err.message || I18n.t('quiz.loadError'));
      locked = false;
    }
  }

  function next() {
    index += 1;
    if (index >= session.questions.length) showResult();
    else renderQuestion();
  }

  async function showResult() {
    try {
      const result = await api.get(
        `/api/quiz/sessions/${session.sessionId}/result?userId=${currentUser.get()}`
      );
      $('#result-score').text(result.score + '%');
      $('#result-summary').text(I18n.t('quiz.resultSummary', { correct: result.correct, wrong: result.wrong, total: result.total }));
      $('#result-emoji').text(result.score >= 80 ? 'Excellent' : result.score >= 50 ? 'Good' : 'Keep practicing');

      const $bd = $('#result-breakdown').empty();
      result.questions.forEach((q, i) => {
        $bd.append($(`
          <div class="flex items-center justify-between bg-parchment rounded-lg px-3 py-2 text-sm">
            <span class="truncate mr-2"></span>
            <span class="shrink-0 font-semibold"></span>
          </div>
        `)
          .find('span.truncate').text(`${i + 1}. ${q.prompt}`).end()
          .find('span.font-semibold')
            .text(q.correct ? 'Correct' : `Wrong (${q.correctOptionId})`)
            .addClass(q.correct ? 'text-correct' : 'text-wrong')
          .end());
      });
      show('result');
    } catch (err) {
      showError(err.message || I18n.t('quiz.loadError'));
    }
  }

  $('#start-btn').on('click', startQuiz);
  $('#next-btn').on('click', next);
  $('#retry-btn').on('click', function () {
    show('config');
  });
  $(document).on('keydown', function (e) {
    if ($play.hasClass('hidden')) return;
    const keyMap = { a: 'A', b: 'B', c: 'C', d: 'D', '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
    const opt = keyMap[e.key.toLowerCase()];
    if (opt && !locked) answer(opt);
    else if ((e.key === 'Enter' || e.code === 'Space') && !$('#next-btn').hasClass('hidden')) {
      e.preventDefault();
      next();
    }
  });

  $(document).on('locale:changed', function () {
    I18n.apply();
    renderConfig();
    if (session && !$play.hasClass('hidden')) {
      renderQuestion();
    }
  });

  currentUser
    .validate()
    .done(renderConfig)
    .fail(function () {
      currentUser.clear();
      window.location.href = '/';
    });
});
