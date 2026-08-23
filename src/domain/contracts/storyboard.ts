import { z } from "zod";

export const storyboardDocumentSchema = z.object({
  source: z.string(),
  episodes: z.array(z.object({
    id: z.string().min(1),
    segments: z.array(z.object({
      id: z.string().min(1),
      sceneId: z.string(),
      h3Prompt: z.string(),
      veoPrompt: z.string(),
      cuts: z.array(z.object({ id: z.string().min(1), beats: z.array(z.string()), durationSec: z.union([z.literal(4), z.literal(6), z.literal(8)]) }).passthrough())
    }).passthrough())
  }).passthrough())
}).passthrough();
export type StoryboardDocument = z.infer<typeof storyboardDocumentSchema>;