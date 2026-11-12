#!/usr/bin/env node
/**
 * Offline acceptance check for the T01 N5 fixture.
 * No network, database, MCP call, or write operation is performed.
 *
 * Usage: node app/scripts/validate-n5-100.mjs [path-to-json] [--self-test]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const defaultFixture = fileURLToPath(new URL("../fixtures/jlpt-n5-100.json", import.meta.url));
const requiredFields = ["word", "reading", "romanization", "meaningVi", "jlptLevel"];
const singleKana = {
  あ:"a",い:"i",う:"u",え:"e",お:"o",
  か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",
  さ:"sa",し:"shi",す:"su",せ:"se",そ:"so",
  た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",
  な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no",
  は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",
  ま:"ma",み:"mi",む:"mu",め:"me",も:"mo",
  や:"ya",ゆ:"yu",よ:"yo",
  ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro",
  わ:"wa",を:"wo",ん:"n",
  が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go",
  ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",
  だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do",
  ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",
  ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po",
  ゔ:"vu",
};
const combinedKana = {
  きゃ:"kya",きゅ:"kyu",きょ:"kyo",ぎゃ:"gya",ぎゅ:"gyu",ぎょ:"gyo",
  しゃ:"sha",しゅ:"shu",しょ:"sho",じゃ:"ja",じゅ:"ju",じょ:"jo",
  ちゃ:"cha",ちゅ:"chu",ちょ:"cho",にゃ:"nya",にゅ:"nyu",にょ:"nyo",
  ひゃ:"hya",ひゅ:"hyu",ひょ:"hyo",びゃ:"bya",びゅ:"byu",びょ:"byo",
  ぴゃ:"pya",ぴゅ:"pyu",ぴょ:"pyo",みゃ:"mya",みゅ:"myu",みょ:"myo",
  りゃ:"rya",りゅ:"ryu",りょ:"ryo",
};
const invalidInvisible = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const japaneseWord = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+$/u;
const kanaReading = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const asciiHepburn = /^[a-z]+(?:[' -][a-z]+)*$/u;
const vietnameseMeaning = /^[\p{Script=Latin}\p{M}\p{N} ,;:.!?()'/-]+$/u;

function normalizeKey(item) {
  // Identical to app/src/modules/vocabulary/normalize.ts when partOfSpeech is absent.
  return [item.word, item.reading, ""]
    .map(value => value.normalize("NFKC").toLowerCase().trim()).join("|");
}

function hiragana(reading) {
  // Convert katakana to hiragana; long-vowel marks are preserved.
  return [...reading].map(char => {
    const point = char.codePointAt(0);
    return point >= 0x30a1 && point <= 0x30f6
      ? String.fromCodePoint(point - 0x60) : char;
  }).join("");
}

function romanize(reading) {
  const chars = [...hiragana(reading)];
  let output = "";
  for (let index = 0; index < chars.length; index++) {
    const ch = chars[index];
    if (ch === "ー") {
      const vowel = output.match(/[aeiou]$/u)?.[0];
      if (!vowel) throw new Error("dấu kéo dài âm không có nguyên âm trước");
      output += vowel;
      continue;
    }
    if (ch === "っ") {
      const next = combinedKana[ch + (chars[index + 1] || "")] ||
        combinedKana[(chars[index + 1] || "") + (chars[index + 2] || "")] ||
        singleKana[chars[index + 1]];
      if (!next) throw new Error("âm ngắt っ không đứng trước âm hợp lệ");
      output += next.startsWith("ch") ? "t" : next[0];
      continue;
    }
    const combo = combinedKana[ch + (chars[index + 1] || "")];
    const syllable = combo || singleKana[ch];
    if (!syllable) throw new Error('kana không được hỗ trợ: "' + ch + '"');
    if (ch === "ん") {
      const next = chars[index + 1] || "";
      output += /^[あいうえおやゆよ]$/u.test(next) ? "n'" : "n";
    } else {
      output += syllable;
    }
    if (combo) index++;
  }
  return output;
}

function validate(fixture) {
  const errors = [];
  const err = (location, message) => errors.push(location + ": " + message);
  const strictFields = (value, expected, location) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      err(location, "phải là object"); return false;
    }
    for (const name of expected) if (!Object.hasOwn(value, name)) {
      err(location, "thiếu trường " + name);
    }
    for (const name of Object.keys(value)) if (!expected.includes(name)) {
      err(location, "trường ngoài schema: " + name);
    }
    return true;
  };
  const validText = (value, location, min, max, regex) => {
    if (typeof value !== "string" || value.length < min || value.length > max) {
      err(location, "phải là chuỗi dài " + min + "–" + max + " ký tự"); return false;
    }
    if (value !== value.trim() || value !== value.normalize("NFC")) {
      err(location, "chưa trim hoặc chưa chuẩn hóa Unicode NFC");
    }
    if (invalidInvisible.test(value) || !regex.test(value)) {
      err(location, "có ký tự không hợp lệ/điều khiển");
      return false;
    }
    return true;
  };

  if (!strictFields(fixture, ["topicName", "lessons"], "fixture")) return errors;
  validText(fixture.topicName, "topicName", 2, 100,
    /^[\p{Script=Latin}\p{M}\p{N} –-]+$/u);
  if (!Array.isArray(fixture.lessons)) {
    err("lessons", "phải là mảng"); return errors;
  }
  if (fixture.lessons.length !== 5) err("lessons", "phải có đúng 5 bài học");
  const lessonNames = new Set();
  const keys = new Map();
  let total = 0;
  for (const [li, lesson] of fixture.lessons.entries()) {
    const location = "lessons[" + li + "]";
    if (!strictFields(lesson, ["lessonName", "items"], location)) continue;
    if (validText(lesson.lessonName, location + ".lessonName", 2, 100,
      /^[\p{Script=Latin}\p{M}\p{N} ,–-]+$/u)) {
      const key = lesson.lessonName.normalize("NFKC").toLowerCase().trim();
      if (lessonNames.has(key)) err(location, "tên bài học trùng");
      lessonNames.add(key);
    }
    if (!Array.isArray(lesson.items)) {
      err(location + ".items", "phải là mảng"); continue;
    }
    if (lesson.items.length !== 20) err(location + ".items", "phải có đúng 20 từ");
    if (lesson.items.length > 100) err(location + ".items", "vượt giới hạn Batch 100");
    total += lesson.items.length;
    for (const [wi, item] of lesson.items.entries()) {
      const at = location + ".items[" + wi + "]";
      if (!strictFields(item, requiredFields, at)) continue;
      const wordOk = validText(item.word, at + ".word", 1, 120, japaneseWord);
      const readingOk = validText(item.reading, at + ".reading", 1, 120, kanaReading);
      const romajiOk = validText(item.romanization, at + ".romanization", 1, 120, asciiHepburn);
      validText(item.meaningVi, at + ".meaningVi", 1, 500, vietnameseMeaning);
      if (item.jlptLevel !== "N5") err(at + ".jlptLevel", "phải là N5 (nhãn dự kiến)");
      if (wordOk && readingOk) {
        const key = normalizeKey(item);
        if (keys.has(key)) err(at, "trùng normalizedKey với " + keys.get(key));
        else keys.set(key, at);
      }
      if (readingOk && romajiOk) {
        try {
          const expected = romanize(item.reading);
          if (item.romanization !== expected) {
            err(at + ".romanization", 'sai so với reading: "' + expected + '"');
          }
        } catch (error) {
          err(at + ".reading", error.message);
        }
      }
    }
  }
  if (total !== 100) err("fixture", "Tổng số từ phải bằng 100, thực tế " + total);
  return errors;
}

function selfTest(data) {
  const change = modify => {
    const copy = structuredClone(data);
    modify(copy);
    return validate(copy);
  };
  const cases = [
    ["sai số lượng", d => d.lessons[4].items.pop(), "Tổng số từ"],
    ["thiếu meaningVi", d => delete d.lessons[0].items[0].meaningVi, "thiếu trường meaningVi"],
    ["word có ký tự lạ", d => d.lessons[0].items[0].word += "!", "ký tự không hợp lệ"],
    ["reading có ký tự Latin", d => d.lessons[0].items[0].reading += "A", "ký tự không hợp lệ"],
    ["trùng khóa NFKC", d => {
      d.lessons[4].items[19] = { ...d.lessons[0].items[0] };
    }, "trùng normalizedKey"],
    ["romaji không khớp", d => d.lessons[0].items[0].romanization = "watasi",
      "sai so với reading"],
    ["JLPT ngoài N5", d => d.lessons[0].items[0].jlptLevel = "N4", "phải là N5"],
    ["trường ngoài schema", d => d.lessons[0].items[0].status = "published",
      "trường ngoài schema"],
  ];
  for (const [title, modify, expected] of cases) {
    if (!change(modify).some(message => message.includes(expected))) {
      throw new Error("SELF-TEST FAIL: " + title);
    }
    console.log("SELF-TEST PASS: " + title);
  }
}

const args = process.argv.slice(2);
const selfTestRequested = args.includes("--self-test");
const fileArgs = args.filter(arg => arg !== "--self-test");
if (fileArgs.length > 1) {
  console.error("Usage: node app/scripts/validate-n5-100.mjs [path-to-json] [--self-test]");
  process.exitCode = 2;
} else {
  try {
    const filename = fileArgs[0] ? resolve(fileArgs[0]) : defaultFixture;
    const data = JSON.parse(readFileSync(filename, "utf8"));
    const errors = validate(data);
    if (errors.length) {
      for (const message of errors) console.error("FAIL " + message);
      console.error("FAIL: " + errors.length + " lỗi; không được nạp fixture.");
      process.exitCode = 1;
    } else {
      const count = data.lessons.reduce((sum, lesson) => sum + lesson.items.length, 0);
      console.log("PASS: " + count + " từ N5 dự kiến / " + data.lessons.length +
        " bài học / 100 normalizedKey duy nhất; kana–romaji và trường dữ liệu hợp lệ.");
      if (selfTestRequested) selfTest(data);
    }
  } catch (error) {
    console.error("FAIL: " + error.message);
    process.exitCode = 1;
  }
}
