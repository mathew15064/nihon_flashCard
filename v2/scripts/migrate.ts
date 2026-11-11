import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const filename = resolve(process.env.DB_PATH || "./data/nihon.sqlite");
mkdirSync(dirname(filename), { recursive: true });
const sqlite = new DatabaseSync(filename);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA busy_timeout = 5000");
const sql = readFileSync(resolve("src/db/migrations/001_init.sql"), "utf8");
sqlite.exec(sql);
sqlite.close();
console.log("Nihon schema initialized:", filename);
