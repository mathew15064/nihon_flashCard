import type { FastifyReply,FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { getActor,getLearningId,safeOrigin,verifyBearer } from "./auth";
import { adminRestToken } from "@/lib/runtime-config";

export function fail(reply:FastifyReply,error:unknown){
  if(error instanceof ZodError){
    return reply.code(400).send({success:false,error:{code:"VALIDATION_ERROR",details:error.issues}});
  }
  const code=error instanceof Error && /^[A-Z_]{4,70}$/.test(error.message)
    ?error.message:"INTERNAL_ERROR";
  const status=code.includes("NOT_FOUND")?404
    : code.includes("DUPLICATE")||code.includes("CONFLICT")||code.includes("NOT_DUE")
      ||code.includes("ALREADY")||code.includes("EMPTY")||code==="DECK_HAS_UNPUBLISHED_ITEMS"
      ?409:code.includes("LIMIT")||code.includes("QUOTA")?429:400;
  return reply.code(code==="INTERNAL_ERROR"?500:status).send({success:false,error:{code}});
}
export function requireAdmin(request:FastifyRequest,reply:FastifyReply):boolean {
  const bearerAuthorized=verifyBearer(request.headers.authorization,adminRestToken());
  const cookieAuthorized=getActor(request)?.role==="admin";
  if(!bearerAuthorized && !cookieAuthorized) {
    reply.code(401).send({success:false,error:{code:"ADMIN_REQUIRED"}});return false;
  }
  // A forged/invalid Authorization header must never bypass cookie CSRF checks.
  if(!bearerAuthorized && !safeOrigin(request)
    && !["GET","HEAD","OPTIONS"].includes(request.method)){
    reply.code(403).send({success:false,error:{code:"INVALID_ORIGIN"}});return false;
  }
  return true;
}
export function requireLearnerOrGuest(request:FastifyRequest,reply:FastifyReply):string|null {
  const id=getLearningId(request);
  if(!id){
    reply.code(401).send({success:false,error:{code:"LEARNING_SESSION_REQUIRED"}});
    return null;
  }
  return id;
}
export function requireSameOrigin(request:FastifyRequest,reply:FastifyReply):boolean {
  if(!safeOrigin(request)){
    reply.code(403).send({success:false,error:{code:"INVALID_ORIGIN"}});return false;
  }
  return true;
}
export function ok(data:unknown,extras:object={}){
  return {success:true,data,...extras};
}
