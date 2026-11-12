import { z } from "zod";
import { vocabularyInput } from "./schema";

export const topicInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
}).strict();
export const lessonInput = topicInput.extend({topicId:z.string().uuid().optional()}).strict();
export const batchItems = z.array(vocabularyInput).min(1).max(100);
export const batchInput = z.object({items:batchItems}).strict();
export const publishSelectedInput = z.object({
  entryIds:z.array(z.string().uuid()).min(1).max(100),
}).strict();
export const emptyInput = z.object({}).strict();
export const lessonBatchInput = z.object({
  lessonId:z.string().uuid().optional(),
  topicName:topicInput.shape.name.optional(),
  lessonName:topicInput.shape.name.optional(),
  items:batchItems,
}).strict().refine(input=>
  input.lessonId!==undefined
    ?input.topicName===undefined&&input.lessonName===undefined
    :input.topicName!==undefined&&input.lessonName!==undefined,
  {message:"Provide lessonId or both topicName and lessonName"},
);
