import { timingSafeEqual } from "node:crypto";

export function validBearer(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 24) return false;
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const actual = Buffer.from(auth.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
