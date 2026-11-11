import { NextResponse } from "next/server";
import {
  GUEST_COOKIE_MAX_AGE, GUEST_COOKIE_NAME, guestFromRequest,
  guestSessionSecret, makeGuestToken,
} from "@/modules/learning/guest-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const secret = guestSessionSecret();
  if (!secret) {
    return NextResponse.json({success:false,error:{code:"GUEST_SESSION_NOT_CONFIGURED"}},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
  const previous = guestFromRequest(request);
  const response = NextResponse.json({
    success: true, data: { ready:true, guest:true, existing: Boolean(previous) },
  }, {headers:{"Cache-Control":"no-store"}});
  if (!previous) {
    response.cookies.set(GUEST_COOKIE_NAME, makeGuestToken(secret), {
      httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production",
      path:"/", maxAge:GUEST_COOKIE_MAX_AGE,
    });
  }
  return response;
}
