# MCP access scopes and transport hardening (2026-11-12)

## Local/token-based integrations

Nihon supports two separately configured server-side MCP credentials:

| Environment variable | Role | MCP tools |
| --- | --- | --- |
| `NIHON_MCP_READ_TOKEN` | Read-only | `vocabulary_search`, `vocabulary_get` |
| `NIHON_MCP_TOKEN` | Draft writer (backward-compatible) | Read-only tools plus `vocabulary_create_draft` |

Create/rotate tokens from **Admin → Settings** (preferred) or provide two different,
cryptographically random server-side tokens, each at least **24 characters**.
Tokens must not be identical. When both configuration values match, MCP authentication
fails closed for both scopes. The write token never publishes vocabulary; publishing
still requires the separate Admin role.

The MCP scope is enforced by constructing separate servers with different registered
tools, not by hiding buttons or filtering the `tools/list` response alone. Calling
the draft tool name with a read-only token cannot create a record.

## HTTP security

- MCP is served at `POST /mcp`; non-POST methods return 405 after authentication.
- HTTP requests must include a valid Host. With `PUBLIC_ORIGIN` configured, the
  Host must match the configured public host and port (URL default ports normalized).
  Fastify does not trust `X-Forwarded-Host`, `X-Forwarded-Proto`, or forwarded IPs.
- Without `PUBLIC_ORIGIN`, only loopback Host headers are accepted in development.
  **Production always requires `PUBLIC_ORIGIN`**, including for non-browser MCP clients.
- If the browser provides `Origin`, it must match `PUBLIC_ORIGIN` (or the local
  development origin); `Sec-Fetch-Site: cross-site` is rejected with or without Origin.
- MCP SDK HTTP/SSE responses are forced to `Cache-Control: no-store`.
- Requests are limited to 120 per minute per socket IP and scope, using bounded
  in-process memory. A reverse proxy appears as one IP, so deploy additional edge
  limits at the trusted ingress rather than enabling untrusted forwarded IPs.
- Both scopes use a 64 KiB Fastify request-body limit.

## Important deployment boundary

**These bearer tokens are not OAuth.** They have no user-specific identity, client
consent, revocation UI, discovery flow, resource server metadata or OAuth scopes.
Do not expose the endpoint as a public remote MCP service for arbitrary clients
until an audited OAuth 2.1 integration, TLS/reverse-proxy threat model, logging
redaction and permission model have been implemented.

Keep token values in ignored server configuration or a protected secrets store.
Never embed them in React/Vite code or commit them to Git. To revoke access,
rotate only the affected token in the server's secret store, then restart the
single Fastify process under a reviewed change procedure.

Regression tests use synthetic SQLite and isolated localhost HTTP. They verify
both tool listings, attempted read-to-write escalation, Host and Origin rules,
separate tokens and fail-closed production configuration.

No v1 user/SRS records were read or altered in this change.
