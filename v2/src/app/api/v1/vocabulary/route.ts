import { listQuery } from "@/modules/vocabulary/schema";
import { listVocabulary } from "@/modules/vocabulary/service";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const query = listQuery.parse(Object.fromEntries(params.entries()));
    return Response.json({ success: true, data: listVocabulary(query) });
  } catch (err) { return errorResponse(err); }
}
