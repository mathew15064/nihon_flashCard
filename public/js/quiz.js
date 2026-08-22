'use strict';

$(function () {
  const CONTENT_TYPES = [
    { value: 'hiragana', label: 'Hiragana' },
    { value: 'katakana', label: 'Katakana' },
    { value: 'kanji', label: 'Kanji' },
    { value: 'vocabulary', label: 'Vocabulary' },
    { value: 'mixed', label: 'Mixed' }
  ];

  const QUESTION_TYPES = {
    all: [
      { value: 'random', label: '🎲 Random' },
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
    return $(`<button data-group="${group}" data-value="${value}"
      class="px-4 py-2 rounded-lg text-sm border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'}">${label}</button>`);
  }

  function renderConfig() {
    const $types = $('#type-options').empty();
    CONTENT_TYPES.forEach((t) =>
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
        .toggleClass('bg-indigo-600 text-white border-indigo-600', $(this).data('value') == value)
        .toggleClass('bg-white text-slate-700 border-slate-300 hover:border-indigo-400', $(this).data('value') != value);
    });
  });

  function show(view) {
    $config.toggleClass('hidden', view !== 'config');
    $play.toggleClass('hidden', view !== 'play');
    $result.toggleClass('hidden', view !== 'result');
  }

  async function startQuiz() {
    hideError();
    $('#start-btn').prop('disabled', true).text('Generating…');
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
      showError(err.message || 'Could not create quiz');
    } finally {
      $('#start-btn').prop('disabled', false).text('Start quiz');
    }
  }

  function renderQuestion() {
    const q = session.questions[index];
    locked = false;
    $('#quiz-progress').text(`Question ${index + 1} / ${session.questions.length}`);
    $('#question-prompt').text(q.prompt);

    const $options = $('#options').empty();
    q.options.forEach((o) => {
      $options.append(
        $(`<button data-option="${o.id}" class="opt-btn bg-white border-2 border-slate-200 hover:border-indigo-400 rounded-xl px-4 py-4 text-lg font-medium text-slate-800 break-all transition-colors">${o.id}. ${escapeHtml(o.text)}</button>`)
          .on('click', () => answer(o.id))
      );
    });

    $('#feedback').addClass('hidden').empty();
    $('#next-btn').addClass('hidden');
    $('#next-btn').text(index === session.questions.length - 1 ? 'See result' : 'Next question');
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
        $b.prop('disabled', true).removeClass('hover:border-indigo-400');
        if (id === res.correctOptionId) {
          $b.addClass('border-emerald-500 bg-emerald-50 text-emerald-800');
        } else if (id === optionId) {
          $b.addClass('border-red-500 bg-red-50 text-red-700 line-through');
        } else {
          $b.addClass('opacity-50');
        }
      });

      if (res.correct) score.correct += 1;
      else score.wrong += 1;

      const $fb = $('#feedback')
        .removeClass('hidden bg-emerald-100 bg-red-100 text-emerald-800 text-red-700')
        .addClass(res.correct ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700');
      $fb.append(`<p class="font-semibold">${res.correct ? '✓ Correct!' : '✗ Wrong'}</p>`);
      $fb.append(`<p class="text-sm mt-1">${escapeHtml(res.explanation)}</p>`);

      $('#next-btn').removeClass('hidden').trigger('focus');
    } catch (err) {
      showError(err.message || 'Could not submit answer');
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
      $('#result-summary').text(`${result.correct} correct · ${result.wrong} wrong (out of ${result.total})`);
      $('#result-emoji').text(result.score >= 80 ? '🎉' : result.score >= 50 ? '👍' : '📚');

      const $bd = $('#result-breakdown').empty();
      result.questions.forEach((q, i) => {
        const chosen = q.options ? null : null; // options not in result payload; use ids
        $bd.append($(`
          <div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
            <span class="truncate mr-2"></span>
            <span class="shrink-0 font-semibold"></span>
          </div>
        `)
          .find('span.truncate').text(`${i + 1}. ${q.prompt}`).end()
          .find('span.font-semibold')
            .text(q.correct ? '✓' : `✗ (${q.correctOptionId})`)
            .addClass(q.correct ? 'text-emerald-600' : 'text-red-600')
          .end());
      });
      show('result');
    } catch (err) {
      showError(err.message || 'Could not load result');
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

  currentUser
    .validate()
    .done(renderConfig)
    .fail(function () {
      currentUser.clear();
      window.location.href = '/';
    });
});
