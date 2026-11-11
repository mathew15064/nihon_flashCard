import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("deck publishing requires approved vocabulary and hides drafts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nihon-deck-test-"));
  const path = join(directory, "test.sqlite");
  const sqlite = new DatabaseSync(path);
  sqlite.exec(readFileSync(resolve("src/db/migrations/001_init.sql"), "utf8"));
  sqlite.close();
  const oldDbPath = process.env.DB_PATH;
  process.env.DB_PATH = path;
  try {
    const { createVocabularyDraft, publishVocabulary } = await import("../src/modules/vocabulary/service");
    const { createDeck, addEntryToDeck, publishDeck, listDecks, getDeckWithEntries } =
      await import("../src/modules/decks/service");

    const unpublished = createVocabularyDraft({
      language: "ja", word: "新しい", reading: "あたらしい",
      meaningVi: "mới", source: "manual"
    }).item;
    const approved = createVocabularyDraft({
      language: "ja", word: "本", reading: "ほん",
      meaningVi: "sách", source: "manual"
    }).item;
    const deck = createDeck({ name: "Từ vựng N5", description: "Cơ bản" });

    assert.equal(listDecks().length, 0);
    assert.equal(addEntryToDeck(deck.id, approved.id), true);
    assert.equal(addEntryToDeck(deck.id, approved.id), false);
    assert.equal(addEntryToDeck(deck.id, unpublished.id), true);
    assert.throws(() => publishDeck(deck.id), /DECK_HAS_UNPUBLISHED_ITEMS/);

    publishVocabulary(approved.id);
    assert.throws(() => publishDeck(deck.id), /DECK_HAS_UNPUBLISHED_ITEMS/);
    publishVocabulary(unpublished.id);
    publishDeck(deck.id);
    assert.equal(listDecks().length, 1);
    assert.equal(getDeckWithEntries(deck.id)?.entries.length, 2);
    assert.throws(() => publishVocabulary(approved.id), /VOCABULARY_NOT_DRAFT/);

    const anotherDraft = createVocabularyDraft({
      language: "ja", word: "古い", reading: "ふるい",
      meaningVi: "cũ", source: "manual",
    }).item;
    assert.throws(
      () => addEntryToDeck(deck.id, anotherDraft.id),
      /CANNOT_ADD_DRAFT_TO_PUBLIC_DECK/
    );
    assert.equal(getDeckWithEntries(deck.id)?.entries.length, 2);
  } finally {
    if (oldDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = oldDbPath;
    // This test runs in an isolated process, so its SQLite connection
    // cannot affect application data. Remove the temporary fixture.
    rmSync(directory, { recursive: true, force: true });
  }
});
