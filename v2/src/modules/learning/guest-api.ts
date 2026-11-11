import { guestFromRequest, guestSessionSecret, validGuestMutationOrigin } from "./guest-session";
import { ZodError } from "zod";

export function guestIdentity(request: Request): string | null {
  return guestFromRequest(request);
}

export function guestError(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json({ success: false, error: {
      code: "VALIDATION_ERROR", details: error.issues,
    }}, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const safe = error instanceof Error && /^[A-Z_]{5,60}$/.test(error.message)
    ? error.message : "INTERNAL_ERROR";
  const status = safe.endsWith("_NOT_FOUND") ? 404
    : safe.endsWith("_NOT_DUE") || safe.endsWith("_CONFLICT") || safe === "DECK_TOO_LARGE" || safe === "EMPTY_DECK" ? 409
      : 500;
  return Response.json({ success: false, error: { code: safe } },
    { status, headers: { "Cache-Control": "no-store" } });
}

export function guestUnauthorized(): Response {
  return Response.json({success:false,error:{
    code: guestSessionSecret() ? "GUEST_SESSION_REQUIRED" : "GUEST_SESSION_NOT_CONFIGURED"
  }}, {status: guestSessionSecret() ? 401 : 503, headers:{"Cache-Control":"no-store"}});
}

export function guestMutationRejected(request: Request): Response | null {
  if (!validGuestMutationOrigin(request)) return Response.json({
    success: false, error: { code:"INVALID_ORIGIN" },
  }, { status: 403, headers: {"Cache-Control":"no-store"} });
  return null;
}

export function guestSuccess(data: unknown): Response {
  return Response.json({ success:true, data }, {headers:{"Cache-Control":"no-store"}});
}
