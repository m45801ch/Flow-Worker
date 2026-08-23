import { z } from "zod";

const flowBeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("action"), action: z.string(), durationSec: z.number().positive() }),
  z.object({ kind: z.literal("dialogue"), speaker: z.string(), line: z.string(), delivery: z.string(), durationSec: z.number().positive() })
]);

export const scriptDocumentSchema = z.object({
  source: z.string(),
  episodes: z.array(z.object({
    id: z.string().min(1),
    title: z.string(),
    scenes: z.array(z.object({ id: z.string().min(1), flow: z.array(flowBeatSchema) }).passthrough())
  }).passthrough())
}).passthrough();
export type ScriptDocument = z.infer<typeof scriptDocumentSchema>;