import {
  guestError, guestIdentity, guestMutationRejected, guestSuccess, guestUnauthorized,
} from "@/modules/learning/guest-api";
import { enrollQuickStart } from "@/modules/learning/service";

export const runtime = "nodejs";

export function POST(request: Request) {
  const badOrigin = guestMutationRejected(request);
  if (badOrigin) return badOrigin;
  const guest = guestIdentity(request);
  if (!guest) return guestUnauthorized();
  try { return guestSuccess(enrollQuickStart(guest)); }
  catch (error) { return guestError(error); }
}
