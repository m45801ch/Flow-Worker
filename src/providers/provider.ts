import type { ProviderConfig, TextGenerationInput, TextGenerationProvider, TextGenerationResult } from "./types";
import { parseStructuredJson } from "./json-response";

type ProviderKind = "gemini" | "openai" | "groq" | "openrouter";
const endpoints: Record<ProviderKind, string> = { gemini: "https://generativelanguage.googleapis.com/v1beta/models", openai: "https://api.openai.com/v1/chat/completions", groq: "https://api.groq.com/openai/v1/chat/completions", openrouter: "https://openrouter.ai/api/v1/chat/completions" };
const redact = (message: string) => message.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").replace(/key=\S+/gi, "key=[REDACTED]");

export class ProviderError extends Error { constructor(public code: string, message: string, public retryable = false) { super(redact(message)); } }

export async function retryProviderRequest<T>(operation: () => Promise<T>, attempts = 3, baseDelayMs = 250): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      if (attempt === attempts || !(error as { retryable?: boolean }).retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(baseDelayMs * 2 ** (attempt - 1), 2000)));
    }
  }
  throw new Error("Provider retry exhausted");
}

export function createProvider(kind: ProviderKind, config: ProviderConfig, fetchImpl: typeof fetch = fetch): TextGenerationProvider {
  return { async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    const schemaInstruction = input.schema ? `\nReturn ONLY valid JSON matching this exact contract. Do not rename fields:\n${input.schema}` : "";
    const body = kind === "gemini" ? { contents: [{ role: "user", parts: [{ text: `${input.systemPrompt}\n${input.userPrompt}${schemaInstruction}` }] }], generationConfig: { temperature: input.temperature, ...(input.schema ? { responseMimeType: "application/json" } : {}) } } : { model: config.model, temperature: input.temperature, ...(input.schema ? { response_format: { type: "json_object" } } : {}), messages: [{ role: "system", content: input.systemPrompt + schemaInstruction }, { role: "user", content: input.userPrompt }] };
    const url = kind === "gemini" ? `${endpoints[kind]}/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}` : endpoints[kind];
    const headers: Record<string, string> = { "Content-Type": "application/json" }; if (kind !== "gemini") headers.Authorization = `Bearer ${config.apiKey}`;
    let response: Response;
    try { response = await retryProviderRequest(async () => { const candidate = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: input.signal }); if (!candidate.ok) { const retryable = candidate.status === 429 || candidate.status >= 500; throw new ProviderError(candidate.status === 401 || candidate.status === 403 ? "AUTH" : "HTTP", `Provider request failed (${candidate.status})`, retryable); } return candidate; }); } catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError("NETWORK", String(error), true); }
    const payload = await response.json() as any;
    const text = kind === "gemini" ? payload.candidates?.[0]?.content?.parts?.[0]?.text : payload.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new ProviderError("EMPTY", "Provider returned no text");
    let json: unknown; if (input.schema) { try { json = parseStructuredJson(text); } catch { throw new ProviderError("SCHEMA", "Provider returned invalid structured JSON"); } }
    return { text, json, model: config.model, providerRequestId: payload.id };
  } };
}
