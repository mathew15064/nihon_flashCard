# Nihon — UI-first first-run installation and server-managed settings

## Goal and current scope

A clean Fastify installation now starts with **no manually edited source or .env**.
The Node process creates `data/nihon.sqlite` if missing, applies ordered
checksum-verified migrations, and creates a unique persistent
`data/instance-secret.key` (0600), unless an existing `AUTH_SECRET` is supplied
for compatibility. Both the secret and SQLite DB must be backed up securely.

The built SPA detects that no Admin exists and displays the one-time setup wizard.
The app generates a **random one-boot setup code** in the server's private
startup logs. The operator enters it in the wizard (not through a source edit),
sets an Admin password and reviews the public origin and learner signup toggle.

The code is never returned in an HTTP response and does not persist after
process restart. Five failed setup attempts per socket IP / 15 minutes are
rate-limited. An existing Admin cannot be replaced through the wizard.
The initial setup requires an exact browser Origin match and forbids cross-site
fetch metadata; production non-loopback origins must use HTTPS.

## Database selection

- **SQLite + Drizzle:** currently supported; automatically provisioned with
  schema migrations, no connection username/password.
- **MySQL:** visible in the wizard as **not yet supported**. Submitting this
  choice returns `MYSQL_ADAPTER_NOT_READY` and cannot create an Admin or
  initialize a fake SQLite-as-MySQL installation.

The existing business services depend on synchronous SQLite/Drizzle operations,
SQLite transactions and SQLite-specific schema. Genuine MySQL support needs a
separate async driver, Drizzle MySQL schema/migrations, adapted transactions,
integration tests against a real MySQL instance, and a reviewed data migration
or cutover mechanism. Do not switch an existing database by merely editing
a connection string. This work remains open.

## Admin Settings (after initial login)

Go to **Admin → Settings** (`/admin/settings`) to change:

- Website Origin (`https://...`) and learner signup.
- OpenAI Responses API key, model and quota.
- Generate/rotate or revoke separate MCP read-only and MCP draft-write tokens.
- Generate/rotate or revoke an Admin REST integration token.

`app_settings` is SQLite migration 007. Passwords are salted scrypt hashes.
Provider keys and bearer tokens are AES-256-GCM encrypted with an HKDF-derived
key from the private persistent instance secret, using fresh random IVs.
The database alone does not reveal cleartext secrets; **compromise of both the
secret file and database does compromise stored credentials**.

Secrets are accepted in authenticated Admin requests only with CSRF checks
for browser cookies, and are never returned on settings GET. Newly generated
MCP/REST tokens are returned exactly once by a deliberate rotate operation
over HTTPS, for the Admin to copy to a trusted external integration.
Never persist one-time tokens in browser localStorage.

Existing .env-based installations stay compatible: when a stored setting is
absent, the matching environment variable can serve as a fallback. Stored UI
settings take precedence over env fallbacks. **Explicitly revoking** a provider
key or MCP/REST token on the UI stores a server-side disabled marker, so an
older environment fallback cannot silently become active again. To re-enable
the integration, save a new key or rotate a new token using Settings.
Changing the public origin to a different hostname requires using that new
hostname for future state-changing requests.

## Security and operational boundaries

- This wizard cannot safely replace **deployment hosting, TLS, persistent
  storage provisioning, backups or DNS**. The operator still runs the service
  and must be able to read first-boot logs. On a hosted install, the logs are
  typically available through the provider dashboard.
- **Do not publish an unclaimed, fresh installation widely** before the real
  operator obtains the one-time code. Use a private staging environment and
  lock down ingress while onboarding.
- When backing up the new SQLite DB, separately preserve the 0600 instance
  key under equivalent access controls. Without that key, encrypted settings
  and existing signed sessions cannot be recovered.
- UI Settings does not make the public MCP endpoint OAuth-ready. Keep this
  integration limited to trusted clients. API keys are never embedded in Vite
  assets or returned by ordinary GET routes.
- Existing v1 Express accounts, history, MySQL/Redis passwords and the older
  Next.js v2 worktree are not changed by this feature.
- The settings page deliberately does **not** support changing a database
  driver, overwriting an old database, or importing legacy user identities.
  Those actions require a verified backup, migration and ownership process.

## Verification

Regression tests: zero-env startup with migrations 001–007, permissions,
install status and abuse cases, matching origin, Admin login, Settings
read/write, encrypted key storage, token issuance/rotation/revocation,
and stable secret preservation across a second startup.

The operational smoke test uses a disposable SQLite volume and a temporary
Docker container. No real provider credentials or production data are used.
