# Topics, lessons and batches of 100 words

This is the Nihon v2 shared contract and operator workflow. W1–4 implement
schema/services, REST, MCP and UI; W5 adds QA/docs. The base commit
`565e42e74faf8392f534dcb5af7e1305ce816d21` does not contain those new
implementations. These examples require their integration and a passing
real-MySQL/browser run. They are not a deployment or release sign-off.

A topic groups lessons. A lesson is an existing deck with an optional
`topicId`; existing `/decks` links and SRS enrollment keep the same IDs.
New lessons are private and imported vocabulary is draft. Repeating a
batch deduplicates vocabulary and lesson links instead of resetting study
history. A batch accepts 1–100 items; a second request can add another
batch to a private lesson. Vocabulary may be shared between lessons, so
publishing an entry changes its global vocabulary status. Review shared
entries before publishing.

## ChatGPT with MCP

Connect the ChatGPT MCP client to the approved **test** instance's `/mcp`
endpoint using Streamable HTTP. The test URL may have NoAuth enabled;
use it only for non-sensitive test content. First enumerate tools with
`tools/list` and use their advertised names and JSON schemas. Tool names
are not specified by the shared REST/service contract.

Example request to ChatGPT:

> Create or reuse the topic “Du lịch Nhật Bản” and a private lesson
> “Du lịch — 100 từ cơ bản”. Prepare exactly 100 distinct Japanese words
> with word, kana reading, romanization, JLPT level and Vietnamese meaning.
> Use the MCP draft batch tool to add all 100 items to that lesson in one
> request. Report lesson ID and received/created/duplicates/linked/
> alreadyLinked/errors. Keep every word draft and the lesson private.
> Do not publish or call Admin REST.

Follow-up examples:

> Retry the same 100 items in the same lesson. Confirm created=0, linked=0,
> duplicates=100 and alreadyLinked=100; report errors without retrying
> indefinitely.

> Add the next 100 distinct words to the same private lesson. Reuse the
> existing topic and lesson IDs. Report duplicate words and per-item errors.

Topic/lesson get-or-create must reuse the returned IDs. Do not infer
privacy from a successful import: inspect results and have an Admin review
content through the protected UI. NoAuth clients must never retrieve private
vocabulary through public read tools.

## Protected Admin REST workflow

All successful REST responses use `{ "success": true, "data": ... }`.
Use an authenticated Admin session (same-origin cookie and CSRF rules) or
an authorized Admin REST token. Keep credentials outside prompts, examples,
logs and committed files. MCP access grants no Admin REST permission.

1. `POST /api/v1/admin/topics` with
   `{"name":"Du lịch Nhật Bản","description":"Từ vựng du lịch"}`.
2. `POST /api/v1/admin/lessons` with
   `{"name":"Du lịch — 100 từ cơ bản","topicId":"<topic-id>"}`.
3. `POST /api/v1/admin/lessons/<lesson-id>/batch` with the object below.
   Send 100 distinct objects for a 100-word import, rather than 100 copies
   of the sample word. Validate meanings and kana before submitting.

```json
{
  "items": [
    {
      "word": "旅行",
      "reading": "りょこう",
      "romanization": "ryokou",
      "jlptLevel": "N5",
      "meaningVi": "du lịch"
    }
  ]
}
```

Batch data is `{lessonId,received,created,duplicates,linked,alreadyLinked,
errors:[{index,code}]}`. A successful HTTP response can still contain item
errors: inspect them and retry only corrected items. Preserve result IDs
and original item order when matching error indexes.

4. `GET /api/v1/admin/lessons/<lesson-id>` returns all linked entries,
   including drafts, for review. `GET /api/v1/admin/topics` and
   `GET /api/v1/admin/lessons` return `{items:[]}` within `data`.
5. `POST /api/v1/admin/lessons/<lesson-id>/publish-selected` with
   `{"entryIds":["<reviewed-entry-id>"]}` publishes selected entries.
   Only entries belonging to that lesson may be selected.
6. Alternatively, `POST /api/v1/admin/lessons/<lesson-id>/publish-all`
   with `{}` publishes all its entries after review. Both operations return
   `{published,skipped,errors:[{id,code}]}`; inspect errors and skipped items.
7. `POST /api/v1/admin/lessons/<lesson-id>/publish` with `{}` publishes
   the full deck once every entry is published. Entry publishing and lesson
   visibility are separate steps. Drafts must never leak through public reads.

Public discovery uses `GET /api/v1/topics`,
`GET /api/v1/topics/<topic-id>/lessons`, `GET /api/v1/decks` and
`GET /api/v1/decks/<lesson-id>`. A topic with no public lesson must not
expose its private content. Public lesson lists return `{items:[]}` within
`data`. Enrollment remains `POST /api/v1/me/decks/<lesson-id>/enroll`;
re-enrollment preserves existing card IDs, counters, due dates and review
events. A public lesson must reject insertion of a new draft, including
through the batch/MCP path; create a new private lesson for further drafts.

## NoAuth security boundary

`NIHON_MCP_NO_AUTH=true` is explicit test-only opt-in. Anyone reaching
`/mcp` can invoke available draft-writing tools; do not import secrets,
personal information or production content. Host/Origin/rate controls
still apply but do not establish user identity. NoAuth is disabled by
default and does not disable Admin authentication or CSRF protection.
MCP must expose no publishing tool, and anonymous callers must receive
401 from protected Admin REST. Anonymous drafts still consume storage;
review quotas and abuse handling before exposing a test instance.

Disable NoAuth through the approved app-container configuration and restart
that app when the test ends. Use scoped, revocable MCP credentials for
trusted clients. Production publishing always requires protected Admin REST
or the Admin UI. Never give ChatGPT an Admin credential to bypass this rule.

## Migration, backup and rollback

Before integrating the schema change, take a verified MySQL backup and
preserve the matching private instance key and encrypted connection config
separately. See [backup and staging restore](MYSQL_BACKUP_RESTORE.md).
Rehearse the actual pending migrations on a copy in an isolated MySQL 8.4
QA schema. Preserve existing deck/vocabulary IDs, learner identities,
review cards/events and enrollment links; adding topics must not rebuild
or truncate those tables. Verify migration repeatability and backup manifest
support for the new topic table/columns before release.

The new W5 test starts from an empty schema; it does **not** prove upgrading
an existing v2 database or restoring a pre-topic archive. Those require a
separate populated-snapshot migration and recovery drill. Legacy v1 remains
untouched; do not infer identity mappings or automatically import accounts.

For rollback, stop writes, retain the failing database for investigation,
and restore a verified pre-change snapshot into a separate environment with
its matching application version and key/config. Verify content and SRS
tracking before any separately approved cutover. Reverting application code
alone does not reverse MySQL DDL, and an old binary may reject a newer
migration ledger. Never drop topic tables or restore over live records as
an automatic rollback. No push, deployment, main merge or v1 change is
included in this QA/docs work.

See [testing](TESTING.md) and [release gates](RELEASE_READINESS.md) for
pending integration and operational checks.
