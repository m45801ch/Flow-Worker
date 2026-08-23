import { z } from "zod";

export const artDocumentSchema = z.object({
  scenes: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    anchors: z.array(z.unknown()),
    lightingStates: z.array(z.unknown()),
    variants: z.array(z.unknown()),
    imagePrompt: z.string()
  }).passthrough()),
  props: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    scale: z.string(),
    states: z.array(z.unknown()),
    imagePrompt: z.string()
  }).passthrough()),
  costumes: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough())
}).passthrough();
export type ArtDocument = z.infer<typeof artDocumentSchema>;