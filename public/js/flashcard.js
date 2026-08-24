'use strict';

$(function () {
  const SWIPE_THRESHOLD = 100; // px — minimum horizontal distance for a swipe answer
  const ESTIMATED_SECONDS_PER_CARD = 45; // rough "≈ N min" estimate for session UI
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
  const $progressLine = $('#progress-line');
  const $revealHint = $('#reveal-hint');
  const $imageWrap = $('#card-image-wrap');
  const $image = $('#card-image');
  const $imageSkeleton = $('#image-skeleton');
  const $lessonSelect = $('#lesson-select');
  const $sessionPanel = $('#session-panel');
  const $sessionList = $('#session-list');
  const $sessionSummary = $('#session-summary');

  let queue = [];
  let current = null;
  let totalCards = 0;
  let answeredCount = 0;
  let sessionMode = false; // studying a derived lesson session (not random mode)
  let currentSession = null; // { lesson, contentType, sessionIndex }
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

  // ---- vocabulary image ---------------------------------------------------

  function resetCardImage() {
    $imageWrap.addClass('hidden');
    $image.addClass('hidden').attr('src', ''); // never keep the previous card's photo
    $imageSkeleton.removeClass('hidden');
  }

  function showCardImage(item) {
    const meta = item && item.image;
    if (!meta || !meta.url) {
      resetCardImage();
      return;
    }
    $imageWrap.removeClass('hidden');
    $imageSkeleton.removeClass('hidden');
    $image.addClass('hidden');
    // Safe DOM assignment (no HTML interpolation of remote URLs).
    $image[0].alt = `${item.word} - ${localizedMeaning(item)}`;
    $image[0].onload = function () {
      $imageSkeleton.addClass('hidden');
      $image.removeClass('hidden');
    };
    $image[0].onerror = function () {
      // Broken/slow-blocked image: fall back to a normal text card.
      resetCardImage();
    };
    $image[0].src = meta.thumbnailUrl || meta.url;
  }

  function preloadNextImage() {
    // Preload only the next card's image for smoother swipes — never the whole deck.
    const next = queue[0];
    if (next && next.image && next.image.url) {
      const probe = new Image();
      probe.src = next.image.thumbnailUrl || next.image.url;
    }
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
    answeredCount += 1;
    updateProgress();

    const sides = cardSides(current, $('#content-type').val());
    $front.text(sides.front);
    resetCardImage();
    $revealHint.removeClass('hidden');
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

  function updateProgress() {
    if (!totalCards) {
      $progressLine.text('');
      return;
    }
    const base = `${Math.min(answeredCount, totalCards)} / ${totalCards}`;
    $progressLine.text(
      currentSession ? `L${currentSession.lesson} · S${currentSession.sessionIndex} · ${base}` : base
    );
  }

  // ---- lesson sessions ----------------------------------------------------

  function hideSessionPanel() {
    $sessionPanel.addClass('hidden');
  }

  async function loadLessons(contentType) {
    $lessonSelect.find('option:not(:first)').remove();
    try {
      const items = await api.get(`/api/${contentType}?limit=500`);
      const lessons = [...new Set(items.map((i) => i.lesson).filter((l) => l != null))]
        .sort((a, b) => a - b);
      lessons.forEach((l) => {
        $lessonSelect.append(
          $('<option></option>').val(l).text(I18n.t('session.lessonLabel', { n: l }))
        );
      });
    } catch (err) {
      /* lesson filter stays empty — random mode still works */
    }
  }

  function renderSessionPanel(data) {
    $sessionSummary.text(
      `${I18n.t('session.lessonLabel', { n: data.lesson })} · ${I18n.t('session.cards', { n: data.totalCards })} · ${I18n.t('session.sessionsCount', { n: data.totalSessions })}`
    );
    $sessionList.empty();

    const recommended = data.sessions.findIndex((s) => s.completed < s.count);
    data.sessions.forEach((s) => {
      const isDone = s.completed >= s.count;
      const state = isDone ? '✓' : s.completed > 0 ? '→' : '○';
      const minutes = Math.max(1, Math.round((s.count * ESTIMATED_SECONDS_PER_CARD) / 60));
      const statusText = isDone
        ? I18n.t('session.completed')
        : s.completed > 0 ? I18n.t('session.inProgress') : I18n.t('session.notStarted');
      const actionLabel = isDone
        ? I18n.t('session.start')
        : s.completed > 0 ? I18n.t('session.continueSession') : I18n.t('session.start');

      const $row = $(`
        <div class="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-slate-800 text-sm"></p>
            <p class="text-xs text-slate-400"></p>
            <div class="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden w-28">
              <div class="h-full bg-emerald-500"></div>
            </div>
          </div>
          <button class="shrink-0 min-h-[44px] px-5 rounded-xl text-white text-sm font-medium"></button>
        </div>
      `);

      $row.find('p.font-medium').text(
        `${state} S${s.sessionIndex} · ${statusText}` +
          (recommended === s.sessionIndex - 1 && !isDone ? ` · ${I18n.t('session.nextSession')}` : '')
      );
      $row.find('p.text-xs').text(`${I18n.t('session.cards', { n: s.count })} · ${I18n.t('session.minutes', { n: minutes })}`);
      $row.find('.h-full').css('width', `${s.progress}%`);
      const $btn = $row.find('button')
        .toggleClass('bg-emerald-500', !isDone)
        .toggleClass('bg-slate-400', isDone)
        .text(actionLabel)
        .on('click', () => startSession(s.sessionIndex));

      $sessionList.append($row);
    });

    $sessionPanel.removeClass('hidden');
    $cardWrap.addClass('hidden');
    $empty.addClass('hidden');
  }

  async function openLessonSessions(lesson) {
    hideMessages();
    hideSessionPanel();
    try {
      const data = await api.get(
        `/api/learning/${currentUser.get()}/sessions?contentType=${$('#content-type').val()}&lesson=${lesson}`
      );
      sessionMode = true;
      renderSessionPanel(data);
    } catch (err) {
      showError(err.message || I18n.t('session.loadError'));
    }
  }

  async function startSession(sessionIndex) {
    try {
      const res = await api.get(
        `/api/learning/${currentUser.get()}/sessions/cards?contentType=${$('#content-type').val()}&lesson=${$lessonSelect.val()}&session=${sessionIndex}`
      );
      currentSession = { lesson: Number($lessonSelect.val()), contentType: $('#content-type').val(), sessionIndex };
      sessionMode = true;
      hideSessionPanel();
      hideMessages();
      queue = res.items;
      totalCards = queue.length;
      answeredCount = 0;
      updateProgress();
      if (!queue.length) {
        current = null;
        renderCard();
        return;
      }
      nextCard();
    } catch (err) {
      showError(err.message || I18n.t('learn.loadError'));
    }
  }

  function exitToLessonOverview() {
    // Session finished — refresh derived progress and show the session list.
    if ($lessonSelect.val()) {
      loadLessons($('#content-type').val()).then(() => {
        $lessonSelect.val($lessonSelect.val()); // keep selection
        openLessonSessions($lessonSelect.val());
      });
    } else {
      sessionMode = false;
      currentSession = null;
      loadCards($('#content-type').val());
    }
  }

  function nextCard() {
    current = queue.shift();
    if (!current) {
      if (sessionMode) {
        // Session finished — go back to the lesson overview (progress refreshed).
        exitToLessonOverview();
        return;
      }
      loadCards($('#content-type').val());
      return;
    }
    preloadNextImage();
    renderCard();
  }

  function revealCard() {
    if (!current || revealed) return;
    revealed = true;
    $revealHint.addClass('hidden');
    showCardImage(current);
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
        totalCards = queue.length;
        answeredCount = 0;
        updateProgress();
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
    if (Math.abs(dx) <= 20) {
      $badge.addClass('hidden').css('opacity', 0);
      return;
    }
    // Feedback opacity grows with swipe distance (0 → 1 across the threshold).
    const strength = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);
    $badge
      .toggleClass('hidden', false)
      .css('opacity', strength);
    if (dx > 0) {
      $badge.removeClass('text-red-500 border-red-400 bg-red-50')
        .addClass('text-emerald-600 border-emerald-500 bg-emerald-50')
        .text(I18n.t('swipe.correct'));
    } else {
      $badge.removeClass('text-emerald-600 border-emerald-500 bg-emerald-50')
        .addClass('text-red-500 border-red-400 bg-red-50')
        .text(I18n.t('swipe.wrong'));
    }
  }

  function resetCardPosition() {
    dragging = false;
    dragMoved = false;
    deltaX = 0;
    $badge.addClass('hidden').css('opacity', 0);
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
    sessionMode = false;
    currentSession = null;
    $lessonSelect.val('');
    hideSessionPanel();
    loadLessons($(this).val());
    loadCards($(this).val());
  });

  $lessonSelect.on('change', function () {
    if (!$(this).val()) {
      sessionMode = false;
      currentSession = null;
      hideSessionPanel();
      loadCards($('#content-type').val());
    } else {
      openLessonSessions($(this).val());
    }
  });

  $(document).on('locale:changed', function () {
    // Refresh dynamic strings on the current card without losing state.
    I18n.apply();
    if (!$sessionPanel.hasClass('hidden') && $lessonSelect.val()) {
      openLessonSessions($lessonSelect.val()); // re-render translated session list
    }
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

  loadLessons($('#content-type').val());
  loadCards($('#content-type').val());
});
