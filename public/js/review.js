'use strict';

$(function () {
  const $card = $('#card');
  const $typeLabel = $('#card .apple-caption.uppercase, #card .text-xs.uppercase');
  const $front = $('#card-front');
  const $back = $('#card-back');
  const $answerReading = $('#answer-reading');
  const $answerRomanization = $('#answer-romanization');
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
  let submitting = false;
  let answeredCount = 0;

  function setText($el, text) {
    $el.toggleClass('hidden', !text).text(text || '');
  }

  function showError(msg) {
    $('#error').text(msg).removeClass('hidden');
  }

  function hideError() {
    $('#error').addClass('hidden');
  }

  function applySides() {
    if (!current) return;
    const s = CardRender.fromCard(current);
    $typeLabel.text(current.contentType);
    $front.text(s.front);
    setText($answerReading, s.reading);
    setText($answerRomanization, s.romanization);
    $answerMain.text(s.main);
    $answerExtra.text(s.extra);
  }

  function render() {
    if (!current) {
      $card.addClass('hidden');
      showDone();
      return;
    }
    revealed = false;
    submitting = false;
    $donePanel.addClass('hidden');
    $card.removeClass('hidden');
    $sessionInfo.text(I18n.t('review.cardsLeft', { n: queue.length + 1 }));

    const s = CardRender.fromCard(current);
    $typeLabel.text(current.contentType);
    $front.text(s.front);
    setText($answerReading, '');
    setText($answerRomanization, '');
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
    const s = CardRender.fromCard(current);
    setText($answerReading, s.reading);
    setText($answerRomanization, s.romanization);
    $answerMain.text(s.main);
    $answerExtra.text(s.extra);
    $back.removeClass('hidden');
    $reveal.prop('disabled', true);
    $correct.add($wrong).prop('disabled', false);
  }

  function answer(result) {
    if (!revealed || !current || submitting) return;
    submitting = true;
    $correct.add($wrong).prop('disabled', true);
    $reveal.prop('disabled', true);
    hideError();

    api
      .post(`/api/learning/${currentUser.get()}/review`, {
        contentType: current.contentType,
        contentId: current.cardId,
        result
      })
      .done(function (card) {
        answeredCount += 1;
        const labels = {
          learning: I18n.t('status.learning'),
          review: I18n.t('status.review'),
          mastered: I18n.t('status.mastered')
        };
        $('#status-line').text(
          `${labels[card.status] || card.status} · ${I18n.t('status.streak')} ${card.streak}`
        );
        nextCard();
      })
      .fail(function (err) {
        submitting = false;
        $correct.add($wrong).prop('disabled', false);
        $reveal.prop('disabled', true);
        showError(err.message || I18n.t('learn.error'));
      });
  }

  function showDone() {
    $donePanel.removeClass('hidden');
    $doneSummary.text(
      answeredCount > 0
        ? I18n.t('review.reviewed', { n: answeredCount })
        : I18n.t('review.nothingDue')
    );
    $sessionInfo.text('');
  }

  function loadQueue() {
    hideError();
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
        showError(err.message || I18n.t('review.loadError'));
      });
  }

  $card.on('click', reveal);
  $(document).on('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); revealed ? nextCard() : reveal(); }
    else if (e.code === 'ArrowRight' && revealed) answer('correct');
    else if (e.code === 'ArrowLeft' && revealed) answer('wrong');
  });

  $reveal.on('click', reveal);
  $correct.on('click', () => answer('correct'));
  $wrong.on('click', () => answer('wrong'));
  $('#reload-btn').on('click', loadQueue);
  $('#content-type').on('change', loadQueue);

  $(document).on('locale:changed', function () {
    I18n.apply();
    if (current) {
      applySides();
      if (revealed) {
        $back.removeClass('hidden');
      } else {
        $back.addClass('hidden');
      }
    } else {
      showDone();
    }
  });

  currentUser
    .validate()
    .done(loadQueue)
    .fail(function () {
      currentUser.clear();
      window.location.href = '/';
    });
});
