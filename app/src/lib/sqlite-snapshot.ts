import { backup, DatabaseSync } from "node:sqlite";
import { closeSync, openSync, statSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Produce a consistent SQLite snapshot (including committed WAL content).
 * Source is opened read-only; destination MUST be a new file.
 * This never overwrites the running database or swaps a restore into place.
 */
export async function verifiedSqliteCopy(sourcePath: string, destinationPath: string) {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (source === destination) throw new Error("SOURCE_EQUALS_DESTINATION");
  if (!statSync(source).isFile()) throw new Error("SOURCE_NOT_A_FILE");

  // O_EXCL prevents clobbering existing databases, files or symbolic links.
  const fd = openSync(destination, "wx", 0o600);
  closeSync(fd);
  let sourceDb: DatabaseSync | undefined;
  try {
    sourceDb = new DatabaseSync(source, { readOnly: true });
    await backup(sourceDb, destination);
    const copiedDb = new DatabaseSync(destination, { readOnly: true });
    try {
      const checks = copiedDb.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
      if (checks.length !== 1 || checks[0]?.integrity_check !== "ok") {
        throw new Error("SQLITE_INTEGRITY_CHECK_FAILED");
      }
      const version = copiedDb.prepare("PRAGMA user_version").get() as { user_version: number };
      return { integrity: "ok", bytes: statSync(destination).size, userVersion: version.user_version };
    } finally {
      copiedDb.close();
    }
  } catch (error) {
    // Only clean up the destination created by this invocation.
    unlinkSync(destination);
    throw error;
  } finally {
    sourceDb?.close();
  }
}
