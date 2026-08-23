'use strict';

$(function () {
  const SWIPE_THRESHOLD = 100; // px — minimum horizontal distance for a swipe answer
  const $card = $('#card');
  const $cardWrap = $('#card-wrap');
  const $front = $('#card-front');
  const $back = $('#card-back');
  const $answerReading = $('#answer-reading');
  const $answerRomanization = $('#answer-romanization');
  const $answerMain = $('#answer-main');
  const $answerExtra = $('#answer-extra');
  const $badge = $('#swipe-badge');
  const $empty = $('#empty-state');
  const $error = $('#error');
  const $reveal = $('#reveal-btn');
  const $correct = $('#correct-btn');
  const $wrong = $('#wrong-btn');

  let queue = [];
  let current = null;
  let revealed = false;
  let answered = false;
  let submitting = false;
  let dragging = false;
  let dragMoved = false;
  let dragStartX = 0;
  let deltaX = 0;

  // ---- content rendering -------------------------------------------------

  function localizedMeaning(item) {
    // Content translation fallback: selected locale -> English -> Vietnamese -> raw
    if (item.meaning && typeof item.meaning === 'object') {
      return item.meaning[I18n.locale()] || item.meaning.en || item.meaning.vi || '';
    }
    const base = (item.meaning || '').trim();
    const vi = (item.meaningVi || '').trim();
    return I18n.locale() === 'vi' ? (vi || base) : (base || vi);
  }

  function cardSides(item, contentType) {
    if (contentType === 'kanji') {
      return {
        front: item.kanji,
        reading: '',
        romanization: '',
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
        reading: item.reading && item.reading !== item.word ? item.reading : '',
        romanization: item.romanization || '',
        main: localizedMeaning(item) || '—',
        extra: item.category || ''
      };
    }
    return {
      front: item.character,
      reading: '',
      romanization: item.romaji || '',
      main: '',
      extra: ''
    };
  }

  function showError(msg) {
    $error.text(msg).removeClass('hidden');
  }

  function hideMessages() {
    $error.addClass('hidden');
    $empty.addClass('hidden');
  }

  function setText($el, text) {
    $el.toggleClass('hidden', !text).text(text || '');
  }

  // ---- flashcard lifecycle ----------------------------------------------

  function renderCard() {
    if (!current) {
      $cardWrap.addClass('hidden');
      if ($error.hasClass('hidden')) {
        $empty.removeClass('hidden');
      }
      return;
    }
    $empty.addClass('hidden');
    $cardWrap.removeClass('hidden');
    revealed = false;
    answered = false;

    const sides = cardSides(current, $('#content-type').val());
    $front.text(sides.front);
    setText($answerReading, '');
    setText($answerRomanization, '');
    $answerMain.text('');
    $answerExtra.text('');
    $back.addClass('hidden');

    resetCardPosition();
    $reveal.prop('disabled', false);
    $correct.add($wrong).prop('disabled', true);
    $('#status-line').text('');
  }

  function nextCard() {
    current = queue.shift();
    if (!current) {
      loadCards($('#content-type').val());
      return;
    }
    renderCard();
  }

  function revealCard() {
    if (!current || revealed) return;
    revealed = true;
    const sides = cardSides(current, $('#content-type').val());
    setText($answerReading, sides.reading);
    setText($answerRomanization, sides.romanization);
    $answerMain.text(sides.main);
    $answerExtra.text(sides.extra);
    $back.removeClass('hidden');
    $reveal.prop('disabled', true);
    $correct.add($wrong).prop('disabled', false);
  }

  // Single entry point for every answering mechanism (buttons, keyboard, swipe).
  function handleAnswer(result) {
    if (!revealed || !current || answered || submitting) return;
    answered = true; // block duplicate submissions immediately
    submitting = true;
    $correct.add($wrong).prop('disabled', true);
    $reveal.prop('disabled', true);

    api
      .post(`/api/learning/${currentUser.get()}/review`, {
        contentType: $('#content-type').val(),
        contentId: current.id,
        result
      })
      .done(function (card) {
        // Advance ONLY on API success.
        showStatus(card);
        submitting = false;
        nextCard();
      })
      .fail(function (err) {
        // Keep the current card so the user can retry.
        answered = false;
        submitting = false;
        showError(err.message || I18n.t('learn.error'));
        resetCardPosition();
      });
  }

  function showStatus(card) {
    const labels = {
      new: I18n.t('status.new'),
      learning: I18n.t('status.learning'),
      review: I18n.t('status.review'),
      mastered: I18n.t('status.mastered')
    };
    $('#status-line').text(
      `${card.status ? labels[card.status] || card.status : ''} · ${I18n.t('status.streak')} ${card.streak} · ${I18n.t('status.nextIn')} ${formatNext(card.nextReviewAt)}`
    );
  }

  function formatNext(iso) {
    if (!iso) return '—';
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return I18n.t('status.now');
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `${mins} ${I18n.t('status.min')}`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours} ${I18n.t('status.hour')}`;
    return `${Math.round(hours / 24)} ${I18n.t('status.days')}`;
  }

  function loadCards(contentType) {
    hideMessages();
    api.get(`/api/${contentType}/random?count=10&userId=${currentUser.get() || ''}`)
      .done(function (res) {
        queue = res.items;
        if (!queue.length) {
          current = null;
          renderCard();
          return;
        }
        nextCard();
      })
      .fail(function (err) {
        showError(err.message || I18n.t('learn.loadError'));
        queue = [];
        current = null;
        renderCard();
      });
  }

  // ---- swipe gestures -----------------------------------------------------

  function setBadge(dx) {
    if (dx > 20) {
      $badge.removeClass('hidden text-red-500 border-red-400 bg-red-50')
        .addClass('text-emerald-600 border-emerald-500 bg-emerald-50')
        .text(I18n.t('swipe.correct'));
    } else if (dx < -20) {
      $badge.removeClass('hidden text-emerald-600 border-emerald-500 bg-emerald-50')
        .addClass('text-red-500 border-red-400 bg-red-50')
        .text(I18n.t('swipe.wrong'));
    } else {
      $badge.addClass('hidden');
    }
  }

  function resetCardPosition() {
    dragging = false;
    dragMoved = false;
    deltaX = 0;
    $badge.addClass('hidden');
    // New card MUST start from translateX(0) / opacity 1.
    $card.css({ transition: 'transform 0.2s ease', transform: '', opacity: '' });
  }

  function flyOut(result) {
    const width = $card.outerWidth() || 300;
    const dir = result === 'correct' ? 1 : -1;
    $badge.addClass('hidden');
    // Purely visual: the answer pipeline runs immediately via handleAnswer;
    // nextCard()/renderCard() will restore transform + opacity.
    $card.css({
      transition: 'transform 0.25s ease-in, opacity 0.25s ease-in',
      transform: `translateX(${dir * (width + 120)}px) rotate(${dir * 12}deg)`,
      opacity: '0'
    });
    handleAnswer(result);
  }

  function handleSwipeStart(e) {
    // Swipe answers only when revealed and not already submitted.
    if (!revealed || answered || submitting || !current || e.button > 0) return;
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    deltaX = 0;
    $card.css('transition', 'none');
  }

  function handleSwipeMove(e) {
    if (!dragging) return;
    deltaX = e.clientX - dragStartX;
    if (Math.abs(deltaX) > 5) dragMoved = true; // suppress click-reveal after a real drag
    $card.css(
      'transform',
      `translateX(${deltaX}px) rotate(${deltaX * 0.05}deg)`
    );
    setBadge(deltaX);
  }

  function handleSwipeEnd() {
    if (!dragging) return;
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      flyOut(deltaX > 0 ? 'correct' : 'wrong');
    } else {
      resetCardPosition();
    }
  }

  // ---- events -------------------------------------------------------------

  $card.on('pointerdown', handleSwipeStart);
  $(document).on('pointermove', handleSwipeMove);
  $(document).on('pointerup', handleSwipeEnd);
  // pointercancel (e.g. browser takes over for scrolling) must NEVER answer.
  $(document).on('pointercancel', function () {
    if (!dragging) return;
    resetCardPosition();
  });

  $card.on('click', function () {
    if (dragMoved) return; // ignore clicks that were actually drags
    revealCard();
  });

  function handleKeyboard(e) {
    if (e.code === 'Space') { e.preventDefault(); revealed ? nextCard() : revealCard(); }
    else if (e.code === 'ArrowRight' && revealed) handleAnswer('correct');
    else if (e.code === 'ArrowLeft' && revealed) handleAnswer('wrong');
  }
  $(document).on('keydown', handleKeyboard);

  $reveal.on('click', revealCard);
  $correct.on('click', () => handleAnswer('correct'));
  $wrong.on('click', () => handleAnswer('wrong'));

  $('#content-type').on('change', function () {
    loadCards($(this).val());
  });

  $(document).on('locale:changed', function () {
    // Refresh dynamic strings on the current card without losing state.
    I18n.apply();
    if (current) {
      if (revealed) {
        const s = cardSides(current, $('#content-type').val());
        setText($answerReading, s.reading);
        setText($answerRomanization, s.romanization);
        $answerMain.text(s.main);
        $answerExtra.text(s.extra);
      }
      $('#status-line').text('');
    }
  });

  currentUser
    .validate()
    .fail(function () {
      currentUser.clear();
      window.location.href = '/';
    });

  loadCards($('#content-type').val());
});
