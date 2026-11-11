import { getVocabulary } from "@/modules/vocabulary/service";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const item = getVocabulary(id);
    if (!item) return Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    return Response.json({ success: true, data: item });
  } catch (err) { return errorResponse(err); }
}
