import type { FastifyInstance } from "fastify";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import { listVocabulary, getVocabulary, createVocabularyDraft } from "@/modules/vocabulary/service";
import { vocabularyInput } from "@/modules/vocabulary/schema";
import { mcpScope, safeOrigin } from "./auth";
import { publicOrigin } from "@/lib/runtime-config";
import { FixedWindowLimiter } from "./rate-limit";

/**
 * DNS rebinding/proxy Host guard. Never trust X-Forwarded-Host/Proto.
 * Production requires an explicitly configured public origin.
 */
export function mcpHostAllowed(
  host: string | undefined,
  publicOrigin: string | undefined,
  production: boolean,
): boolean {
  if (!host || !/^(?:[a-z0-9][a-z0-9.-]*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i.test(host)) {
    return false;
  }
  const configured = publicOrigin?.trim();
  if (!configured && production) return false;
  let protocol = "http:";
  let expectedHost: string | undefined;
  if (configured) {
    try {
      const url = new URL(configured);
      if (!["http:", "https:"].includes(url.protocol) ||
          url.username || url.password || url.pathname !== "/" ||
          url.search || url.hash) return false;
      if (url.origin !== configured) return false;
      protocol = url.protocol;
      expectedHost = url.host;
    } catch { return false; }
  }
  try {
    const authority = new URL(protocol + "//" + host);
    if (authority.pathname !== "/" || authority.search || authority.hash ||
        authority.username || authority.password) return false;
    if (expectedHost) return authority.host === expectedHost;
    return ["127.0.0.1", "localhost", "[::1]"].includes(authority.hostname);
  } catch { return false; }
}

function createHandler(canWrite: boolean) {
  const inner=createMcpHandler(() => {
    const server = new McpServer({name:"nihon-vocabulary",version:"0.1.0"});
    server.registerTool("vocabulary_search", {
      description:"Search published Japanese vocabulary, including Kana and Kanji.",
      inputSchema:z.object({
        search:z.string().max(80).default(""),
        limit:z.number().int().min(1).max(30).default(20),
      }),
    },async({search,limit})=>({
      content:[{type:"text",text:JSON.stringify(listVocabulary({search,limit}))}],
    }));
    server.registerTool("vocabulary_get", {
      description:"Get one published Japanese vocabulary entry.",
      inputSchema:z.object({id:z.string().uuid()}),
    },async({id})=>({
      content:[{type:"text",text:JSON.stringify(getVocabulary(id))}],
    }));
    if (canWrite) {
      server.registerTool("vocabulary_create_draft", {
        description:"Create or deduplicate one unpublished vocabulary entry. Never publishes content.",
        inputSchema:vocabularyInput,
      },async(input)=>{
        const result=createVocabularyDraft({...input,source:"mcp"});
        return {content:[{type:"text",text:JSON.stringify({
          id:result.item.id,created:result.created,status:result.item.status,
        })}]};
      });
    }
    return server;
  });
  return toNodeHandler({fetch:async(request,options)=>{
    const response=await inner.fetch(request,options);
    // The MCP SDK otherwise marks SSE as 'no-cache'; disallow storage outright.
    response.headers.set("Cache-Control","no-store");
    return response;
  }});
}

const readHandler = createHandler(false);
const writeHandler = createHandler(true);

export function registerMcp(app:FastifyInstance):void {
  // Bounded in-process abuse protection. Edge limits are still needed behind proxies.
  const limiter = new FixedWindowLimiter(1024);
  app.addHook("onClose",async()=>{limiter.clear();});
  app.all("/mcp",async(req,reply)=>{
    const scope=mcpScope(req);
    if(!scope)return reply.code(401).send({error:"MCP_AUTH_REQUIRED"});
    if(req.method!=="POST")
      return reply.code(405).send({error:"MCP_METHOD_NOT_ALLOWED"});
    if(!mcpHostAllowed(req.headers.host,publicOrigin(),
      process.env.NODE_ENV==="production"))
      return reply.code(403).send({error:"MCP_HOST_DENIED"});
    // Sec-Fetch-Site can also be cross-site when the Origin header is absent.
    if(req.headers["sec-fetch-site"]==="cross-site" ||
       (req.headers.origin && !safeOrigin(req)))
      return reply.code(403).send({error:"MCP_ORIGIN_DENIED"});
    const decision=limiter.consume(req.ip+"|"+scope,120,60_000);
    if(!decision.allowed) {
      reply.header("Retry-After",String(decision.retryAfterSeconds));
      return reply.code(429).send({error:"MCP_RATE_LIMITED"});
    }
    reply.raw.setHeader("Cache-Control","no-store");
    reply.raw.setHeader("X-Content-Type-Options","nosniff");
    reply.hijack();
    await (scope==="write"?writeHandler:readHandler)(req.raw,reply.raw,req.body);
  });
}
