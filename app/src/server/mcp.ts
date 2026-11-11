import type { FastifyInstance } from "fastify";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import { listVocabulary, getVocabulary, createVocabularyDraft } from "@/modules/vocabulary/service";
import { vocabularyInput } from "@/modules/vocabulary/schema";
import { needsMcp } from "./auth";

const handler = toNodeHandler(createMcpHandler(() => {
  const server = new McpServer({name:"nihon-vocabulary",version:"0.1.0"});
  server.registerTool("vocabulary_search",{
    description:"Search published Japanese vocabulary, including Kana and Kanji.",
    inputSchema:z.object({search:z.string().max(80).default(""),
      limit:z.number().int().min(1).max(30).default(20)}),
  },async({search,limit})=>({
    content:[{type:"text",text:JSON.stringify(listVocabulary({search,limit}))}],
  }));
  server.registerTool("vocabulary_get",{
    description:"Get one published Japanese vocabulary entry.",
    inputSchema:z.object({id:z.string().uuid()}),
  },async({id})=>({
    content:[{type:"text",text:JSON.stringify(getVocabulary(id))}],
  }));
  server.registerTool("vocabulary_create_draft",{
    description:"Create or deduplicate one unpublished vocabulary entry. Never publishes content.",
    inputSchema:vocabularyInput,
  },async(input)=>{
    const result=createVocabularyDraft({...input,source:"mcp"});
    return {content:[{type:"text",text:JSON.stringify({
      id:result.item.id,created:result.created,status:result.item.status,
    })}]};
  });
  return server;
}));

export function registerMcp(app:FastifyInstance){
  app.all("/mcp",async(req,reply)=>{
    if(!needsMcp(req))return reply.code(401).send({error:"MCP_AUTH_REQUIRED"});
    if(req.method!=="POST")
      return reply.code(405).send({error:"MCP_METHOD_NOT_ALLOWED"});
    // A browser Origin must match this app; non-browser MCP clients send no Origin.
    if(req.headers.origin){
      const expected=process.env.PUBLIC_ORIGIN?.trim() ||
        req.protocol+"://"+req.headers.host;
      if(req.headers.origin!==expected)return reply.code(403).send({error:"MCP_ORIGIN_DENIED"});
    }
    // Guard localhost against DNS rebinding while allowing explicit production host.
    const host=(req.headers.host||"").split(":")[0];
    const knownHost=process.env.PUBLIC_ORIGIN
      ? new URL(process.env.PUBLIC_ORIGIN).hostname
      : ["127.0.0.1","localhost","[::1]"].includes(host);
    if(process.env.PUBLIC_ORIGIN && host!==knownHost)
      return reply.code(403).send({error:"MCP_HOST_DENIED"});
    if(!process.env.PUBLIC_ORIGIN && !knownHost)
      return reply.code(403).send({error:"MCP_HOST_DENIED"});
    reply.hijack();
    await handler(req.raw,reply.raw,req.body);
  });
}
