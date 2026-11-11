import { listDecks } from "@/modules/decks/service";
export const runtime = "nodejs";
export function GET() {
  return Response.json({ success: true, data: { items: listDecks() }});
}
