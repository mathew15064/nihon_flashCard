import { ZodError } from "zod";

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json({ success: false, error: { code: "VALIDATION_ERROR", details: error.issues } }, { status: 400 });
  }
  console.error("Request failed:", error instanceof Error ? error.name : "unknown");
  return Response.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, { status: 500 });
}

export function unauthorized() {
  return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Valid credentials required" } }, { status: 401 });
}
