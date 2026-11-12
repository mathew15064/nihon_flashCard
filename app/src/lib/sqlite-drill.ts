import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { verifiedSqliteCopy } from "./sqlite-snapshot";

type Digest = {
  schemaHash: string;
  rowsHash: string;
  tables: number;
  rows: number;
  migrations: number;
};

function readOnly(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec("PRAGMA query_only=ON");
  return db;
}

/** Only metadata and digests; never emit row content, users, passwords or tokens. */
export function inspectNihonSqlite(path: string, migrationsDirectory: string): Digest {
  const db = readOnly(path);
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok")
      throw new Error("DRILL_SQLITE_INTEGRITY_FAILED");
    if (db.prepare("PRAGMA foreign_key_check").get()) throw new Error("DRILL_FOREIGN_KEY_FAILED");

    const expected = readdirSync(migrationsDirectory)
      .filter(name => /^\d+_.*\.sql$/.test(name)).sort();
    if (expected.length < 1) throw new Error("DRILL_MIGRATIONS_UNAVAILABLE");
    const applied = db.prepare("SELECT filename, checksum FROM schema_migrations ORDER BY filename")
      .all() as { filename: string; checksum: string }[];
    if (applied.length !== expected.length) throw new Error("DRILL_MIGRATIONS_INCOMPLETE");
    for (let i = 0; i < expected.length; i++) {
      const filename = expected[i]!;
      const expectedChecksum = createHash("sha256")
        .update(readFileSync(join(migrationsDirectory, filename))).digest("hex");
      if (applied[i]?.filename !== filename || applied[i].checksum !== expectedChecksum)
        throw new Error("DRILL_MIGRATION_CHECKSUM_MISMATCH");
    }

    const objects = db.prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema " +
      "WHERE sql IS NOT NULL ORDER BY type, name"
    ).all() as { type: string; name: string; tbl_name: string; sql: string }[];
    const schemaHash = createHash("sha256");
    for (const object of objects) schemaHash.update(JSON.stringify(object)+"\n");
    const rowsHash = createHash("sha256");
    let tables = 0;
    let rows = 0;
    for (const object of objects) {
      if (object.type !== "table" || object.name.startsWith("sqlite_")) continue;
      tables++;
      // Quote sqlite_schema-derived identifiers; don't interpolate user input.
      const identifier = '"' + object.name.replaceAll('"', '""') + '"';
      const columns = db.prepare("PRAGMA table_info("+identifier+")").all();
      if (!columns.length) throw new Error("DRILL_TABLE_WITHOUT_COLUMNS");
      const order = columns.map((_,index)=>String(index+1)).join(",");
      const query = db.prepare("SELECT * FROM "+identifier+" ORDER BY "+order);
      rowsHash.update(JSON.stringify(["table", object.name])+"\n");
      for (const row of query.iterate()) {
        const values = Object.values(row).map(value =>
          value instanceof Uint8Array ? { blob: Buffer.from(value).toString("base64") }
            : typeof value === "bigint" ? { bigint: value.toString() } : value
        );
        rowsHash.update(JSON.stringify(values)+"\n");
        rows++;
      }
    }
    return {
      schemaHash:schemaHash.digest("hex"),rowsHash:rowsHash.digest("hex"),
      tables,rows,migrations:expected.length,
    };
  } finally { db.close(); }
}

/** Compare an immutable backup and restored file without revealing private rows. */
export function verifyRestoredPair(
  snapshotPath: string, restoredPath: string, migrationsDirectory: string,
): Digest {
  if (realpathSync(snapshotPath) === realpathSync(restoredPath))
    throw new Error("DRILL_SAME_DATABASE");
  const snapshot = inspectNihonSqlite(snapshotPath,migrationsDirectory);
  const restored = inspectNihonSqlite(restoredPath,migrationsDirectory);
  if (JSON.stringify(snapshot) !== JSON.stringify(restored))
    throw new Error("DRILL_RESTORED_MISMATCH");
  return snapshot;
}

/**
 * Disposable rehearsal. Source read-only, backup and restore in a new 0700
 * scratch folder, no DB replacement, cutover, deploy or migration execution.
 */
export async function drillNihonBackup(
  sourcePath:string, scratchRoot:string, migrationsDirectory:string,
):Promise<{ok:true;tables:number;rows:number;migrations:number;matching:true}> {
  const source=realpathSync(sourcePath);
  if (!statSync(source).isFile()) throw new Error("DRILL_SOURCE_NOT_FILE");
  const root=realpathSync(scratchRoot);
  if (!statSync(root).isDirectory()) throw new Error("DRILL_SCRATCH_NOT_DIRECTORY");
  // These are generated exclusively within the temp directory, never in DB_PATH.
  const folder=mkdtempSync(join(root,"nihon-restore-drill-"));
  try {
    const snapshot=join(folder,"backup.sqlite");
    const restored=join(folder,"restored.sqlite");
    await verifiedSqliteCopy(source,snapshot);
    await verifiedSqliteCopy(snapshot,restored);
    const data=verifyRestoredPair(snapshot,restored,migrationsDirectory);
    return {ok:true,tables:data.tables,rows:data.rows,
      migrations:data.migrations,matching:true};
  } finally {
    // Scratch copy contains private user data. Fail closed on cleanup errors.
    rmSync(folder,{recursive:true,force:true});
  }
}
