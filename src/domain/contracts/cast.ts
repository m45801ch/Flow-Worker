import { z } from "zod";

const textOrRecordSchema = z.union([z.string(), z.record(z.string(), z.unknown())]);

export const castDocumentSchema = z.object({
  characters: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    persona: textOrRecordSchema,
    relationships: z.array(z.unknown()),
    evidence: z.array(z.unknown()),
    image: z.object({ prompt: z.string(), sheetPrompt: z.string(), negativePrompt: z.string() }),
    voice: z.object({ prompt: z.string() })
  }).passthrough())
}).passthrough();
export type CastDocument = z.infer<typeof castDocumentSchema>;