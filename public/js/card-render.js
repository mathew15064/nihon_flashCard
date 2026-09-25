'use strict';

/*
 * Shared card-side rendering for learn and review pages.
 * Keeps the exact same logic that was previously duplicated
 * between flashcard.js and review.js.
 */
window.CardRender = (function () {
  function localizedMeaning(item) {
    if (item.meaning && typeof item.meaning === 'object') {
      return item.meaning[I18n.locale()] || item.meaning.en || item.meaning.vi || '';
    }
    const base = (item.meaning || '').trim();
    const vi = (item.meaningVi || '').trim();
    return I18n.locale() === 'vi' ? (vi || base) : (base || vi);
  }

  function buildSides(contentType, content) {
    if (contentType === 'kanji') {
      return {
        front: content.kanji,
        reading: '',
        romanization: '',
        main: (content.meanings || []).join(', ') || '—',
        extra: [
          content.onyomi && content.onyomi.length ? 'On: ' + content.onyomi.join('、') : '',
          content.kunyomi && content.kunyomi.length ? 'Kun: ' + content.kunyomi.join('、') : ''
        ].filter(Boolean).join(' · ')
      };
    }
    if (contentType === 'vocabulary') {
      return {
        front: content.word,
        reading: content.reading && content.reading !== content.word ? content.reading : '',
        romanization: content.romanization || '',
        main: localizedMeaning(content) || '—',
        extra: content.category || ''
      };
    }
    return {
      front: content.character,
      reading: '',
      romanization: content.romaji || '',
      main: '',
      extra: ''
    };
  }

  // (item, contentType) — item is a raw content object (learn page)
  function fromContent(item, contentType) {
    return buildSides(contentType, item);
  }

  // (card) — card is { contentType, cardId, content } (review page)
  function fromCard(card) {
    return buildSides(card.contentType, card.content || {});
  }

  return { localizedMeaning, fromContent, fromCard };
})();
