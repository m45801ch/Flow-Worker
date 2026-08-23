export type TextGenerationInput = { systemPrompt: string; userPrompt: string; schema?: string; language: string; model: string; temperature: number; signal?: AbortSignal };
export type TextGenerationResult = { text: string; json?: unknown; model: string; providerRequestId?: string };
export type ProviderConfig = { apiKey: string; model: string; temperature: number };
export interface TextGenerationProvider { generateText(input: TextGenerationInput): Promise<TextGenerationResult>; }
