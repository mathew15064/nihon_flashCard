import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifiedSqliteCopy } from "../src/lib/sqlite-snapshot";

test("SQLite online backup and offline restore are verified, lossless and never overwrite", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nihon-snapshot-"));
  try {
    const original = join(dir, "original.sqlite");
    const first = join(dir, "snapshot.sqlite");
    const restored = join(dir, "restored.sqlite");
    const db = new DatabaseSync(original);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA user_version=5; CREATE TABLE reviews (id TEXT PRIMARY KEY, answer TEXT NOT NULL)");
    db.prepare("INSERT INTO reviews (id, answer) VALUES (?, ?)").run("review-1", "correct");
    // Backup while writer connection remains open, including WAL changes.
    const snapshot = await verifiedSqliteCopy(original, first);
    assert.equal(snapshot.integrity, "ok");
    assert.equal(snapshot.userVersion, 5);
    assert.ok(snapshot.bytes > 0);
    assert.equal(statSync(first).mode & 0o777, 0o600);
    const originalBefore = readFileSync(original);
    const copy = await verifiedSqliteCopy(first, restored);
    assert.equal(copy.integrity, "ok");
    const restoredDb = new DatabaseSync(restored, { readOnly: true });
    try {
      assert.deepEqual(restoredDb.prepare("SELECT id, answer FROM reviews").all().map(row => ({ ...row })),
        [{ id: "review-1", answer: "correct" }]);
    } finally { restoredDb.close(); }

    await assert.rejects(verifiedSqliteCopy(original, restored), { code: "EEXIST" });
    await assert.rejects(verifiedSqliteCopy(original, original), /SOURCE_EQUALS_DESTINATION/);
    assert.deepEqual(readFileSync(original), originalBefore);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
