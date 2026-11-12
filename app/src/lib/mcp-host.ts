/** Host guard for the MySQL-only MCP endpoint. Do not trust proxy headers. */
export function mcpHostAllowed(
  host: string | undefined,
  publicOrigin: string | undefined,
  production: boolean,
): boolean {
  if (!host || !/^(?:[a-z0-9][a-z0-9.-]*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i.test(host)) {
    return false;
  }
  const configured = publicOrigin?.trim();
  if (!configured && production) return false;
  let protocol = "http:";
  let expectedHost: string | undefined;
  if (configured) {
    try {
      const url = new URL(configured);
      if (!["http:", "https:"].includes(url.protocol) ||
          url.username || url.password || url.pathname !== "/" ||
          url.search || url.hash) return false;
      if (url.origin !== configured) return false;
      protocol = url.protocol;
      expectedHost = url.host;
    } catch { return false; }
  }
  try {
    const authority = new URL(protocol + "//" + host);
    if (authority.pathname !== "/" || authority.search || authority.hash ||
        authority.username || authority.password) return false;
    if (expectedHost) return authority.host === expectedHost;
    return ["127.0.0.1", "localhost", "[::1]"].includes(authority.hostname);
  } catch { return false; }
}
