import { z } from "zod";

export const vocabularyInput = z.object({
  language: z.literal("ja").default("ja"),
  word: z.string().trim().min(1).max(120),
  reading: z.string().trim().min(1).max(120),
  romanization: z.string().trim().max(120).optional(),
  partOfSpeech: z.string().trim().max(80).optional(),
  jlptLevel: z.enum(["N5", "N4", "N3", "N2", "N1"]).nullable().optional(),
  meaningVi: z.string().trim().min(1).max(500),
  meaningEn: z.string().trim().max(500).optional(),
  source: z.enum(["manual", "import", "ai", "mcp"]).default("manual"),
  sourceRef: z.string().trim().max(200).optional(),
}).strict();

export type VocabularyInput = z.infer<typeof vocabularyInput>;

export const listQuery = z.object({
  search: z.string().max(80).default(""),
  jlpt: z.enum(["N5","N4","N3","N2","N1"]).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  order: z.enum(["oldest","newest"]).default("oldest"),
}).strict();
