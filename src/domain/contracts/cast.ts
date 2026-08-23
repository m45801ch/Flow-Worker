import { z } from "zod";

export const castDocumentSchema = z.object({}).passthrough();
export type CastDocument = z.infer<typeof castDocumentSchema>;
