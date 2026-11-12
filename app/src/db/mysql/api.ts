import { randomBytes } from "node:crypto";
import type { FastifyReply,FastifyRequest } from "fastify";
import { z,ZodError } from "zod";
import type { openMySQL } from "./connector";
import { mysqlAuth } from "./auth";
import { mysqlVocabulary } from "./vocabulary";
import { mysqlDecks } from "./decks";
import { mysqlTopics } from "./topics";
import { mysqlBatch } from "./batch";
import { topicInput,lessonInput,batchInput,publishSelectedInput,emptyInput } from "@/modules/vocabulary/batch-schema";
import { mysqlLearning } from "./learning";
import { mysqlAI } from "./ai";
import { vocabularyInput,listQuery } from "@/modules/vocabulary/schema";
import { createDeckInput,entryIdSchema } from "@/modules/decks/schema";
import { generationRequestSchema,candidateSchema } from "@/modules/ai/schema";
import { dueQuerySchema,reviewInputSchema } from "@/modules/learning/schema";
import { registerInputSchema } from "@/modules/accounts/schema";
import { verifyAdminPassword } from "@/lib/admin-password";
import { FixedWindowLimiter } from "@/server/rate-limit";
import { verifyOpenAIModelAccess } from "@/lib/integration-diagnostics";
import { mcpNoAuthEnabled } from "@/lib/mcp-access";

type Db=ReturnType<typeof openMySQL>["db"];
const uuid=z.string().uuid();
const loginInput=z.object({username:z.string().min(1).max(50),
  password:z.string().min(1).max(256)}).strict();
