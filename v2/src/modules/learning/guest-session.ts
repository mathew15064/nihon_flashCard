import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const GUEST_COOKIE_NAME = "nihon_guest_v2";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/** Keep guest IDs distinct from future registered user IDs. */
const PREFIX = "guest:";
const COOKIE_VERSION = "v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function guestSessionSecret(): string | null {
  const key = process.env.NIHON_GUEST_SESSION_SECRET || process.env.AUTH_SECRET;
  return typeof key === "string" && key.length >= 32 ? key : null;
}

function digest(id: string, secret: string): Buffer {
  return createHmac("sha256", secret).update("nihon-v2:guest:" + id).digest();
}

export function makeGuestToken(secret: string, id = randomUUID()): string {
  if (!UUID.test(id)) throw new Error("INVALID_GUEST_ID");
  return `${COOKIE_VERSION}.${id}.${digest(id, secret).toString("base64url")}`;
}

/** Prevent clients from choosing or tampering with a database user ID. */
export function parseGuestToken(token: string | null | undefined, secret: string): string | null {
  if (!token || token.length > 160) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== COOKIE_VERSION || !UUID.test(parts[1])) return null;
  let signature: Buffer;
  try { signature = Buffer.from(parts[2], "base64url"); }
  catch { return null; }
  const expected = digest(parts[1], secret);
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  return PREFIX + parts[1];
}

/** Read a cookie without trusting any user ID from JSON/query parameters. */
export function guestFromRequest(request: Request): string | null {
  const secret = guestSessionSecret();
  if (!secret) return null;
  const raw = request.headers.get("cookie") || "";
  const match = raw.split(";").map(x => x.trim()).find(x => x.startsWith(GUEST_COOKIE_NAME + "="));
  if (!match) return null;
  const value = match.slice(GUEST_COOKIE_NAME.length + 1);
  return parseGuestToken(value, secret);
}

/** Only same-origin web forms/fetches can mutate a guest's study progress. */
export function validGuestMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const actual = new URL(origin);
    // Next.js can normalize request.url to localhost even when the browser used
    // 127.0.0.1. Compare the browser Origin with the inbound Host header instead.
    const target = new URL(request.url);
    const host = request.headers.get("host") || target.host;
    const protocol = (request.headers.get("x-forwarded-proto")?.split(",")[0].trim()
      || target.protocol.slice(0, -1)).toLowerCase();
    if (process.env.NODE_ENV === "production" && process.env.AUTH_URL) {
      if (actual.origin !== new URL(process.env.AUTH_URL).origin) return false;
    }
    return actual.host.toLowerCase() === host.toLowerCase()
      && actual.protocol === protocol + ":"
      && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}
