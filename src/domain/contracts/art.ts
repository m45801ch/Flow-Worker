import { z } from "zod";

export const artDocumentSchema = z.object({}).passthrough();
export type ArtDocument = z.infer<typeof artDocumentSchema>;