const adminInput=z.object({password:z.string().min(1).max(256)}).strict();
const settingsInput=z.object({
  origin:z.string().url().min(1).max(250),enableSignup:z.boolean(),
  aiModel:z.string().trim().min(2).max(100).regex(/^[a-z0-9._-]+$/i),
  aiDailyLimit:z.number().int().min(1).max(100),
  openaiApiKey:z.string().trim().min(10).max(4096).optional(),
}).strict();
function assertOrigin(origin:string){
  let url:URL;
  try{url=new URL(origin);}catch{throw new Error("ORIGIN_INVALID");}
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||
    url.pathname!=="/"||url.search||url.hash||url.origin!==origin)
    throw new Error("ORIGIN_INVALID");
  if(process.env.NODE_ENV==="production"&&url.protocol!=="https:"&&
    !["localhost","127.0.0.1","[::1]"].includes(url.hostname))
    throw new Error("HTTPS_ORIGIN_REQUIRED");
  return origin;
}
function ok(data:unknown,extra:object={}){return {success:true,data,...extra};}
function fail(reply:FastifyReply,error:unknown){
  if(error instanceof ZodError)return reply.code(400).send({
    success:false,error:{code:"VALIDATION_ERROR",details:error.issues},
  });
  const code=error instanceof Error&&/^[A-Z_]{4,70}$/.test(error.message)
    ?error.message:"INTERNAL_ERROR";
  const status=code==="INTERNAL_ERROR"?500:code.includes("NOT_FOUND")?404:
    code.includes("LIMIT")||code.includes("QUOTA")?429:
    code.includes("CONFLICT")||code.includes("DUPLICATE")||
    code.includes("ALREADY")||code.includes("EMPTY")||
    code==="VOCABULARY_NOT_DRAFT"||code==="REVIEW_CARD_NOT_DUE"?409:400;
  return reply.code(status).send({success:false,error:{code}});
}
export function mysqlApi(db:Db){
  const auth=mysqlAuth(db),vocab=mysqlVocabulary(db),decks=mysqlDecks(db),
    learning=mysqlLearning(db),ai=mysqlAI(db),topics=mysqlTopics(db),batch=mysqlBatch(db);
  const settings=auth.settings;
  const backupLimiter=new FixedWindowLimiter(256);
  const providerLimiter=new FixedWindowLimiter(256);
  return async function handle(request:FastifyRequest,reply:FastifyReply):Promise<void>{
    const method=request.method;
    const pathname=new URL(request.url,"http://localhost").pathname;
    // MySQL-only Fastify deliberately has no legacy SQLite route registrations.
    // Extract the exact UUID from the matched REST path, not request.params.
    const parameter=()=>{
      const parts=pathname.split("/").filter(Boolean);
      const last=parts[parts.length-1];
      const suffixes=new Set(["publish","entries","enroll","accept","reject"]);
      const candidate=suffixes.has(last??"")?parts[parts.length-2]:last;
      return uuid.parse(candidate);
    };
    const protect=()=>auth.requireAdmin(request,reply);
    const csrf=()=>auth.requireSameOrigin(request,reply);
    try{
      if(method==="GET"&&pathname==="/api/v1/health"){
        reply.send(ok({status:"ok",service:"nihon-fastify",framework:"fastify",database:"mysql"}));
        return;
      }
      if(method==="GET"&&pathname==="/api/v1/auth/me"){
        reply.send(ok({user:await auth.actor(request),
          signUpEnabled:await settings.signup(),guest:Boolean(auth.guest(request))}));
        return;
      }
      if(method==="POST"&&pathname==="/api/v1/auth/admin/login"){
        if(!await csrf())return;
        const {password}=adminInput.parse(request.body);
        const hash=await settings.adminHash();
        if(!hash||!await auth.accounts.adminPasswordAllowed()){
          reply.code(401).send({success:false,error:{code:"INVALID_CREDENTIALS"}});return;
        }
        const valid=verifyAdminPassword(password,hash);
        await auth.accounts.recordAdminLogin(valid);
        if(!valid){reply.code(401).send({success:false,error:{code:"INVALID_CREDENTIALS"}});return;}
        await auth.setCookie(request,reply,"nihon-local-admin");
        reply.send(ok({role:"admin",name:"Nihon Admin"}));return;
      }
      if(method==="POST"&&pathname==="/api/v1/auth/learner/register"){
        if(!await csrf())return;
        const user=await auth.accounts.register(registerInputSchema.parse(request.body));
        reply.code(201).send(ok(user));return;
      }
      if(method==="POST"&&pathname==="/api/v1/auth/learner/login"){
        if(!await csrf())return;
        const {username,password}=loginInput.parse(request.body);
        const user=await auth.accounts.authenticate(username,password);
        if(!user){reply.code(401).send({success:false,error:{code:"INVALID_CREDENTIALS"}});return;}
        await auth.setCookie(request,reply,user.id);
        reply.send(ok({id:user.id,name:user.name,role:"learner"}));return;
      }
      if(method==="POST"&&pathname==="/api/v1/auth/learner/password"){
        if(!await csrf())return;
        const user=await auth.actor(request);
        if(user?.role!=="learner"){
          reply.code(401).send({success:false,error:{code:"LEARNER_REQUIRED"}});return;
        }
        try{
          await auth.accounts.changePassword(user.id,request.body);
          await auth.setCookie(request,reply,user.id);
          reply.send(ok({passwordChanged:true,otherSessionsRevoked:true}));return;
        }catch(error){
          if(error instanceof Error && ["INVALID_CREDENTIALS","LEARNER_REQUIRED"].includes(error.message)){
            reply.code(401).send({success:false,error:{code:"INVALID_CREDENTIALS"}});return;
          }
          throw error;
        }
      }
      if(method==="POST"&&pathname==="/api/v1/auth/logout"){
        if(!await csrf())return;
        await auth.logout(request,reply);
        reply.send(ok({loggedOut:true}));return;
      }

      if(method==="GET"&&pathname==="/api/v1/vocabulary"){
        reply.send(ok(await vocab.list(listQuery.parse(request.query))));return;
      }
      if(method==="GET"&&/^\/api\/v1\/vocabulary\/[^/]+$/.test(pathname)){
        const item=await vocab.get(parameter());
        if(!item){reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});return;}
        reply.send(ok(item));return;
      }
      if(pathname==="/api/v1/admin/vocabulary"){
        if(!await protect())return;
        if(method==="GET"){
          reply.send(ok(await vocab.list({...listQuery.parse(request.query),includeDrafts:true})));return;
        }
        if(method==="POST"){
          const result=await vocab.createDraft(vocabularyInput.parse(request.body));
          reply.code(result.created?201:200).send(ok(result.item,{duplicate:!result.created}));return;
        }
      }
      if(method==="POST"&&/^\/api\/v1\/admin\/vocabulary\/[^/]+\/publish$/.test(pathname)){
        if(!await protect())return;
        reply.send(ok(await vocab.publish(parameter())));return;
      }

      if(method==="GET"&&pathname==="/api/v1/topics"){
        reply.send(ok({items:await topics.list()}));return;
      }
      const topicLessonsRoute=/^\/api\/v1\/topics\/([^/]+)\/lessons$/.exec(pathname);
      if(method==="GET"&&topicLessonsRoute){
        const id=uuid.parse(topicLessonsRoute[1]);
        // Filter the public list: private lessons and draft entries stay private.
        const topic=await topics.get(id);
        const items=(await decks.list()).filter(deck=>deck.topicId===id);
        if(!topic||!items.length){
          reply.send(ok({items:[]}));return;
        }
        reply.send(ok({items}));return;
      }
      if(pathname==="/api/v1/admin/topics"){
        if(!await protect())return;
        if(method==="GET"){reply.send(ok({items:await topics.list(true)}));return;}
        if(method==="POST"){
          const result=await topics.getOrCreate(topicInput.parse(request.body));
          reply.code(result.created?201:200).send(ok(result.topic));return;
        }
      }
      if(pathname==="/api/v1/admin/lessons"){
        if(!await protect())return;
        if(method==="GET"){reply.send(ok({items:await decks.list(true)}));return;}
        if(method==="POST"){
          reply.code(201).send(ok(await decks.create(lessonInput.parse(request.body))));return;
        }
      }
      const lessonRoute=/^\/api\/v1\/admin\/lessons\/([^/]+)(?:\/(batch|publish-selected|publish-all|publish))?$/.exec(pathname);
      if(lessonRoute){
        if(!await protect())return;
        const id=uuid.parse(lessonRoute[1]),action=lessonRoute[2];
        if(method==="GET"&&!action){
          const data=await decks.get(id,true);
          if(!data){reply.code(404).send({success:false,error:{code:"LESSON_NOT_FOUND"}});return;}
          reply.send(ok(data));return;
        }
        if(method==="POST"&&action==="batch"){
          const {items}=batchInput.parse(request.body);
          reply.send(ok(await batch.addToLesson(id,items)));return;
        }
        if(method==="POST"&&action==="publish-selected"){
          const {entryIds}=publishSelectedInput.parse(request.body);
          reply.send(ok(await batch.publishSelected(id,entryIds)));return;
        }
        if(method==="POST"&&(action==="publish-all"||action==="publish")){
          emptyInput.parse(request.body);
          const result=await batch.publishAll(id);
          if(action==="publish-all"){reply.send(ok(result));return;}
          if(result.errors.length)throw new Error("DECK_HAS_UNPUBLISHED_ITEMS");
          reply.send(ok({id:await decks.publish(id)}));return;
        }
      }

      if(method==="GET"&&pathname==="/api/v1/decks"){
        reply.send(ok({items:await decks.list()}));return;
      }
      if(method==="GET"&&/^\/api\/v1\/decks\/[^/]+$/.test(pathname)){
        const deck=await decks.get(parameter());
        if(!deck){reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});return;}
        reply.send(ok(deck));return;
      }
      if(pathname==="/api/v1/admin/decks"){
        if(!await protect())return;
        if(method==="GET"){reply.send(ok({items:await decks.list(true)}));return;}
        if(method==="POST"){
          reply.code(201).send(ok(await decks.create(createDeckInput.parse(request.body))));return;
        }
      }
      if(/^\/api\/v1\/admin\/decks\/[^/]+(?:\/(entries|publish))?$/.test(pathname)){
        if(!await protect())return;
        if(method==="GET"&&/^\/api\/v1\/admin\/decks\/[^/]+$/.test(pathname)){
          const data=await decks.get(parameter(),true);
          if(!data){reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});return;}
          reply.send(ok(data));return;
        }
        if(method==="POST"&&pathname.endsWith("/entries")){
          const data=z.object({entryId:entryIdSchema}).parse(request.body);
          reply.send(ok({created:await decks.addEntry(parameter(),data.entryId)}));return;
        }
        if(method==="POST"&&pathname.endsWith("/publish")){
          reply.send(ok({id:await decks.publish(parameter())}));return;
        }
      }
      if(pathname.startsWith("/api/v1/admin/ai/")){
        if(!await protect())return;
        if(method==="POST"&&pathname==="/api/v1/admin/ai/verify"){
          // Never send an untrusted destination or user-supplied URL to the
          // provider. Only verify the saved key and saved model. Rate limiting
          // happens AFTER Admin authorization.
          const limit=providerLimiter.consume(
            request.ip+"|openai-verify",5,15*60_000,
          );
          if(!limit.allowed){
            reply.header("Retry-After",String(limit.retryAfterSeconds));
            reply.code(429).send({success:false,error:{code:"RATE_LIMITED"}});
            return;
          }
          const result=await verifyOpenAIModelAccess(
            await settings.key("openai_api_key"),await settings.model(),
          );
          reply.header("Cache-Control","no-store");
          reply.send(ok(result));return;
        }
        if(method==="GET"&&pathname==="/api/v1/admin/ai/config"){
          reply.send(ok({
            configured:Boolean(await settings.key("openai_api_key")),
            model:await settings.model(),dailyLimit:await settings.dailyLimit(),
            remaining:await ai.remaining(),
          }));return;
        }
        if(method==="GET"&&pathname==="/api/v1/admin/ai/jobs"){
          reply.send(ok({items:await ai.jobs()}));return;
        }
        if(method==="POST"&&pathname==="/api/v1/admin/ai/jobs"){
          const id=await ai.generate(generationRequestSchema.parse(request.body));
          reply.code(201).send(ok({id}));return;
        }
        if(method==="GET"&&pathname.startsWith("/api/v1/admin/ai/jobs/")){
          const data=await ai.getJob(parameter());
          if(!data){reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});return;}
          reply.send(ok(data));return;
        }
        if(pathname.startsWith("/api/v1/admin/ai/candidates/")){
          if(method==="PATCH"){
            await ai.edit(parameter(),candidateSchema.parse(request.body));
            reply.send(ok({saved:true}));return;
          }
          if(method==="POST"&&pathname.endsWith("/accept")){
            reply.send(ok({entryId:await ai.accept(parameter())}));return;
          }
          if(method==="POST"&&pathname.endsWith("/reject")){
            await ai.reject(parameter());
            reply.send(ok({rejected:true}));return;
          }
        }
      }

      if(method==="GET"&&pathname==="/api/v1/me/session"){
        await auth.ensureGuest(request,reply);
        reply.send(ok({ready:true,user:await auth.actor(request),
          guest:Boolean(auth.guest(request))}));return;
      }
      if(pathname.startsWith("/api/v1/me/")){
        if(method==="POST"&&!await csrf())return;
        const userId=await auth.requireLearning(request,reply);
        if(!userId)return;
        if(method==="GET"&&pathname==="/api/v1/me/progress"){
          reply.send(ok(await learning.progress(userId)));return;
        }
        if(method==="GET"&&pathname==="/api/v1/me/reviews/due"){
          reply.send(ok({items:await learning.due(userId,
            dueQuerySchema.parse(request.query).limit)}));return;
        }
        if(method==="POST"&&pathname==="/api/v1/me/vocabulary/enroll"){
          reply.send(ok(await learning.enrollQuickStart(userId)));return;
        }
        if(method==="POST"&&pathname.endsWith("/enroll")&&
          pathname.startsWith("/api/v1/me/decks/")){
          reply.send(ok(await learning.enrollDeck(userId,parameter())));return;
        }
        if(method==="POST"&&pathname==="/api/v1/me/reviews"){
          reply.send(ok(await learning.review(userId,
            reviewInputSchema.parse(request.body))));return;
        }
        if(method==="POST"&&pathname==="/api/v1/me/claim-guest"){
          const user=await auth.actor(request);
          if(user?.role!=="learner"){
            reply.code(401).send({success:false,error:{code:"LEARNER_REQUIRED"}});return;
          }
          const guest=auth.guest(request);
          if(!guest){
            reply.code(409).send({success:false,error:{code:"GUEST_SESSION_REQUIRED"}});return;
          }
          reply.send(ok(await learning.transfer(guest,user.id)));return;
        }
      }

      if(pathname==="/api/v1/admin/backups/mysql" ||
         pathname.startsWith("/api/v1/admin/backups/mysql/")){
        if(!await protect())return;
        if(method==="POST"){
          const operation=pathname==="/api/v1/admin/backups/mysql"
            ?"create":pathname.slice(pathname.lastIndexOf("/")+1);
          const quotas:Record<string,number>={create:5,verify:15,stage:6,delete:15};
          const limit=quotas[operation];
          if(limit){
            const decision=backupLimiter.consume(request.ip+"|"+operation,limit,60*60_000);
            if(!decision.allowed){
              reply.header("Retry-After",String(decision.retryAfterSeconds));
              reply.code(429).send({success:false,error:{code:"RATE_LIMITED"}});return;
            }
          }
        }
        const {createMySQLBackup,listMySQLBackups,verifyMySQLBackup,
          downloadableMySQLBackup,deleteLocalMySQLBackup}=await import("./backup");
        if(method==="GET"&&pathname==="/api/v1/admin/backups/mysql"){
          reply.send(ok({items:listMySQLBackups()}));return;
        }
        if(method==="POST"&&pathname==="/api/v1/admin/backups/mysql"){
          const {currentMySQLConnection}=await import("./runtime");
          const result=await createMySQLBackup(currentMySQLConnection());
          reply.code(201).send(ok(result));return;
        }
        const backupRoute=/^\/api\/v1\/admin\/backups\/mysql\/(mysql-\d{8}-[a-f0-9]{24}\.nihonbak)\/(verify|download|stage|delete)$/.exec(pathname);
        if(backupRoute){
          const id=backupRoute[1]!;
          if(method==="POST"&&backupRoute[2]==="verify"){
            reply.send(ok(await verifyMySQLBackup(id)));return;
          }
          if(method==="POST"&&backupRoute[2]==="stage"){
            const input=z.object({
              database:z.string().min(1).max(64),
              confirmation:z.literal("RESTORE_TO_EMPTY_STAGING"),
            }).strict().parse(request.body);
            const {currentMySQLConnection}=await import("./runtime");
            const {rehearseMySQLRestore}=await import("./restore-drill");
            reply.send(ok(await rehearseMySQLRestore(id,currentMySQLConnection(),
              input.database)));return;
          }
          if(method==="POST"&&backupRoute[2]==="delete"){
            z.object({confirmation:z.literal("DELETE_LOCAL_BACKUP")}).strict()
              .parse(request.body);
            await deleteLocalMySQLBackup(id);
            reply.send(ok({deleted:true,id}));return;
          }
          if(method==="GET"&&backupRoute[2]==="download"){
            const {path,size}=downloadableMySQLBackup(id);
            const {createReadStream}=await import("node:fs");
            reply.header("Cache-Control","no-store");
            reply.header("Content-Disposition",'attachment; filename="'+id+'"');
            reply.header("Content-Length",String(size));
            reply.type("application/octet-stream");
            reply.send(createReadStream(path));return;
          }
        }
      }
      if(pathname.startsWith("/api/v1/admin/settings/mysql/")){
        if(!await protect())return;
        const {currentMySQLConnection,rotateMySQLConnection}=
          await import("./runtime");
        const {testMySQLConnection,mysqlConnectionSchema}=
          await import("./connector");
        const current=currentMySQLConnection();
        if(method==="GET"&&pathname==="/api/v1/admin/settings/mysql/connection"){
          const {password:_password,...publicInfo}=current;
          void _password;
          reply.send(ok({...publicInfo,passwordConfigured:Boolean(current.password)}));
          return;
        }
        if(method==="GET"&&pathname==="/api/v1/admin/settings/mysql/health"){
          const result=await testMySQLConnection(current);
          reply.send(ok(result));return;
        }
        if(method==="POST"&&pathname==="/api/v1/admin/settings/mysql/test"){
          const updates=mysqlConnectionSchema.partial().parse(request.body);
          const merged=mysqlConnectionSchema.parse({...current,...updates,
            password:updates.password===undefined?current.password:updates.password});
          reply.send(ok(await testMySQLConnection(merged)));
          return;
        }
        if(method==="PATCH"&&pathname==="/api/v1/admin/settings/mysql/connection"){
          const updates=mysqlConnectionSchema.partial().parse(request.body);
          const merged=mysqlConnectionSchema.parse({...current,...updates,
            password:updates.password===undefined?current.password:updates.password});
          await rotateMySQLConnection(merged);
          reply.send(ok({connected:true,database:merged.database,reconfigured:true}));
          return;
        }
      }
      if(method==="GET"&&pathname==="/api/v1/admin/integrations/diagnostics"){
        if(!await protect())return;
        const origin=await settings.origin();
        const [apiKey,model,readToken,writeToken,restToken]=await Promise.all([
          settings.key("openai_api_key"),
          settings.model(),
          settings.key("mcp_read_token"),
          settings.key("mcp_write_token"),
          settings.key("admin_rest_token"),
        ]);
        reply.header("Cache-Control","no-store");
        reply.send(ok({
          database:{engine:"mysql",connected:true},
          ai:{provider:"openai",configured:Boolean(apiKey),model,
            verification:"not_checked"},
          mcp:{
            endpoint:origin?origin+"/mcp":null,
            readConfigured:Boolean(readToken),
            writeConfigured:Boolean(writeToken),
            readTools:["vocabulary_search","vocabulary_get","topics_list","lessons_list","lesson_get"],
            writeTools:["vocabulary_search","vocabulary_get","vocabulary_create_draft",
              "topics_list","topics_create","lessons_list","lessons_create","lesson_get",
              "lesson_add_vocabulary_batch"],
            bearerRequired:!mcpNoAuthEnabled(),
            noAuthWriteEnabled:mcpNoAuthEnabled(),
            connectionVerified:false,
          },
          rest:{configured:Boolean(restToken)},
        }));
        return;
      }
      if(pathname==="/api/v1/admin/settings"){
        if(!await protect())return;
        if(method==="GET"){
          reply.send(ok({
            database:"mysql",mysqlAvailable:true,
            origin:await settings.origin()||"",enableSignup:await settings.signup(),
            aiModel:await settings.model(),aiDailyLimit:await settings.dailyLimit(),
            openaiConfigured:Boolean(await settings.key("openai_api_key")),
            mcpReadConfigured:Boolean(await settings.key("mcp_read_token")),
            mcpWriteConfigured:Boolean(await settings.key("mcp_write_token")),
            restConfigured:Boolean(await settings.key("admin_rest_token")),
            envFallback:{openai:false,mcpRead:false,mcpWrite:false},
          }));return;
        }
        if(method==="PATCH"){
          const input=settingsInput.parse(request.body);
          assertOrigin(input.origin);
          const values:Record<string,string>={
            public_origin:input.origin,enable_signup:String(input.enableSignup),
            ai_model:input.aiModel,ai_daily_limit:String(input.aiDailyLimit),
          };
          if(input.openaiApiKey){
            const {encryptValue}=await import("@/lib/runtime-config");
            values.openai_api_key=encryptValue(input.openaiApiKey);
          }
          await settings.batch(values);
          reply.send(ok({saved:true,
            openaiConfigured:Boolean(await settings.key("openai_api_key"))}));return;
        }
      }
      if(method==="DELETE"&&pathname==="/api/v1/admin/settings/openai"){
        if(!await protect())return;
        await settings.revokeKey("openai_api_key");
        reply.send(ok({deleted:true,stillConfigured:Boolean(await settings.key("openai_api_key"))}));return;
      }
      if(pathname.startsWith("/api/v1/admin/settings/tokens/")){
        if(!await protect())return;
        const scope=pathname.slice("/api/v1/admin/settings/tokens/".length);
        const key=scope==="read"?"mcp_read_token":scope==="write"?
          "mcp_write_token":scope==="rest"?"admin_rest_token":null;
        if(!key){reply.code(404).send({success:false,error:{code:"NOT_FOUND"}});return;}
        if(method==="POST"){
          const token=randomBytes(36).toString("base64url");
          await settings.storeKey(key,token);
          reply.send(ok({scope,token,showOnce:true}));return;
        }
        if(method==="DELETE"){
          await settings.revokeKey(key);
          reply.send(ok({scope,deleted:true}));return;
        }
      }
      reply.code(404).send({success:false,error:{code:"ROUTE_NOT_FOUND"}});
    }catch(error){fail(reply,error);}
  };
}
