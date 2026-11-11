import {
  guestError, guestIdentity, guestSuccess, guestUnauthorized,
} from "@/modules/learning/guest-api";
import { listDueCards } from "@/modules/learning/service";
import { dueQuerySchema } from "@/modules/learning/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const guest = guestIdentity(request);
  if (!guest) return guestUnauthorized();
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    const { limit } = dueQuerySchema.parse(query);
    return guestSuccess({ items: listDueCards(guest, limit) });
  } catch (error) { return guestError(error); }
}
