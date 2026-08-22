'use strict';

$(function () {
  const $card = $('#card');
  const $typeLabel = $('#card .text-xs.uppercase');
  const $front = $('#card-front');
  const $back = $('#card-back');
  const $answerMain = $('#answer-main');
  const $answerExtra = $('#answer-extra');
  const $sessionInfo = $('#session-info');
  const $donePanel = $('#done-panel');
  const $doneSummary = $('#done-summary');
  const $reveal = $('#reveal-btn');
  const $correct = $('#correct-btn');
  const $wrong = $('#wrong-btn');

  let queue = [];
  let current = null;
  let revealed = false;
  let answeredCount = 0;

  function sides(card) {
    const c = card.content || {};
    if (card.contentType === 'kanji') {
      return {
        front: c.kanji,
        main: (c.meanings || []).join(', ') || '—',
        extra: [
          c.onyomi && c.onyomi.length ? 'On: ' + c.onyomi.join('、') : '',
          c.kunyomi && c.kunyomi.length ? 'Kun: ' + c.kunyomi.join('、') : ''
        ].filter(Boolean).join(' · ')
      };
    }
    if (card.contentType === 'vocabulary') {
      return {
        front: c.word,
        main: c.meaning,
        extra: [c.reading && c.reading !== c.word ? c.reading : '', c.category || '']
          .filter(Boolean).join(' · ')
      };
    }
    return { front: c.character, main: c.romaji, extra: '' };
  }

  function showError(msg) {
    $('#error').text(msg).removeClass('hidden');
  }

  function render() {
    if (!current) {
      $card.addClass('hidden');
      showDone();
      return;
    }
    revealed = false;
    $donePanel.addClass('hidden');
    $card.removeClass('hidden');
    $sessionInfo.text(`${queue.length + 1} card${queue.length === 0 ? '' : 's'} left in session`);

    const s = sides(current);
    $typeLabel.text(current.contentType);
    $front.text(s.front);
    $answerMain.text('');
    $answerExtra.text('');
    $back.addClass('hidden');
    $reveal.prop('disabled', false);
    $correct.add($wrong).prop('disabled', true);
  }

  function nextCard() {
    current = queue.shift();
    render();
  }

  function reveal() {
    if (!current || revealed) return;
    revealed = true;
    const s = sides(current);
    $answerMain.text(s.main);
    $answerExtra.text(s.extra);
    $back.removeClass('hidden');
    $reveal.prop('disabled', true);
    $correct.add($wrong).prop('disabled', false);
  }

  function answer(result) {
    if (!revealed || !current) return;
    $correct.add($wrong).prop('disabled', true);
    api
      .post(`/api/learning/${currentUser.get()}/review`, {
        contentType: current.contentType,
        contentId: current.cardId,
        result
      })
      .done(function (card) {
        answeredCount += 1;
        const labels = { learning: 'Learning', review: 'Review', mastered: 'Mastered' };
        $('#status-line').text(
          `${labels[card.status] || card.status} · streak ${card.streak}`
        );
      })
      .fail(function (err) {
        showError(err.message || 'Could not record answer');
      })
      .always(nextCard);
  }

  function showDone() {
    if (answeredCount === 0 && queue.length === 0 && !current) {
      // nothing to review at all — still show panel
    }
    $donePanel.removeClass('hidden');
    $doneSummary.text(
      answeredCount > 0
        ? `You reviewed ${answeredCount} card${answeredCount === 1 ? '' : 's'}.`
        : 'Nothing is due right now. Come back later!'
    );
    $sessionInfo.text('');
  }

  function loadQueue() {
    $('#error').addClass('hidden');
    answeredCount = 0;
    const type = $('#content-type').val();
    let url = `/api/learning/${currentUser.get()}/review?count=15`;
    if (type) url += `&contentType=${type}`;

    api.get(url)
      .done(function (cards) {
        queue = cards;
        if (!queue.length) {
          current = null;
          $card.addClass('hidden');
          showDone();
          return;
        }
        nextCard();
      })
      .fail(function (err) {
        showError(err.message || 'Could not load review queue');
      });
  }

  $card.on('click', reveal);
  $(document).on('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); revealed ? answer(null) : reveal(); }
    else if (e.code === 'ArrowRight' && revealed) answer('correct');
    else if (e.code === 'ArrowLeft' && revealed) answer('wrong');
  });

  $reveal.on('click', reveal);
  $correct.on('click', () => answer('correct'));
  $wrong.on('click', () => answer('wrong'));
  $('#reload-btn').on('click', loadQueue);
  $('#content-type').on('change', loadQueue);

  currentUser
    .validate()
    .done(loadQueue)
    .fail(function () {
      currentUser.clear();
      window.location.href = '/';
    });
});
