import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { validBearer } from "@/lib/auth";
import { unauthorized, errorResponse } from "@/lib/api";
import { createVocabularyDraft, getVocabulary, listVocabulary } from "@/modules/vocabulary/service";
import { vocabularyInput } from "@/modules/vocabulary/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler((server) => {
  server.registerTool("vocabulary_search", {
    title: "Search Japanese vocabulary",
    description: "Search published Japanese vocabulary by spelling or reading.",
    inputSchema: z.object({ search: z.string().max(80).default(""), limit: z.number().int().min(1).max(30).default(20) }),
  }, async ({ search, limit }) => ({
    content: [{ type: "text", text: JSON.stringify(listVocabulary({ search, limit })) }],
  }));

  server.registerTool("vocabulary_get", {
    title: "Get a vocabulary entry",
    description: "Return one published Japanese vocabulary entry.",
    inputSchema: z.object({ id: z.string().uuid() }),
  }, async ({ id }) => ({
    content: [{ type: "text", text: JSON.stringify(getVocabulary(id)) }],
  }));

  server.registerTool("vocabulary_create_draft", {
    title: "Create a draft vocabulary entry",
    description: "Validate and insert one unpublished Japanese vocabulary entry. Publishing always requires separate admin approval.",
    inputSchema: vocabularyInput,
  }, async (input) => {
    const result = createVocabularyDraft({ ...input, source: "mcp" });
    return { content: [{ type: "text", text: JSON.stringify({ id: result.item.id, created: result.created, status: result.item.status }) }] };
  });
});

export async function POST(request: Request) {
  if (!validBearer(request, process.env.NIHON_MCP_TOKEN)) return unauthorized();
  try { return await handler(request); } catch (err) { return errorResponse(err); }
}
