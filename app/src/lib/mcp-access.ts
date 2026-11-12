/**
 * Explicit opt-in for a public, unauthenticated MCP writer endpoint.
 * Disabled by default. This grants ALL CURRENT MCP tools, including
 * vocabulary_create_draft, to anyone who can reach /mcp.
 * It never changes Admin login, REST auth or MySQL credentials.
 */
export function mcpNoAuthEnabled():boolean {
  return process.env.NIHON_MCP_NO_AUTH==="true";
}
