'use strict';

const jsonFile = require('../utils/json-file');
const { CONTENT_TYPES } = require('../constants/content-types');

const basic = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'wo'], ['ん', 'n']
];

const dakuten = [
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
  ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
  ['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo']
];

const handakuten = [
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po']
];

const combination = [
  ['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo'],
  ['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho'],
  ['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho'],
  ['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo'],
  ['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo'],
  ['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo'],
  ['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo'],
  ['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo'],
  ['じゃ', 'ja'], ['じゅ', 'ju'], ['じょ', 'jo'],
  ['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo'],
  ['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo']
];

function build(rows) {
  const groups = [['basic', basic], ['dakuten', dakuten], ['handakuten', handakuten], ['combination', combination]];
  const items = [];
  let n = 0;
  for (const [type, list] of groups) {
    for (const [character, romaji] of list) {
      if (rows && !rows.includes(character)) continue;
      n += 1;
      items.push({ id: `x_${String(n).padStart(3, '0')}`, character, romaji, type });
    }
  }
  return items;
}

function renumber(items, prefix) {
  return items.map((item, i) => ({
    ...item,
    id: `${prefix}_${String(i + 1).padStart(3, '0')}`
  }));
}

const katakanaMap = {
  'あ': 'ア', 'い': 'イ', 'う': 'ウ', 'え': 'エ', 'お': 'オ',
  'か': 'カ', 'き': 'キ', 'く': 'ク', 'け': 'ケ', 'こ': 'コ',
  'さ': 'サ', 'し': 'シ', 'す': 'ス', 'せ': 'セ', 'そ': 'ソ',
  'た': 'タ', 'ち': 'チ', 'つ': 'ツ', 'て': 'テ', 'と': 'ト',
  'な': 'ナ', 'に': 'ニ', 'ぬ': 'ヌ', 'ね': 'ネ', 'の': 'ノ',
  'は': 'ハ', 'ひ': 'ヒ', 'ふ': 'フ', 'へ': 'ヘ', 'ほ': 'ホ',
  'ま': 'マ', 'み': 'ミ', 'む': 'ム', 'め': 'メ', 'も': 'モ',
  'や': 'ヤ', 'ゆ': 'ユ', 'よ': 'ヨ',
  'ら': 'ラ', 'り': 'リ', 'る': 'ル', 'れ': 'レ', 'ろ': 'ロ',
  'わ': 'ワ', 'を': 'ヲ', 'ん': 'ン',
  'が': 'ガ', 'ぎ': 'ギ', 'ぐ': 'グ', 'げ': 'ゲ', 'ご': 'ゴ',
  'ざ': 'ザ', 'じ': 'ジ', 'ず': 'ズ', 'ぜ': 'ゼ', 'ぞ': 'ゾ',
  'だ': 'ダ', 'ぢ': 'ヂ', 'づ': 'ヅ', 'で': 'デ', 'ど': 'ド',
  'ば': 'バ', 'び': 'ビ', 'ぶ': 'ブ', 'べ': 'ベ', 'ぼ': 'ボ',
  'ぱ': 'パ', 'ぴ': 'ピ', 'ぷ': 'プ', 'ぺ': 'ペ', 'ぽ': 'ポ',
  'きゃ': 'キャ', 'きゅ': 'キュ', 'きょ': 'キョ',
  'しゃ': 'シャ', 'しゅ': 'シュ', 'しょ': 'ショ',
  'ちゃ': 'チャ', 'ちゅ': 'チュ', 'ちょ': 'チョ',
  'にゃ': 'ニャ', 'にゅ': 'ニュ', 'にょ': 'ニョ',
  'ひゃ': 'ヒャ', 'ひゅ': 'ヒュ', 'ひょ': 'ヒョ',
  'みゃ': 'ミャ', 'みゅ': 'ミュ', 'みょ': 'ミョ',
  'りゃ': 'リャ', 'りゅ': 'リュ', 'りょ': 'リョ',
  'ぎゃ': 'ギャ', 'ぎゅ': 'ギュ', 'ぎょ': 'ギョ',
  'じゃ': 'ジャ', 'じゅ': 'ジュ', 'じょ': 'ジョ',
  'びゃ': 'ビャ', 'びゅ': 'ビュ', 'びょ': 'ビョ',
  'ぴゃ': 'ピャ', 'ぴゅ': 'ピュ', 'ぴょ': 'ピョ'
};

const hiragana = renumber(build(), CONTENT_TYPES.HIRAGANA);
const katakana = renumber(
  build().map((i) => ({ ...i, character: katakanaMap[i.character] })),
  CONTENT_TYPES.KATAKANA
);

(async () => {
  await jsonFile.write('content/hiragana.json', hiragana);
  await jsonFile.write('content/katakana.json', katakana);
  console.log(`Seeded ${hiragana.length} hiragana, ${katakana.length} katakana.`);
})();
