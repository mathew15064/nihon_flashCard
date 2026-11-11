import {
  guestError, guestIdentity, guestSuccess, guestUnauthorized,
} from "@/modules/learning/guest-api";
import { getReviewProgress } from "@/modules/learning/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const guest = guestIdentity(request);
  if (!guest) return guestUnauthorized();
  try { return guestSuccess(getReviewProgress(guest)); }
  catch (error) { return guestError(error); }
}
