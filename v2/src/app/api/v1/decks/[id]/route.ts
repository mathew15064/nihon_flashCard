import { getDeckWithEntries } from "@/modules/decks/service";
import { deckIdSchema } from "@/modules/decks/schema";

export const runtime = "nodejs";
export async function GET(_req: Request, { params }: {params: Promise<{id:string}>}) {
  const { id } = await params;
  if (!deckIdSchema.safeParse(id).success) {
    return Response.json({ success: false, error: {code:"INVALID_ID"} },{status:400});
  }
  const deck = getDeckWithEntries(id);
  return deck
    ? Response.json({ success: true, data: deck })
    : Response.json({ success: false, error: {code:"NOT_FOUND"} },{status:404});
}
