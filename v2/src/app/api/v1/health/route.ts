export const runtime = "nodejs";
export function GET() {
  return Response.json({ success: true, data: { status: "ok", service: "nihon-v2" } });
}
