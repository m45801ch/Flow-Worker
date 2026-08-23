import { z } from "zod";

export const storyboardDocumentSchema = z.object({}).passthrough();
export type StoryboardDocument = z.infer<typeof storyboardDocumentSchema>;
