import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
const dbPath = resolve(process.env.DB_PATH || "./data/nihon.sqlite");
if (!dbPath.endsWith("nihon.sqlite") && !process.env.NIHON_ALLOW_DEMO_SEED) {
  throw new Error("Refusing to seed a non-demo database. Set NIHON_ALLOW_DEMO_SEED only for isolated development.");
}
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");
const words = [
  { word: "食べる", reading: "たべる", romaji: "taberu", meaning: "ăn", level: "N5" },
  { word: "日本", reading: "にほん", romaji: "nihon", meaning: "Nhật Bản", level: "N5" },
  { word: "水", reading: "みず", romaji: "mizu", meaning: "nước", level: "N5" },
  { word: "学校", reading: "がっこう", romaji: "gakkou", meaning: "trường học", level: "N5" },
  { word: "友達", reading: "ともだち", romaji: "tomodachi", meaning: "bạn bè", level: "N5" },
];
const now = new Date().toISOString();
db.exec("BEGIN IMMEDIATE");
try {
  const insert = db.prepare("INSERT OR IGNORE INTO vocabulary_entries (id,language,word,reading,romanization,jlpt_level,normalized_key,status,source,created_at,updated_at) VALUES (?, 'ja', ?, ?, ?, ?, ?, 'published', 'demo', ?, ?)");
  const sense = db.prepare("INSERT INTO vocabulary_senses (id,entry_id,language,meaning,sort_order) VALUES (?, ?, 'vi', ?, 0)");
  for (const w of words) {
    const id = randomUUID();
    const key = [w.word,w.reading,""].map(v=>v.normalize("NFKC").toLowerCase().trim()).join("|");
    const info = insert.run(id,w.word,w.reading,w.romaji,w.level,key,now,now);
    if (info.changes) sense.run(randomUUID(),id,w.meaning);
  }
  db.exec("COMMIT");
} catch(e){db.exec("ROLLBACK");throw e;} finally{db.close();}
console.log("Demo vocabulary seeded to:",dbPath);
