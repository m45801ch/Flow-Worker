import { z } from "zod";

export const outlineDocumentSchema = z.object({}).passthrough();
export type OutlineDocument = z.infer<typeof outlineDocumentSchema>;
