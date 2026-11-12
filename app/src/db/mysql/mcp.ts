import { createHash } from "node:crypto";
import { createMcpHandler,McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import type { FastifyRequest,FastifyReply } from "fastify";
import type { openMySQL } from "./connector";
import { mysqlAuth } from "./auth";
import { mysqlVocabulary } from "./vocabulary";
import { mysqlTopics } from "./topics";
import { mysqlDecks } from "./decks";
import { mysqlBatch,batchErrorCode } from "./batch";
import { topicInput,lessonInput,lessonBatchInput,emptyInput } from "@/modules/vocabulary/batch-schema";
import { vocabularyInput } from "@/modules/vocabulary/schema";
import { mcpHostAllowed } from "@/lib/mcp-host";
import { FixedWindowLimiter } from "@/server/rate-limit";
import { AnonymousMcpLessons,mcpNoAuthEnabled,mcpWriteCost } from "@/lib/mcp-access";

type Db=ReturnType<typeof openMySQL>["db"];
export function mysqlMcp(db:Db){
  const auth=mysqlAuth(db),vocab=mysqlVocabulary(db),topics=mysqlTopics(db),
    decks=mysqlDecks(db),batch=mysqlBatch(db);
  const limiter=new FixedWindowLimiter(1024);
  // Public test-only batch imports are much costlier than read-only MCP calls.
  const publicBatchLimiter=new FixedWindowLimiter(64);
  const writeLimiter=new FixedWindowLimiter(2048);
  const anonymousLessons=new AnonymousMcpLessons();
  const create=(canWrite:boolean)=>{
    const server=createMcpHandler(()=>{
      const mcp=new McpServer({name:"nihon-vocabulary",version:"0.1.0"});
      const respond=async(work:()=>Promise<unknown>)=>{
        try{return {content:[{type:"text" as const,text:JSON.stringify(await work())}]};}
        catch(error){return {isError:true,content:[{type:"text" as const,
          text:JSON.stringify({error:{code:error instanceof Error &&
            error.message==="MCP_LESSON_UNAVAILABLE"?"MCP_LESSON_UNAVAILABLE":batchErrorCode(error)}})}]};}
      };
      mcp.registerTool("vocabulary_search",{
        description:"Search published Japanese vocabulary, including Kana and Kanji.",
        inputSchema:z.object({search:z.string().max(80).default(""),
          limit:z.number().int().min(1).max(30).default(20)}).strict(),
      },async({search,limit})=>respond(()=>vocab.list({search,limit})));
      mcp.registerTool("vocabulary_get",{
        description:"Get one published Japanese vocabulary entry.",
        inputSchema:z.object({id:z.string().uuid()}).strict(),
      },async({id})=>respond(()=>vocab.get(id)));
      mcp.registerTool("topics_list",{
        description:"List topics visible to this connection.",inputSchema:emptyInput,
      },async(input)=>respond(async()=>{
        emptyInput.parse(input);
        return {items:await topics.list(canWrite&&!mcpNoAuthEnabled())};
      }));
      const lessonsListInput=z.object({topicId:z.string().uuid().optional()}).strict();
      mcp.registerTool("lessons_list",{
        description:"List lessons, optionally restricted to one topic.",inputSchema:lessonsListInput,
      },async(input)=>respond(async()=>{
        const {topicId}=lessonsListInput.parse(input);
        const items=await decks.list(canWrite&&!mcpNoAuthEnabled());
        return {items:topicId?items.filter(item=>item.topicId===topicId):items};
      }));
      const lessonGetInput=z.object({lessonId:z.string().uuid()}).strict();
      mcp.registerTool("lesson_get",{
        description:"Get a lesson. Writer connections can inspect draft entries.",inputSchema:lessonGetInput,
      },async(input)=>respond(async()=>{
        const {lessonId}=lessonGetInput.parse(input);
        const result=await decks.get(lessonId,canWrite&&!mcpNoAuthEnabled());
        if(!result)throw new Error("LESSON_NOT_FOUND");
        return result;
      }));
      if(canWrite){
        mcp.registerTool("topics_create",{
          description:"Create or reuse a topic. Never publishes content.",inputSchema:topicInput,
        },async(input)=>respond(async()=>{
          const result=await topics.getOrCreate(topicInput.parse(input));
          // A duplicate name must not disclose a private topic description.
          return mcpNoAuthEnabled()?{topic:{id:result.topic.id},created:result.created}:result;
        }));
        mcp.registerTool("lessons_create",{
          description:"Create a private lesson or reuse an existing lesson. Never publishes content.",inputSchema:lessonInput,
        },async(input)=>respond(async()=>{
          const payload=lessonInput.parse(input);
          const anonymous=mcpNoAuthEnabled();
          if(anonymous&&!anonymousLessons.canCreate())
            throw new Error("MCP_LESSON_UNAVAILABLE");
          const result=await decks.getOrCreate(payload);
          if(!anonymous)return result;
          if(!anonymousLessons.allow(result.lesson.id,result.created))
            throw new Error("MCP_LESSON_UNAVAILABLE");
          // MySQL getOrCreate returns all draft entries for existing lessons.
          return {lesson:{id:result.lesson.id},created:result.created};
        }));
        mcp.registerTool("lesson_add_vocabulary_batch",{
          description:"Add 1–100 vocabulary drafts to a private lesson by lessonId, or by topicName and lessonName. Retries deduplicate. Never publishes content.",
          inputSchema:lessonBatchInput,
        },async(raw)=>respond(async()=>{
          const input=lessonBatchInput.parse(raw);
          const anonymous=mcpNoAuthEnabled();
          if(anonymous){
            const decision=publicBatchLimiter.consume("public-batch",5,60_000);
            if(!decision.allowed)throw new Error("MCP_BATCH_RATE_LIMITED");
            if(input.lessonId!==undefined&&!anonymousLessons.has(input.lessonId)){
              // Preserve the existing anonymous import workflow for an
              // empty private lesson. Never claim a lesson with draft entries.
              const target=await decks.get(input.lessonId,true);
              if(!target||target.visibility!=="private"||target.entries.length>0||
                 !anonymousLessons.allow(input.lessonId,true))
                throw new Error("MCP_LESSON_UNAVAILABLE");
            }
            if(input.lessonId===undefined&&!anonymousLessons.canCreate())
              throw new Error("MCP_LESSON_UNAVAILABLE");
          }
          let lessonId:string;
          if(input.lessonId!==undefined)lessonId=input.lessonId;
          else{
            const {topic}=await topics.getOrCreate({name:input.topicName!});
            const {lesson,created}=await decks.getOrCreate({name:input.lessonName!,topicId:topic.id});
            if(anonymous&&!anonymousLessons.allow(lesson.id,created))
              throw new Error("MCP_LESSON_UNAVAILABLE");
            lessonId=lesson.id;
          }
          return batch.addToLesson(lessonId,input.items.map(item=>({...item,source:"mcp" as const})));
        }));
      }
      if(canWrite)mcp.registerTool("vocabulary_create_draft",{
        description:"Create or deduplicate one unpublished vocabulary entry. Never publishes content.",
        inputSchema:vocabularyInput,
      },async(input)=>respond(async()=>{
        const result=await vocab.createDraft({...vocabularyInput.parse(input),source:"mcp"});
        // A public deduplication must not expose an existing private entry ID/status.
        if(mcpNoAuthEnabled())return {accepted:true,operation:"draft_request"};
        return {id:result.item.id,created:result.created,status:result.item.status};
      }));
      return mcp;
    });
    return toNodeHandler({fetch:async(request,options)=>{
      const response=await server.fetch(request,options);
      response.headers.set("Cache-Control","no-store");
      return response;
    }});
  };
  const readers=create(false),writers=create(true);
  const handler=async(req:FastifyRequest,reply:FastifyReply)=>{
    // Explicit, isolated no-auth mode: every client gets the full MCP
    // writer toolset. Default behavior remains scoped Bearer authorization.
    // Host, Origin and rate-limit guards still apply to public requests.
    const anonymous=mcpNoAuthEnabled();
    const scope=anonymous?"write":await auth.scope(req);
    if(!scope){reply.code(401).send({error:"MCP_AUTH_REQUIRED"});return;}
    if(req.method!=="POST"){
      reply.code(405).send({error:"MCP_METHOD_NOT_ALLOWED"});return;
    }
    if(!mcpHostAllowed(req.headers.host,await auth.settings.origin(),
      process.env.NODE_ENV==="production")){
      reply.code(403).send({error:"MCP_HOST_DENIED"});return;
    }
    if(req.headers["sec-fetch-site"]==="cross-site"||
      (req.headers.origin&&!await auth.sameOrigin(req))){
      reply.code(403).send({error:"MCP_ORIGIN_DENIED"});return;
    }
    const decision=limiter.consume(req.ip+"|"+scope,120,60_000);
    if(!decision.allowed){
      reply.header("Retry-After",String(decision.retryAfterSeconds));
      reply.code(429).send({error:"MCP_RATE_LIMITED"});return;
    }
    if(scope==="write"){
      const cost=mcpWriteCost(req.body);
      if(cost>0){
        // Limit aggregate DB writes from all anonymous IPs. With tokens,
        // fingerprint the token; never retain credentials in limiter keys.
        const fingerprint=anonymous?"anonymous":createHash("sha256")
          .update(String(req.headers.authorization||"")).digest("hex");
        const budgets=anonymous?[
          ["anonymous|ip|"+req.ip,250,60_000],
          ["anonymous|global|minute",250,60_000],
          ["anonymous|global|hour",500,3_600_000],
        ] as const:[
          ["writer|ip|"+req.ip,250,60_000],
          ["writer|token|"+fingerprint,1000,3_600_000],
        ] as const;
        for(const [key,max,window] of budgets){
          const outcome=writeLimiter.consume(key,max,window,Date.now(),cost);
          if(!outcome.allowed){
            reply.header("Retry-After",String(outcome.retryAfterSeconds));
            reply.code(429).send({error:"MCP_WRITE_RATE_LIMITED"});return;
          }
        }
      }
    }
    reply.raw.setHeader("Cache-Control","no-store");
    reply.raw.setHeader("X-Content-Type-Options","nosniff");
    reply.hijack();
    await (scope==="write"?writers:readers)(req.raw,reply.raw,req.body);
  };
  return {handler,close:()=>{
    limiter.clear();publicBatchLimiter.clear();writeLimiter.clear();
    anonymousLessons.clear();
  }};
}
