import { z } from "zod";

const outlineReferenceSchema = z.object({ id: z.string().min(1) }).passthrough();

export const outlineDocumentSchema = z.object({
  adaptation: z.record(z.string(), z.unknown()),
  characters: z.array(outlineReferenceSchema),
  scenes: z.array(outlineReferenceSchema),
  props: z.array(outlineReferenceSchema),
  beats: z.array(outlineReferenceSchema),
  episodes: z.array(outlineReferenceSchema),
  params: z.record(z.string(), z.unknown())
}).passthrough();
export type OutlineDocument = z.infer<typeof outlineDocumentSchema>;