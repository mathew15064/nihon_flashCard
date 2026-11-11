import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const filename = resolve(process.env.DB_PATH || "./data/nihon.sqlite");
mkdirSync(dirname(filename), { recursive: true });
const sqlite = new DatabaseSync(filename);
try {
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const directory = resolve("src/db/migrations");
  const files = readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const script = readFileSync(join(directory, file), "utf8");
    const checksum = createHash("sha256").update(script).digest("hex");
    const existing = sqlite.prepare("SELECT checksum FROM schema_migrations WHERE filename = ?").get(file) as {checksum: string} | undefined;
    if (existing) {
      if (existing.checksum !== checksum) throw new Error(`Migration changed after apply: ${file}`);
      continue;
    }
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite.exec(script);
      sqlite.prepare("INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES (?, ?, ?)")
        .run(file, checksum, new Date().toISOString());
      sqlite.exec("COMMIT");
      console.log("Applied:", file);
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  console.log("Nihon schema up to date:", filename);
} finally {
  sqlite.close();
}
