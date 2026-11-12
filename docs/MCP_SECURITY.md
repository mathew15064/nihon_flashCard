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
