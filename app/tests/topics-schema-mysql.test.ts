import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { migrateFreshMySQL, openMySQL } from "../src/db/mysql/connector";
import { mysqlTopics } from "../src/db/mysql/topics";
import { mysqlDecks } from "../src/db/mysql/decks";
import { decks, topics, vocabularyEntries, vocabularySenses, reviewCards } from "../src/db/mysql/schema";

const upgradePath = "src/db/mysql/migrations/20261112180000_topics_lessons/migration.sql";
test("topics upgrade is additive and lesson identity has a unique database index", () => {
  const script = readFileSync(upgradePath, "utf8");
  assert.doesNotMatch(script, /\b(drop|truncate|update|rename)\b|\bdelete\s+from\b/i);
  const topicConfig = getTableConfig(topics);
  assert.ok(topicConfig.indexes.some(i => i.config.name === "uq_topics_slug" && i.config.unique));
  const deckConfig = getTableConfig(decks);
  assert.ok(deckConfig.indexes.some(i => i.config.name === "uq_decks_lesson_key" && i.config.unique));
  assert.equal(decks.topicId.notNull, false);
  assert.equal(decks.lessonKey.notNull, false);
});

test("isolated MySQL upgrades legacy rows, deduplicates concurrent lessons and filters public data", {
  skip: !process.env.NIHON_MYSQL_TEST_URL,
}, async () => {
  const source = new URL(process.env.NIHON_MYSQL_TEST_URL!);
  if (source.protocol !== "mysql:" || !/^\/nihon_qa[a-zA-Z0-9_]*$/.test(source.pathname))
    throw new Error("TOPICS_TEST_REQUIRES_DISPOSABLE_QA_MYSQL");
  const base = { host: source.hostname, port: Number(source.port || 3306),
    user: decodeURIComponent(source.username), password: decodeURIComponent(source.password) };
  const database = "nihon_qa_topics_" + randomBytes(7).toString("hex");
  const admin = await mysql.createConnection(base);
  let pool: ReturnType<typeof openMySQL>["pool"] | undefined;
  try {
    await admin.query("CREATE DATABASE `" + database + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");
    await admin.changeUser({ database });
    // Install the original schema and its ledger first, then seed real pre-upgrade data.
    const initialName = "20261112021255_initial";
    const initial = readFileSync("src/db/mysql/migrations/" + initialName + "/migration.sql", "utf8");
    for (const statement of initial.split(/--> statement-breakpoint/).map(s => s.trim()).filter(Boolean))
      await admin.query(statement);
    await admin.query(`CREATE TABLE schema_migrations (
      filename varchar(191) PRIMARY KEY, checksum char(64) NOT NULL,
      status varchar(20) NOT NULL, applied_at varchar(32))`);
    await admin.execute("INSERT INTO schema_migrations VALUES (?,?,'applied',?)", [
      initialName, createHash("sha256").update(initial).digest("hex"), new Date().toISOString(),
    ]);
    const legacyId = randomUUID(), entryId = randomUUID(), cardId = randomUUID();
    const stamp = new Date().toISOString();
    await admin.execute("INSERT INTO decks (id,name,visibility,created_at) VALUES (?,?,'public',?)",
      [legacyId, "Legacy lesson", stamp]);
    await admin.execute(`INSERT INTO vocabulary_entries
      (id,word,reading,normalized_key,status,created_at,updated_at)
      VALUES (?,'学ぶ','まなぶ',?,'published',?,?)`, [entryId, entryId, stamp, stamp]);
    await admin.execute("INSERT INTO deck_items (deck_id,entry_id) VALUES (?,?)", [legacyId, entryId]);
    await admin.execute("INSERT INTO review_cards (id,user_id,entry_id,streak,times_reviewed) VALUES (?,?,?,3,5)",
      [cardId, "qa-learner", entryId]);
    const options = { ...base, database, tls: "off" as const };
    assert.equal((await migrateFreshMySQL(options)).migrations, 2);
    assert.equal((await migrateFreshMySQL(options)).migrations, 2);
    const connection = openMySQL(options); pool = connection.pool;
    const { db } = connection;
    const lessons = mysqlDecks(db), topicRepo = mysqlTopics(db);
    const legacy = (await lessons.get(legacyId))!;
    assert.equal(legacy.topicId, null);
    assert.equal(legacy.lessonKey, null);
    assert.equal(legacy.entries[0]?.id, entryId);
    assert.equal((await db.select().from(reviewCards).where(eq(reviewCards.id, cardId)))[0]?.streak, 3);

    const topicResults = await Promise.all(Array.from({ length: 8 }, () =>
      topicRepo.getOrCreate({ name: "  Đời sống 日本  ", description: "QA" })));
    assert.equal(topicResults.filter(r => r.created).length, 1);
    assert.equal(new Set(topicResults.map(r => r.topic.id)).size, 1);
    const topic = topicResults[0]!.topic;
    assert.equal((await topicRepo.get(topic.id))?.name, "Đời sống 日本");
    assert.equal(await topicRepo.get(randomUUID()), null);
    assert.equal((await topicRepo.list()).length, 0);
    assert.equal((await topicRepo.list(true)).length, 1);
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      lessons.getOrCreate({ name: "  Lesson One  ", topicId: topic.id })));
    assert.equal(results.filter(r => r.created).length, 1);
    assert.equal(new Set(results.map(r => r.lesson.id)).size, 1);
    const lesson = results[0]!.lesson;
    assert.equal((await lessons.getOrCreate({ name: "lesson one", topicId: topic.id })).created, false);
    assert.notEqual((await lessons.getOrCreate({ name: "Lesson One" })).lesson.id, lesson.id);
    const other = (await topicRepo.getOrCreate({ name: "Other topic" })).topic;
    assert.notEqual((await lessons.create({ name: "Lesson One", topicId: other.id })).id, lesson.id);
    assert.equal(await lessons.get(lesson.id), null);
    assert.ok((await lessons.list(true)).some(d => d.id === lesson.id && d.topicId === topic.id));
    assert.ok(!(await lessons.list()).some(d => d.id === lesson.id));

    const draftId = randomUUID();
    await db.insert(vocabularyEntries).values({ id: draftId, word: "勉強", reading: "べんきょう",
      romanization: "benkyou", normalizedKey: draftId, status: "draft", createdAt: stamp, updatedAt: stamp });
    await db.insert(vocabularySenses).values([
      { id: "qa-vi-b", entryId: draftId, language: "vi", meaning: "second", sortOrder: 1 },
      { id: "qa-vi-a", entryId: draftId, language: "vi", meaning: "học tập", sortOrder: 0 },
      { id: "qa-en", entryId: draftId, language: "en", meaning: "study", sortOrder: 0 },
    ]);
    const linked = await Promise.all(Array.from({ length: 8 }, () => lessons.addEntry(lesson.id, draftId)));
    assert.equal(linked.filter(Boolean).length, 1);
    await lessons.addEntry(lesson.id, entryId);
    const detail = (await lessons.get(lesson.id, true))!;
    assert.deepEqual(detail.entries.map(e => e.id), [draftId, entryId]);
    assert.equal(detail.entries[0]?.romanization, "benkyou");
    assert.equal(detail.entries[0]?.meaningVi, "học tập");
    await assert.rejects(lessons.publish(lesson.id), /DECK_HAS_UNPUBLISHED_ITEMS/);
    await db.update(vocabularyEntries).set({ status: "published" }).where(eq(vocabularyEntries.id, draftId));
    await lessons.publish(lesson.id);
    assert.deepEqual((await topicRepo.list()).map(t => t.id), [topic.id]);
    assert.equal((await lessons.get(lesson.id))?.entries.length, 2);
    // Public reads still exclude entries subsequently returned to draft.
    await db.update(vocabularyEntries).set({ status: "draft" }).where(eq(vocabularyEntries.id, draftId));
    assert.deepEqual((await lessons.get(lesson.id))?.entries.map(e => e.id), [entryId]);
    assert.equal((await lessons.get(lesson.id, true))?.entries.length, 2);
    await assert.rejects(lessons.addEntry(legacyId, draftId), /CANNOT_ADD_DRAFT/);
    assert.equal((await db.select().from(reviewCards).where(eq(reviewCards.id, cardId)))[0]?.timesReviewed, 5);
  } finally {
    if (pool) await pool.end();
    await admin.query("DROP DATABASE IF EXISTS `" + database + "`");
    await admin.end();
  }
});
