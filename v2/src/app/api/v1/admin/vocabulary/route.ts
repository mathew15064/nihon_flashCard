import { validBearer } from "@/lib/auth";
import { unauthorized, errorResponse } from "@/lib/api";
import { createVocabularyDraft, listVocabulary } from "@/modules/vocabulary/service";
import { vocabularyInput, listQuery } from "@/modules/vocabulary/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!validBearer(req, process.env.NIHON_ADMIN_TOKEN)) return unauthorized();
  try {
    const query = listQuery.parse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    return Response.json({ success: true, data: listVocabulary({ ...query, includeDrafts: true }) });
  } catch (err) { return errorResponse(err); }
}

export async function POST(req: Request) {
  if (!validBearer(req, process.env.NIHON_ADMIN_TOKEN)) return unauthorized();
  try {
    const raw = await req.text();
    if (raw.length > 12000) return Response.json({ success: false, error: { code: "TOO_LARGE" } }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return Response.json({ success: false, error: { code: "INVALID_JSON" } }, { status: 400 }); }
    const result = createVocabularyDraft(vocabularyInput.parse(input));
    return Response.json({ success: true, data: result.item, duplicate: !result.created }, { status: result.created ? 201 : 200 });
  } catch (err) { return errorResponse(err); }
}
