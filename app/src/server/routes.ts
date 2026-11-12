import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { registerLearner, authenticateLearner, signupEnabled } from "@/modules/accounts/service";
import { registerInputSchema } from "@/modules/accounts/schema";
import { verifyAdminPassword } from "@/lib/admin-password";
import { listVocabulary, getVocabulary, createVocabularyDraft, publishVocabulary } from "@/modules/vocabulary/service";
import { vocabularyInput, listQuery } from "@/modules/vocabulary/schema";
import { createDeck, listDecks, getDeckWithEntries, addEntryToDeck, publishDeck } from "@/modules/decks/service";
import { createDeckInput, entryIdSchema } from "@/modules/decks/schema";
import { listGenerationJobs, getGenerationJob, generateJob, acceptCandidate, rejectCandidate, editCandidate,
  generationQuota, remainingGenerationQuota } from "@/modules/ai/service";
import { configuredModel, isProviderConfigured } from "@/modules/ai/provider";
import { generationRequestSchema, candidateSchema } from "@/modules/ai/schema";
import { enrollDeckForGuest, enrollQuickStart, listDueCards, getReviewProgress, recordGuestReview } from "@/modules/learning/service";
import { dueQuerySchema, reviewInputSchema } from "@/modules/learning/schema";
import { getActor, getGuestId, ensureGuest, setAuthCookie,clearAuthCookie,
  adminPasswordAllowed,recordAdminLogin,revokeAuthSession } from "./auth";
import { fail, ok, requireAdmin, requireLearnerOrGuest,requireSameOrigin } from "./http";
import { transferGuestProgress } from "@/modules/learning/transfer";

const idParam=z.object({id:z.string().uuid()});
const candidateParam=z.object({id:z.string().uuid()});
const enrollParam=z.object({id:z.string().uuid()});
const adminCredentials=z.object({password:z.string().min(1).max(256)});
const loginCredentials=z.object({username:z.string().min(1).max(50),password:z.string().min(1).max(256)});

