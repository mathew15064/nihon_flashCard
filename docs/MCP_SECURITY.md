# MCP security — MySQL-only Nihon

The Fastify /mcp endpoint supports trusted integrations authenticated
with scoped Bearer tokens stored AES-256-GCM encrypted in MySQL:
- MCP read: published vocabulary_search and vocabulary_get only.
- MCP writer: both reader tools and vocabulary_create_draft.
- Neither token can publish vocabulary.

Generate, rotate and revoke each token from Admin → Settings. The
server rejects missing/weak/equal-scoped tokens, cross-origin requests,
forged Host authorities and unsafe fetch metadata. Per-process bounded
rate limits protect the endpoint. Production requires a matching
explicit PUBLIC_ORIGIN stored in MySQL Settings.

MCP is *not* public OAuth: do not expose a writer token to untrusted
third-party clients. All vocabulary records are persisted in MySQL.
MySQL 8.4 tests cover actual HTTP MCP and credential rotation.

## Explicit public No Auth mode (testing only)

For a test environment that deliberately allows *any client* to connect
without an API key, login, token or OAuth flow, set the **app-container**
variable `NIHON_MCP_NO_AUTH=true` and restart **only the app**. The default
(unset/any other value) still requires the original scoped Bearer tokens.

No Auth exposes **all tools currently registered by the MCP server** to
anyone who can reach `/mcp`:
`vocabulary_search`, `vocabulary_get` and `vocabulary_create_draft`.
This includes MySQL draft writes without identifying a caller. It does
**not** enable publishing, change Admin REST authentication or provide
arbitrary database/system access; those operations are not MCP tools.

**Risk:** when enabled on a public HTTPS hostname, anonymous visitors can
create unlimited drafts over time (subject to request rate limits), causing
spam and growing MySQL usage. Anyone can invoke the same tools. DNS-rebinding
Host checks, Origin checks and rate limits remain in place; these are not
credentials and do not restrict ordinary server-to-server MCP clients with
no `Origin` header. Do not enable on final production or expose sensitive
write tools this way. Disable immediately by removing the variable and
recreating the application container; existing MySQL records are untouched.

MCP is Streamable HTTP: use the URL with an MCP client sending JSON-RPC
**POST** requests (and `Accept: application/json, text/event-stream`).
Opening `/mcp` in an ordinary browser sends GET and may receive 405; that
is not evidence that authentication is required.
