import { z } from "zod";

export const createDeckInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
}).strict();

export const deckIdSchema = z.string().uuid();
export const entryIdSchema = z.string().uuid();
