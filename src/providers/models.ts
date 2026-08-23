export type ProviderKind = "gemini" | "openai" | "groq" | "openrouter";
export type ModelOption = { id: string; label: string; provider: ProviderKind };
const endpoints: Record<ProviderKind, string> = { gemini: "https://generativelanguage.googleapis.com/v1beta/models", openai: "https://api.openai.com/v1/models", groq: "https://api.groq.com/openai/v1/models", openrouter: "https://openrouter.ai/api/v1/models" };

export function normalizeModels(payload: any, provider: ProviderKind): ModelOption[] {
  if (provider === "gemini") return (payload.models ?? []).filter((model: any) => model.supportedGenerationMethods?.includes("generateContent")).map((model: any) => ({ id: String(model.name).replace(/^models\//, ""), label: model.displayName || String(model.name).replace(/^models\//, ""), provider }));
  return (payload.data ?? []).filter((model: any) => typeof model.id === "string").map((model: any) => ({ id: model.id, label: model.name || model.id, provider }));
}

export async function listModels(provider: ProviderKind, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ModelOption[]> {
  const url = provider === "gemini" ? `${endpoints[provider]}?key=${encodeURIComponent(apiKey)}` : endpoints[provider];
  const headers: Record<string, string> = { "Content-Type": "application/json" }; if (provider !== "gemini") headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchImpl(url, { method: "GET", headers });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "API Key 無效或沒有模型列表權限" : `取得模型列表失敗（${response.status}）`);
  return normalizeModels(await response.json(), provider);
}
