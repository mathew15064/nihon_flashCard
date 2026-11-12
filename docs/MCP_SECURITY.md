# MCP security — Nihon v2 (MySQL only)

## Scope and authorization

The Fastify `POST /mcp` endpoint uses scoped Bearer tokens from Admin →
Settings, encrypted at rest in MySQL. Tokens can be rotated and revoked.
Neither token authorizes Admin REST, publishing, arbitrary SQL or shell access.

| Scope | Server-advertised MCP tools |
| --- | --- |
| Read (5) | `vocabulary_search`, `vocabulary_get`, `topics_list`, `lessons_list`, `lesson_get` |
| Write (9) | All five Read tools plus `topics_create`, `lessons_create`, `lesson_add_vocabulary_batch`, `vocabulary_create_draft` |

Read sees **published** vocabulary/topics/lessons only; private lessons and
unpublished entries are excluded, including from `lesson_get`. Authenticated
Write may inspect draft lessons. Writer mutations never publish; publishing
remains an Admin-only REST action. A writer token is **not** an Admin credential.
Tokenless requests normally return HTTP 401. Missing/weak/mis-scoped Bearer
tokens are rejected; equal Read/Write tokens fail closed.

## No Auth testing mode (dangerous, intentionally explicit)

`NIHON_MCP_NO_AUTH=true` enables all **nine** writer tools for anonymous
clients in local `NODE_ENV=test` / `development` or other non-production
environments. For a **production build used strictly as a public test**
(`NODE_ENV=production`), two explicit flags are required:

```text
NIHON_MCP_NO_AUTH=true
NIHON_MCP_NO_AUTH_PRODUCTION_TEST_ACK=true
```

The second flag is a deliberate risk acknowledgement, **not** authentication,
and is not appropriate for a real production release. Missing/incorrect
flags revert to scoped Bearer authorization. Toggling environment variables
requires app restart/container recreation in ordinary deployment; the code
also checks current env on each request. Do not change the running public
test's environment or restart/deploy it without explicit operator approval.
**Important upgrade note:** deploying this version to a production-mode test
instance which currently sets only `NIHON_MCP_NO_AUTH=true` will disable
anonymous access until an operator independently approves and configures
the second flag. Do not silently add that flag.

No Auth can create drafts and grow MySQL. Anonymous deduplication replies
do not reveal existing private vocabulary IDs/status or full topic/lesson
records. It cannot list/get unpublished entries. Anonymous batch writes are restricted to lessons created by anonymous
MCP in the **same app process**, with one compatibility exception: a caller
who already knows the ID of an **empty** private lesson can start an anonymous
import into it. Once granted, the lesson is writable anonymously for this
process's lifetime. Lessons containing existing entries are not claimable,
even with a known ID; name collisions with Admin lessons are denied by
`lessons_create`. The temporary grant registry is bounded and lost on
app restart; pre-existing anonymous lessons are no longer writable through
No Auth after restart. Use a scoped writer token for persistent ownership.
**Residual risk:** a leaked ID of an empty Admin lesson can still permit an
anonymous claim/write. This exception preserves the pre-existing MCP batch
workflow and its integration tests, but is *not* safe multi-tenant ownership.
Distinct anonymous clients are indistinguishable and may modify one another's
anonymous lessons if they know their IDs or names. Disable No Auth for any
environment requiring private lesson integrity.

## Request validation and rate budgets

Host authority is validated against the configured public Origin. Production
requires an explicitly configured valid Origin. Cross-site fetch metadata and
mismatched `Origin` headers are rejected. Non-browser clients often omit both
`Origin` and `Sec-Fetch-Site`; such requests are deliberately allowed if
Host and authorization/mode checks pass. **Host/Origin are not credentials**,
and clients outside browsers can forge these headers. Fastify uses the socket
IP (`trustProxy=false`), not untrusted `X-Forwarded-For`.

- General MCP: 120 requests per minute per socket IP and effective scope.
- Anonymous writes: weighted by the number of batch items; one draft = 1 unit,
  topic/lesson create = 10 units, batch = number of entries (up to 100).
  Limits: 250 units/minute per IP, 250 units/minute across all anonymous
  clients, and 500 units/hour across all anonymous clients.
- Authenticated writer: 250 write units/minute per IP and 1,000 units/hour
  per fingerprint of the Bearer token. Credentials are not stored in budget
  keys. A separate anonymous batch cap of five calls/minute remains.
- Rate-limited write requests return HTTP 429 with `Retry-After` and
  `MCP_WRITE_RATE_LIMITED` (the in-tool batch guard may instead return
  `MCP_BATCH_RATE_LIMITED`). Invalid batch shapes still consume the
  conservative write cost when recognized.

These are bounded **per-process**, in-memory fixed windows; restarting or
running multiple app processes resets/duplicates quotas. They bound *rate*
but do not cap lifetime MySQL storage, guarantee fair availability or
provide distributed abuse prevention. A burst may use 256 KiB/request
(Fastify body limit), and each batch may contain 1–100 entries.
Monitor volume, disk, MySQL growth and request/429 rates. Before exposing
a real production environment, disable No Auth, use scoped tokens, place
an upstream authenticated gateway and sustained shared/distributed quotas,
and plan retention/cleanup for anonymous test drafts. No email/user ownership
or audit trail can be inferred for anonymous writes.

## Server tool list versus ChatGPT plugin schema

A compliant Streamable HTTP client sends JSON-RPC **POST** with
`Content-Type: application/json` and
`Accept: application/json, text/event-stream`.
Opening `/mcp` as browser GET can return 405; that is expected.

Safe **read-only discovery** from an operator-controlled client (replace the
example domain, use an authorized Bearer token when No Auth is off):

```sh
curl -sS -i -X POST 'https://example.invalid/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Check the response's `result.tools[].name`: in anonymous test or Writer
mode it must list **9 names** above; with a Read token it must list **5**.
The MCP server code registers these toolsets, but the tool list returned by
ChatGPT's installed Nihon plugin can lag behind a server deployment.
If direct `tools/list` has 9 and ChatGPT shows only 3, reconnect/refresh
the **client plugin schema**; do not add duplicate MCP tools to fix the UI.
If direct `tools/list` has fewer, check deployed server SHA, container
image, process restart, reverse proxy and access scope before blaming the
plugin. HTTP 401/403/405, unreachable host or invalid JSON-RPC are separate
transport/auth problems. Do not call writer tools merely to count them.

## Operator boundaries

Do not place live credentials, MySQL URLs or real learner data in test
requests, source code, logs or issue/PR comments. Do not change VPS test
configuration or disable No Auth without separate approval. Production
release, restore/backups, offsite retention, monitoring, migrations and
client reconnection all require operator review. This hardening does not
authorize merge or deploy.
