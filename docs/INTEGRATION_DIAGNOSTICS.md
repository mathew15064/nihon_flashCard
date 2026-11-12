# Nihon v2: MySQL / OpenAI / MCP integration diagnostics

This is a **pre-production development feature**. It does not deploy
anything, expose server credentials, or call paid OpenAI generation on its
own. Available in **Admin → Settings → Kiểm tra dịch vụ và tích hợp**.

## Status view

The protected `GET /api/v1/admin/integrations/diagnostics` endpoint
returns only server-side configuration metadata:

- MySQL: application backend and current connectivity (the Settings
  lookups must succeed before a status is returned)
- OpenAI: whether a key has been configured and which model is selected,
  **not a claim that provider access has been verified**
- MCP: endpoint derived from the configured website Origin, availability
  of Read and Write Bearer tokens, and the exact tool names each scope
  exposes; **not a claim that any external MCP client has connected**
- Admin REST: whether an integration token has been issued

Credentials, old Bearer tokens, OpenAI API keys and MySQL passwords are
never sent in diagnostics responses. Endpoint access requires an Admin
browser session or valid Admin REST bearer.

## Verify the OpenAI key and model

1. In **Admin → Settings**, enter the OpenAI API key and model and click
   **Lưu cấu hình** first. This stores the key encrypted in the MySQL
   `app_settings` table; it is not returned to the browser.
2. Click **Kiểm tra API key & model OpenAI**.
3. The authenticated server executes an 8-second, redirect-disabled
   **GET https://api.openai.com/v1/models/{configured_model}** with the
   saved Bearer key. This uses the model metadata endpoint only. The
   requested URL is fixed to OpenAI; no user-supplied URL, topic, or HTTP
   body is forwarded.
4. The UI displays a sanitized result: accessible model, invalid key
   (401), forbidden access (403), unknown/inaccessible model (404),
   rate limit (429), connection failure or timeout. Neither the
   provider response body nor credential text is returned or logged.
5. The backend limits this operation to five attempts per IP per
   15-minute window **after** verifying Admin authorization.

**Important:** retrieving model metadata does **not** prove the account
can generate text through the Responses API, that the project has a
sufficient budget, or that vocabulary output quality is acceptable.
Actual generation still requires a separately reviewed end-to-end test
with an authorized provider key and cost acceptance. The automated suite
uses fake keys and stub provider HTTP responses; no real usage is billed.

## MCP permissions

The existing MCP protocol endpoint is `/mcp`. Read and Write tokens
remain independent and can be rotated/revoked through Admin Settings.

| Scope | MCP tools |
| --- | --- |
| Read | `vocabulary_search`, `vocabulary_get` |
| Draft writer | `vocabulary_search`, `vocabulary_get`, `vocabulary_create_draft` |

The real HTTP/MySQL integration suite now calls `tools/list` separately
with Read and Write Bearer credentials, verifies the read scope does not
expose `vocabulary_create_draft`, and uses `tools/call` with a writer
credential to create a private vocabulary draft. No MCP tool publishes
content without Admin review.

A trusted *external* MCP client and public OAuth are separate future
acceptance items. **Do not interpret configured tokens as proof of
connectivity from an external AI client.**

## Regression coverage and release boundary

The unit suite injects HTTP fetch responses to verify that model checking:
stays on the fixed OpenAI host, uses GET, never sends a prompt, disables
redirects, rejects invalid model IDs, handles 401/403/404/429/5xx, and
does not reveal secrets in returned errors. The real MySQL HTTP suite
also verifies Admin-only access, cross-Origin rejection, provider check
rate limits, full mocked Responses API -> review/publish -> public
vocabulary path, and actual MCP scope enforcement.

Playwright/Chromium verifies that the new Admin diagnostics panel
appears, the provider check stays disabled until a key is saved, changes
in token state are reflected, and the mobile/keyboard/WCAG regression
suite continues to pass.

**No production deployment, merge or external provider billing is part
of this change.** Review `docs/RELEASE_READINESS.md` before any later
production discussion.