export function registerRoutes(app:FastifyInstance):void {
  app.get("/api/v1/health",()=>ok({status:"ok",service:"nihon-fastify",framework:"fastify"}));

  app.get("/api/v1/auth/me",async(request)=>ok({
    user:getActor(request),signUpEnabled:signupEnabled(),guest:Boolean(getGuestId(request)),
  }));
  app.post("/api/v1/auth/admin/login",async(request,reply)=>{
    if(!requireSameOrigin(request,reply))return;
    try{
      const {password}=adminCredentials.parse(request.body);
      const hash=process.env.NIHON_ADMIN_PASSWORD_HASH;
      if(!hash||!process.env.AUTH_SECRET||!adminPasswordAllowed()){
        return reply.code(401).send({success:false,error:{code:"INVALID_CREDENTIALS"}});
      }
      const valid=verifyAdminPassword(password,hash);
      recordAdminLogin(valid);
      if(!valid)return reply.code(401).send({success:false,error:{code:"INVALID_CREDENTIALS"}});
      setAuthCookie(request,reply,"nihon-local-admin");
      return ok({role:"admin",name:"Nihon Admin"});
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/auth/learner/register",async(request,reply)=>{
    if(!requireSameOrigin(request,reply))return;
    try{
      const input=registerInputSchema.parse(request.body);
      const user=registerLearner(input);
      return reply.code(201).send(ok(user));
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/auth/learner/login",async(request,reply)=>{
    if(!requireSameOrigin(request,reply))return;
    try{
      const {username,password}=loginCredentials.parse(request.body);
      const learner=authenticateLearner(username,password);
      if(!learner)return reply.code(401).send({success:false,error:{code:"INVALID_CREDENTIALS"}});
      setAuthCookie(request,reply,learner.id);
      return ok({id:learner.id,name:learner.name,role:"learner"});
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/auth/logout",async(request,reply)=>{
    if(!requireSameOrigin(request,reply))return;
    revokeAuthSession(request);
    clearAuthCookie(reply);
    return ok({loggedOut:true});
  });

  app.get("/api/v1/vocabulary",async(request,reply)=>{
    try{
      const query=listQuery.parse(request.query);
      return ok(listVocabulary(query));
    }catch(err){return fail(reply,err);}
  });
  app.get("/api/v1/vocabulary/:id",async(request,reply)=>{
    try{
      const {id}=idParam.parse(request.params);
      const item=getVocabulary(id);
      if(!item)return reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});
      return ok(item);
    }catch(err){return fail(reply,err);}
  });
  app.get("/api/v1/admin/vocabulary",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{
      const query=listQuery.parse(request.query);
      return ok(listVocabulary({...query,includeDrafts:true}));
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/admin/vocabulary",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{
      const input=vocabularyInput.parse(request.body);
      const result=createVocabularyDraft(input);
      return reply.code(result.created?201:200).send(ok(result.item,{duplicate:!result.created}));
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/admin/vocabulary/:id/publish",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{return ok(publishVocabulary(idParam.parse(request.params).id));}
    catch(err){return fail(reply,err);}
  });

  app.get("/api/v1/decks",()=>ok({items:listDecks()}));
  app.get("/api/v1/decks/:id",async(request,reply)=>{
    try{
      const data=getDeckWithEntries(idParam.parse(request.params).id);
      if(!data)return reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});
      return ok(data);
    }catch(err){return fail(reply,err);}
  });
  app.get("/api/v1/admin/decks",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    return ok({items:listDecks(true)});
  });
  app.get("/api/v1/admin/decks/:id",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{
      const deck=getDeckWithEntries(idParam.parse(request.params).id,true);
      if(!deck)return reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});
      return ok(deck);
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/admin/decks",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{return reply.code(201).send(ok(createDeck(createDeckInput.parse(request.body))));}
    catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/admin/decks/:id/entries",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{
      const {id}=idParam.parse(request.params);
      const data=z.object({entryId:entryIdSchema}).parse(request.body);
      return ok({created:addEntryToDeck(id,data.entryId)});
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/admin/decks/:id/publish",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{return ok({id:publishDeck(idParam.parse(request.params).id)});}
    catch(err){return fail(reply,err);}
  });

  app.get("/api/v1/admin/ai/config",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    return ok({configured:isProviderConfigured(),model:configuredModel(),
      dailyLimit:generationQuota(),remaining:remainingGenerationQuota()});
  });
  app.get("/api/v1/admin/ai/jobs",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    return ok({items:listGenerationJobs()});
  });
  app.get("/api/v1/admin/ai/jobs/:id",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{
      const job=getGenerationJob(idParam.parse(request.params).id);
      if(!job)return reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});
      return ok(job);
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/admin/ai/jobs",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{
      const input=generationRequestSchema.parse(request.body);
      return reply.code(201).send(ok({id:await generateJob(input)}));
    }catch(err){return fail(reply,err);}
  });
  app.patch("/api/v1/admin/ai/candidates/:id",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{editCandidate(candidateParam.parse(request.params).id,candidateSchema.parse(request.body));return ok({saved:true});}
    catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/admin/ai/candidates/:id/accept",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{return ok({entryId:acceptCandidate(candidateParam.parse(request.params).id)});}
    catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/admin/ai/candidates/:id/reject",async(request,reply)=>{
    if(!requireAdmin(request,reply))return;
    try{rejectCandidate(candidateParam.parse(request.params).id);return ok({rejected:true});}
    catch(err){return fail(reply,err);}
  });

  app.get("/api/v1/me/session",async(request,reply)=>{
    if(!ensureGuest(request,reply))
      return reply.code(503).send({success:false,error:{code:"GUEST_SESSION_NOT_CONFIGURED"}});
    return ok({ready:true,user:getActor(request),guest:Boolean(getGuestId(request))});
  });
  app.get("/api/v1/me/progress",async(request,reply)=>{
    const userId=requireLearnerOrGuest(request,reply);
    if(!userId)return;
    try{return ok(getReviewProgress(userId));}catch(err){return fail(reply,err);}
  });
  app.get("/api/v1/me/reviews/due",async(request,reply)=>{
    const userId=requireLearnerOrGuest(request,reply);
    if(!userId)return;
    try{return ok({items:listDueCards(userId,dueQuerySchema.parse(request.query).limit)});}
    catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/me/vocabulary/enroll",async(request,reply)=>{
    if(!requireSameOrigin(request,reply))return;
    const userId=requireLearnerOrGuest(request,reply);
    if(!userId)return;
    try{return ok(enrollQuickStart(userId));}catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/me/decks/:id/enroll",async(request,reply)=>{
    if(!requireSameOrigin(request,reply))return;
    const userId=requireLearnerOrGuest(request,reply);
    if(!userId)return;
    try{
      const id=enrollParam.parse(request.params).id;
      return ok(enrollDeckForGuest(userId,id));
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/me/reviews",async(request,reply)=>{
    if(!requireSameOrigin(request,reply))return;
    const userId=requireLearnerOrGuest(request,reply);
    if(!userId)return;
    try{
      const input=reviewInputSchema.parse(request.body);
      return ok(recordGuestReview(userId,input));
    }catch(err){return fail(reply,err);}
  });
  app.post("/api/v1/me/claim-guest",async(request,reply)=>{
    if(!requireSameOrigin(request,reply))return;
    const actor=getActor(request);
    if(actor?.role!=="learner")
      return reply.code(401).send({success:false,error:{code:"LEARNER_REQUIRED"}});
    const guest=getGuestId(request);
    if(!guest)
      return reply.code(409).send({success:false,error:{code:"GUEST_SESSION_REQUIRED"}});
    try{return ok(transferGuestProgress(guest,actor.id));}
    catch(err){return fail(reply,err);}
  });
}
