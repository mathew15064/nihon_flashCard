import { z } from "zod";
import {
  guestError, guestIdentity, guestMutationRejected, guestSuccess, guestUnauthorized,
} from "@/modules/learning/guest-api";
import { enrollDeckForGuest } from "@/modules/learning/service";

export const runtime = "nodejs";

export async function POST(request: Request, context: {
  params: Promise<{id:string}>;
}) {
  const badOrigin = guestMutationRejected(request);
  if (badOrigin) return badOrigin;
  const guest = guestIdentity(request);
  if (!guest) return guestUnauthorized();
  try {
    const { id } = await context.params;
    const deckId = z.string().uuid().parse(id);
    return guestSuccess(enrollDeckForGuest(guest, deckId));
  } catch (error) { return guestError(error); }
}
