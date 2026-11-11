import { z } from "zod";

export const generationRequestSchema = z.object({
  topic: z.string().trim().min(3).max(100),
  jlptLevel: z.enum(["N5","N4","N3","N2","N1"]),
  count: z.coerce.number().int().min(1).max(20),
  notes: z.string().trim().max(300).default(""),
}).strict();

export const candidateSchema = z.object({
  word: z.string().trim().min(1).max(120),
  reading: z.string().trim().min(1).max(120),
  romanization: z.string().trim().max(120),
  partOfSpeech: z.string().trim().max(80),
  jlptLevel: z.enum(["N5","N4","N3","N2","N1","unknown"]),
  meaningVi: z.string().trim().min(1).max(500),
  meaningEn: z.string().trim().max(500),
  exampleJa: z.string().trim().max(500),
  exampleVi: z.string().trim().max(500),
}).strict();

export const candidateListSchema = z.object({
  items: z.array(candidateSchema).min(1).max(20),
}).strict();

export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GeneratedCandidate = z.infer<typeof candidateSchema>;

export const responseJsonSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type:"string" },
          reading: { type:"string" },
          romanization: { type:"string" },
          partOfSpeech: { type:"string" },
          jlptLevel: { type:"string", enum:["N5","N4","N3","N2","N1","unknown"] },
          meaningVi: { type:"string" },
          meaningEn: { type:"string" },
          exampleJa: { type:"string" },
          exampleVi: { type:"string" },
        },
        required: ["word","reading","romanization","partOfSpeech","jlptLevel",
          "meaningVi","meaningEn","exampleJa","exampleVi"],
        additionalProperties:false,
      },
    },
  },
  required:["items"],
  additionalProperties:false,
} as const;
