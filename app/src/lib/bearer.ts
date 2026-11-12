import { timingSafeEqual } from "node:crypto";
export function verifyBearer(actual:string|undefined,expected:string|undefined):boolean{
  if(!actual?.startsWith("Bearer ")||!expected||expected.length<24)return false;
  const a=Buffer.from(actual.slice(7)),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
