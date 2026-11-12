import { createMcpHandler,McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import type { FastifyRequest,FastifyReply } from "fastify";
import type { openMySQL } from "./connector";
import { mysqlAuth } from "./auth";
import { mysqlVocabulary } from "./vocabulary";
import { vocabularyInput } from "@/modules/vocabulary/schema";
import { mcpHostAllowed } from "@/server/mcp";
import { FixedWindowLimiter } from "@/server/rate-limit";

type Db=ReturnType<typeof openMySQL>["db"];
export function mysqlMcp(db:Db){
  const auth=mysqlAuth(db),vocab=mysqlVocabulary(db);
  const limiter=new FixedWindowLimiter(1024);
  const create=(canWrite:boolean)=>{
    const server=createMcpHandler(()=>{
      const mcp=new McpServer({name:"nihon-vocabulary",version:"0.1.0"});
      mcp.registerTool("vocabulary_search",{
        description:"Search published Japanese vocabulary, including Kana and Kanji.",
        inputSchema:z.object({search:z.string().max(80).default(""),
          limit:z.number().int().min(1).max(30).default(20)}),
      },async({search,limit})=>({
        content:[{type:"text",text:JSON.stringify(await vocab.list({search,limit}))}],
      }));
      mcp.registerTool("vocabulary_get",{
        description:"Get one published Japanese vocabulary entry.",
        inputSchema:z.object({id:z.string().uuid()}),
      },async({id})=>({
        content:[{type:"text",text:JSON.stringify(await vocab.get(id))}],
      }));
      if(canWrite)mcp.registerTool("vocabulary_create_draft",{
        description:"Create or deduplicate one unpublished vocabulary entry. Never publishes content.",
        inputSchema:vocabularyInput,
      },async(input)=>{
        const result=await vocab.createDraft({...input,source:"mcp"});
        return {content:[{type:"text",text:JSON.stringify({
          id:result.item.id,created:result.created,status:result.item.status,
        })}]};
      });
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
    const scope=await auth.scope(req);
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
    reply.raw.setHeader("Cache-Control","no-store");
    reply.raw.setHeader("X-Content-Type-Options","nosniff");
    reply.hijack();
    await (scope==="write"?writers:readers)(req.raw,reply.raw,req.body);
  };
  return {handler,close:()=>limiter.clear()};
}
