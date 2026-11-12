# MySQL backup, integrity verification, and staging restore rehearsal

This feature belongs to the **Fastify MySQL backend**, available from
**Admin → Settings → Sao lưu MySQL**. It does not mutate or migrate v1 data,
and it never replaces the active MySQL database.

## Using the UI

1. Sign in as Admin on the MySQL installation. Click **Tạo backup MySQL**.
   The server acquires a MySQL advisory lock against concurrent migrations,
   starts a `REPEATABLE READ` consistent, read-only transaction, checks the
   migration ledger and native schema, and exports all application tables,
   including learner credentials (hashes), auth sessions, study history,
   vocabulary, decks, AI jobs and encrypted integration settings.
2. The snapshot is **gzip-compressed and encrypted with AES-256-GCM** using a
   unique random IV and an HKDF-derived backup key from the private persistent
   instance secret. The file is created exclusively (0600) in the private
   `data/mysql-backups` directory (0700). The API only returns file metadata,
   aggregate counts and digest; it never returns cleartext user rows.
3. Click **Kiểm tra toàn vẹn** to re-authenticate the encryption tag and
   verify the SHA-256 digest, footer row count, table/column manifest and
   expected migration metadata. This check is read-only.
4. Click **Tải về** to download the encrypted `.nihonbak` file. Store it on
   a protected, separate backup system. **Independently back up
   `instance-secret.key` and the small local bootstrap SQLite file** through
   your hosting provider's protected volume/snapshot workflow. The encrypted
   file cannot be recovered without the matching instance key.
5. To **test a real restore without cutover**, provision an additional,
   COMPLETELY EMPTY MySQL database on the same server with a name beginning
   `nihon_restore_`, such as `nihon_restore_qa`. Enter that name in Admin
   Settings and click **Khôi phục staging**. Confirm the operation. Nihon
   requires the target to exist and have **no tables**; it will never restore
   to the live database, switch the selected engine, or choose a target by
   accepting an arbitrary connection string.
6. The rehearsal applies the native MySQL migrations to the empty staging
   database, restores all snapshot tables in foreign-key dependency order,
   verifies full row contents per table (not counts alone), and commits the
   staging transaction only if every comparison succeeds. Its result reports
   staging schema name, table count and row count without displaying private
   rows. Inspect the isolated staging data and safely dispose of the staging
   database through your approved infrastructure process.
7. Use **Xóa bản local** only after confirming you already have an external
   copy. Deletion affects a single whitelisted local archive, never a MySQL
   database or an external copy. No backups are auto-pruned.

## Strict safety limits

| Control | Behavior |
| --- | --- |
| Live database | Read-only snapshot via MySQL MVCC; no data writes |
| Archive file | Random server-generated filename, exclusive 0600 create, no symlinks |
| Backup max size | 100,000 total rows and 128 MiB uncompressed data |
| Staging restore max size | 25,000 rows, at most 32 MiB compressed and uncompressed |
| Local backup retention | Up to 20 files; creation fails rather than deleting older backups |
| Rate limit | Five snapshot attempts per socket IP/hour; other backup actions also bounded |
| Staging schema | Must be empty and named `nihon_restore_...`, cannot equal active schema |
| Staging restore | Never performs live cutover; failed DDL may leave an incomplete staging schema |
| Credentials | MySQL password, Admin hash and encryption keys never printed in logs or UI |
| MySQL SSL | TLS with certificate verification recommended for remote production servers |

The schema must match Nihon's generated MySQL migration ledger and expected
table list. Schema drift or failed migrations cause a refusal rather than a
potentially incomplete archive. Corrupted or truncated encrypted data fails
authentication/verification, and **cannot begin staging initialization**.
Backup files are not portable plaintext SQL dumps. They require Nihon's
snapshot reader plus the original instance key.

A staging restore can leave a partially initialized staging schema if MySQL
DDL fails. MySQL DDL is nontransactional, so retry against a newly provisioned
empty staging schema after reviewing the failure. There is intentionally no
`DROP DATABASE`, `TRUNCATE`, `REPLACE INTO`, existing-schema overwrite,
active-DB restore, or automatic production failover action in the UI.

## Recovery and deployment caveats

The successful staging test certifies the **application tables and data
contents** for the corresponding backup format. It does **not** certify
a production disaster-recovery point-in-time target, a cloud MySQL topology,
TLS/network outage recovery, binlog continuity, loss of the encryption key,
or migration of legacy v1 user identities. For production, configure provider
snapshots or MySQL-native physical/logical backups and retention separately.
The current UI download requires an active Admin session, so the original
bootstrap configuration must be recovered before using an offsite archive in
a rebuilt instance.

This is a **beta backup and staging restore workflow**. Keep PR #2 Draft and
do not deploy production or cut over user databases without independent
maintenance approval and recovery exercise on real staging snapshots.

## QA coverage

The real MySQL 8.4 integration test creates an isolated empty schema, installs
Nihon, populates Admin, learner, guest, vocabulary, decks and SRS records,
exports an AES-GCM backup, verifies and downloads it, then restores to a
second empty schema and compares SRS counts and every table's row contents.
It confirms unauthenticated, cross-origin, live-target, repeat-restore and
tampered archive operations fail; a corrupted archive cannot initialize a new
staging schema. All QA schemas and encrypted test files are discarded.
