import {
  guestError, guestIdentity, guestMutationRejected, guestSuccess, guestUnauthorized,
} from "@/modules/learning/guest-api";
import { reviewInputSchema } from "@/modules/learning/schema";
import { recordGuestReview } from "@/modules/learning/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const badOrigin = guestMutationRejected(request);
  if (badOrigin) return badOrigin;
  const guest = guestIdentity(request);
  if (!guest) return guestUnauthorized();
  try {
    const body = await request.text();
    if (body.length > 1500) return Response.json({
      success:false,error:{code:"PAYLOAD_TOO_LARGE"},
    },{status:413,headers:{"Cache-Control":"no-store"}});
    let json: unknown;
    try { json = JSON.parse(body); }
    catch { return Response.json({
      success:false,error:{code:"INVALID_JSON"},
    },{status:400,headers:{"Cache-Control":"no-store"}}); }
    const input = reviewInputSchema.parse(json);
    return guestSuccess(recordGuestReview(guest, input));
  } catch (error) { return guestError(error); }
}
