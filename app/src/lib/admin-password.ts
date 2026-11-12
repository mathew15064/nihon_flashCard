import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_BYTES = 64;

/** Hash for the one-person admin account. Store only this hash on the server. */
export function hashAdminPassword(password: string, salt = randomBytes(24)): string {
  if (password.length < 12 || password.length > 256) throw new Error("Password must be 12–256 characters");
  const digest = scryptSync(password, salt, HASH_BYTES);
  return `scrypt:${salt.toString("base64url")}:${digest.toString("base64url")}`;
}

export function verifyAdminPassword(password: unknown, storedHash: string | undefined): boolean {
  if (typeof password !== "string" || password.length > 256 || !storedHash) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64url");
    const digest = Buffer.from(parts[2], "base64url");
    if (salt.length !== 24 || digest.length !== HASH_BYTES) return false;
    const actual = scryptSync(password, salt, HASH_BYTES);
    return actual.length === digest.length && timingSafeEqual(actual, digest);
  } catch {
    return false;
  }
}
