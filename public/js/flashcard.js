'use strict';

$(function () {
  const $card = $('#card');
  const $front = $('#card-front');
  const $back = $('#card-back');
  const $answerMain = $('#answer-main');
  const $answerExtra = $('#answer-extra');
  const $empty = $('#empty-state');
  const $error = $('#error');
  const $reveal = $('#reveal-btn');
  const $correct = $('#correct-btn');
  const $wrong = $('#wrong-btn');

  let queue = [];
  let current = null;
  let revealed = false;

  function cardSides(item, contentType) {
    if (contentType === 'kanji') {
      return {
        front: item.kanji,
        main: (item.meanings || []).join(', ') || '—',
        extra: [
          item.onyomi && item.onyomi.length ? 'On: ' + item.onyomi.join('、') : '',
          item.kunyomi && item.kunyomi.length ? 'Kun: ' + item.kunyomi.join('、') : ''
        ].filter(Boolean).join(' · ')
      };
    }
    if (contentType === 'vocabulary') {
      return {
        front: item.word,
        main: item.meaning,
        extra: [item.reading && item.reading !== item.word ? item.reading : '', item.category || '']
          .filter(Boolean).join(' · ')
      };
    }
    return { front: item.character, main: item.romaji, extra: '' };
  }

  function showError(msg) {
    $error.text(msg).removeClass('hidden');
  }

  function render() {
    if (!current) {
      $card.addClass('hidden');
      if ($error.hasClass('hidden')) {
        $empty.removeClass('hidden');
      }
      return;
    }
    $empty.addClass('hidden');
    $card.removeClass('hidden');
    revealed = false;

    const sides = cardSides(current, $('#content-type').val());
    $front.text(sides.front);
    $answerMain.text('');
    $answerExtra.text('');
    $back.addClass('hidden');

    $reveal.prop('disabled', false).text('Reveal');
    $correct.add($wrong).prop('disabled', true);
    $('#status-line').text('');
  }

  function nextCard() {
    current = queue.shift();
    if (!current) {
      loadCards($('#content-type').val());
      return;
    }
    render();
  }

  function reveal() {
    if (!current || revealed) return;
    revealed = true;
    const sides = cardSides(current, $('#content-type').val());
    $answerMain.text(sides.main);
    $answerExtra.text(sides.extra);
    $back.removeClass('hidden');
    $reveal.prop('disabled', true);
    $correct.add($wrong).prop('disabled', false);
  }

  function answer(result) {
    if (!revealed || !current) return;
    $correct.add($wrong).prop('disabled', true);
    api
      .post(`/api/learning/${currentUser.get()}/review`, {
        contentType: $('#content-type').val(),
        contentId: current.id,
        result
      })
      .done(function (card) {
        showStatus(card);
      })
      .fail(function (err) {
        showError(err.message || 'Could not record answer');
      })
      .always(function () {
        nextCard();
      });
  }

  function showStatus(card) {
    const labels = { new: 'New', learning: 'Learning', review: 'Review', mastered: 'Mastered' };
    $('#status-line').text(
      `${card.status ? labels[card.status] || card.status : ''} · streak ${card.streak} · next in ${formatNext(card.nextReviewAt)}`
    );
  }

  function formatNext(iso) {
    if (!iso) return '—';
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return 'now';
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours} h`;
    return `${Math.round(hours / 24)} days`;
  }

  function loadCards(contentType) {
    hideMessages();
    api.get(`/api/${contentType}/random?count=10&userId=${currentUser.get() || ''}`)
      .done(function (res) {
        queue = res.items;
        if (!queue.length) {
          current = null;
          render();
          return;
        }
        nextCard();
      })
      .fail(function (err) {
        showError(err.message || 'Could not load cards');
        queue = [];
        current = null;
        render();
      });
  }

  function hideMessages() {
    $error.addClass('hidden');
    $empty.addClass('hidden');
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

  $('#content-type').on('change', function () {
    loadCards($(this).val());
  });

  currentUser
    .validate()
    .fail(function () {
      currentUser.clear();
      window.location.href = '/';
    });

  loadCards($('#content-type').val());
});
