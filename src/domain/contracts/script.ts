import { z } from "zod";

export const scriptDocumentSchema = z.object({}).passthrough();
export type ScriptDocument = z.infer<typeof scriptDocumentSchema>;
