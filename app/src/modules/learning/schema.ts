import { z } from "zod";

export const enrollDeckSchema = z.object({
  deckId: z.string().uuid(),
}).strict();

export const reviewInputSchema = z.object({
  cardId: z.string().uuid(),
  result: z.enum(["correct", "wrong"]),
  requestId: z.string().uuid(),
}).strict();

export const dueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();

export type ReviewInput = z.infer<typeof reviewInputSchema>;
