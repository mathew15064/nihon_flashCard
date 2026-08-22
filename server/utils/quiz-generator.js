'use strict';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sampleOthers(pool, excludeId, count) {
  const candidates = pool.filter((i) => i.id !== excludeId);
  return shuffle(candidates).slice(0, count);
}

/* Field extractors per content type.
   front: the Japanese side shown as prompt (or option in reverse questions)
   back:  the meaning/reading side */
const FIELDS = {
  hiragana: {
    jp: (i) => i.character,
    meaning: (i) => i.romaji,
    reading: null
  },
  katakana: {
    jp: (i) => i.character,
    meaning: (i) => i.romaji,
    reading: null
  },
  kanji: {
    jp: (i) => i.kanji,
    meaning: (i) => (i.meanings || []).join(', ') || null,
    reading: (i) => (i.kunyomi && i.kunyomi[0]) || (i.onyomi && i.onyomi[0]) || null
  },
  vocabulary: {
    jp: (i) => i.word,
    meaning: (i) => i.meaning || null,
    reading: (i) => (i.reading && i.reading !== i.word ? i.reading : null)
  }
};

function typesFor(contentType) {
  if (contentType === 'hiragana' || contentType === 'katakana') {
    return ['jp-to-meaning', 'meaning-to-jp'];
  }
  if (contentType === 'mixed') {
    return ['jp-to-meaning', 'meaning-to-jp', 'jp-to-reading', 'reading-to-jp'];
  }
  // kanji / vocabulary
  return ['jp-to-meaning', 'meaning-to-jp', 'jp-to-reading', 'reading-to-jp'];
}

function buildQuestion(questionId, contentType, item, distractors, questionType) {
  const f = FIELDS[contentType];
  let prompt;
  let correctText;

  if (questionType === 'jp-to-meaning') {
    prompt = f.jp(item);
    correctText = f.meaning(item);
  } else if (questionType === 'meaning-to-jp') {
    prompt = f.meaning(item);
    correctText = f.jp(item);
  } else if (questionType === 'jp-to-reading') {
    prompt = f.jp(item);
    correctText = f.reading(item);
  } else if (questionType === 'reading-to-jp') {
    prompt = f.reading(item);
    correctText = f.jp(item);
  }

  if (!prompt || !correctText) return null;

  const distractorTexts = [];
  const seen = new Set([correctText]);
  for (const d of distractors) {
    const text =
      questionType === 'meaning-to-jp' || questionType === 'reading-to-jp'
        ? f.jp(d)
        : questionType === 'jp-to-reading'
          ? f.reading(d)
          : f.meaning(d);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    distractorTexts.push(text);
    if (distractorTexts.length === 3) break;
  }
  if (distractorTexts.length < 2) return null; // not enough valid distractors

  const texts = shuffle([correctText, ...distractorTexts]);
  const options = texts.map((text, idx) => ({ id: OPTION_LETTERS[idx], text }));
  const correctOptionId = options.find((o) => o.text === correctText).id;

  return {
    questionId,
    contentType,
    contentRef: item.id,
    questionType,
    prompt,
    options,
    _correctOptionId: correctOptionId
  };
}

function generateQuestions({ questionType, sourcePools }) {
  // sourcePools: { [type]: items[] } — one entry per selected content type
  const types = Object.keys(sourcePools);
  const questions = [];

  const attempts = [];
  for (const type of types) {
    for (const item of sourcePools[type]) attempts.push({ type, item });
  }
  shuffle(attempts);

  const requested = questionType === 'random' ? null : questionType;

  for (const { type, item } of attempts) {
    const validTypes = typesFor(type);
    let qType = requested;
    if (!qType) {
      qType = validTypes[Math.floor(Math.random() * validTypes.length)];
    }
    if (!validTypes.includes(qType)) continue;

    // distractors must come from the same content type
    const others = sampleOthers(sourcePools[type], item.id, 6);
    const q = buildQuestion(
      `quiz_q_${String(questions.length + 1).padStart(3, '0')}`,
      type,
      item,
      others,
      qType
    );
    if (q) questions.push(q);
  }

  return questions;
}

module.exports = { generateQuestions, typesFor, FIELDS, OPTION_LETTERS };
