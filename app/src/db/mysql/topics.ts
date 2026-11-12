import { createHash, randomUUID } from "node:crypto";
import { eq, exists, and, sql } from "drizzle-orm";
import { z } from "zod";
import type { openMySQL } from "./connector";
import { decks, topics } from "./schema";

type Db = ReturnType<typeof openMySQL>["db"];
const topicInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
}).strict();

export function mysqlTopics(db: Db) {
  const list = async (includePrivate = false) => db.select().from(topics)
    .where(includePrivate ? undefined : exists(db.select({ id: decks.id }).from(decks)
      .where(and(eq(decks.topicId, topics.id), eq(decks.visibility, "public")))))
    .orderBy(topics.createdAt, topics.id);
  const get = async (id: string) => (await db.select().from(topics)
    .where(eq(topics.id, id)).limit(1))[0] ?? null;
  const getOrCreate = async (raw: { name: string; description?: string }) => {
    const input = topicInput.parse(raw);
    const normalized = input.name.normalize("NFKC").toLowerCase();
    const readable = normalized.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") ||
      createHash("sha256").update(normalized).digest("hex");
    const slug = readable.length <= 191 ? readable :
      readable.slice(0, 126) + "-" + createHash("sha256").update(normalized).digest("hex");
    const id = randomUUID();
    await db.insert(topics).values({ id, slug, name: input.name,
      description: input.description ?? null, createdAt: new Date().toISOString() })
      .onDuplicateKeyUpdate({ set: { id: sql`${topics.id}` } });
    const topic = (await db.select().from(topics).where(eq(topics.slug, slug)).limit(1))[0]!;
    return { topic, created: topic.id === id };
  };
  return { list, get, getOrCreate };
}
