'use strict';

const jsonFile = require('../utils/json-file');
const { CONTENT_TYPES } = require('../constants/content-types');

const kanji = [
  { kanji: '日', onyomi: ['ニチ', 'ジツ'], kunyomi: ['ひ', 'か'], meanings: ['day', 'sun'], jlpt: 'N5', lesson: 1, examples: [{ word: '日本', reading: 'にほん', meaning: 'Japan' }] },
  { kanji: '一', onyomi: ['イチ'], kunyomi: ['ひと'], meanings: ['one'], jlpt: 'N5', lesson: 1, examples: [{ word: '一人', reading: 'ひとり', meaning: 'one person' }] },
  { kanji: '人', onyomi: ['ジン', 'ニン'], kunyomi: ['ひと'], meanings: ['person'], jlpt: 'N5', lesson: 1, examples: [{ word: '日本人', reading: 'にほんじん', meaning: 'Japanese person' }] },
  { kanji: '国', onyomi: ['コク'], kunyomi: ['くに'], meanings: ['country'], jlpt: 'N5', lesson: 2, examples: [{ word: '外国', reading: 'がいこく', meaning: 'foreign country' }] },
  { kanji: '行', onyomi: ['コウ'], kunyomi: ['い', 'ゆ'], meanings: ['to go'], jlpt: 'N5', lesson: 2, examples: [{ word: '旅行', reading: 'りょこう', meaning: 'travel' }] },
  { kanji: '時', onyomi: ['ジ'], kunyomi: ['とき'], meanings: ['time', 'hour'], jlpt: 'N5', lesson: 3, examples: [{ word: '時間', reading: 'じかん', meaning: 'time' }] },
  { kanji: '語', onyomi: ['ゴ'], kunyomi: [], meanings: ['language'], jlpt: 'N5', lesson: 3, examples: [{ word: '日本語', reading: 'にほんご', meaning: 'Japanese language' }] }
];

const vocabulary = [
  { word: 'わたし', reading: 'わたし', meaning: 'I, me', lesson: 1, category: 'pronoun', notes: '' },
  { word: 'あなた', reading: 'あなた', meaning: 'you', lesson: 1, category: 'pronoun', notes: '' },
  { word: 'あの人', reading: 'あのひと', meaning: 'that person', lesson: 1, category: 'noun', notes: '' },
  { word: '先生', reading: 'せんせい', meaning: 'teacher', lesson: 1, category: 'noun', notes: '' },
  { word: '学生', reading: 'がくせい', meaning: 'student', lesson: 1, category: 'noun', notes: '' },
  { word: '会社員', reading: 'かいしゃいん', meaning: 'company employee', lesson: 1, category: 'noun', notes: '' },
  { word: 'これ', reading: 'これ', meaning: 'this (thing)', lesson: 2, category: 'demonstrative', notes: '' },
  { word: 'それ', reading: 'それ', meaning: 'that (thing)', lesson: 2, category: 'demonstrative', notes: '' },
  { word: 'あれ', reading: 'あれ', meaning: 'that over there', lesson: 2, category: 'demonstrative', notes: '' },
  { word: '本', reading: 'ほん', meaning: 'book', lesson: 2, category: 'noun', notes: '' },
  { word: '辞書', reading: 'じしょ', meaning: 'dictionary', lesson: 2, category: 'noun', notes: '' },
  { word: '新聞', reading: 'しんぶん', meaning: 'newspaper', lesson: 2, category: 'noun', notes: '' },
  { word: '食べる', reading: 'たべる', meaning: 'to eat', lesson: 3, category: 'verb', notes: '' },
  { word: '飲む', reading: 'のむ', meaning: 'to drink', lesson: 3, category: 'verb', notes: '' },
  { word: '学校', reading: 'がっこう', meaning: 'school', lesson: 3, category: 'noun', notes: '' }
];

(async () => {
  const pad = (n) => String(n).padStart(3, '0');
  const kanjiItems = kanji.map((k, i) => ({ id: `${CONTENT_TYPES.KANJI}_${pad(i + 1)}`, ...k }));
  const vocabItems = vocabulary.map((v, i) => ({ id: `${CONTENT_TYPES.VOCABULARY}_${pad(i + 1)}`, ...v }));
  await jsonFile.write('content/kanji.json', kanjiItems);
  await jsonFile.write('content/vocabulary.json', vocabItems);
  console.log(`Seeded ${kanjiItems.length} kanji, ${vocabItems.length} vocabulary.`);
})();
