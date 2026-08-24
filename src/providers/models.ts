export type ProviderKind = "gemini" | "openai" | "groq" | "openrouter";
export type ModelOption = { id: string; label: string; provider: ProviderKind };

const endpoints: Record<ProviderKind, string> = { gemini: "https://generativelanguage.googleapis.com/v1beta/models", openai: "https://api.openai.com/v1/models", groq: "https://api.groq.com/openai/v1/models", openrouter: "https://openrouter.ai/api/v1/models" };
const requestHeaders = { "Content-Type": "application/json", "Cache-Control": "no-cache, no-store, max-age=0" };
const MAX_MODEL_PAGES = 20;

const supportedGenerate = (model: any): boolean => {
  const actions = Array.isArray(model.supportedActions) ? model.supportedActions : Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
  return actions.includes("generateContent");
};

const dedupeModels = (models: ModelOption[]): ModelOption[] => Array.from(new Map(models.filter((model) => model.id).map((model) => [model.id, model])).values());

export function normalizeModels(payload: any, provider: ProviderKind): ModelOption[] {
  if (provider === "gemini") {
    const rows = Array.isArray(payload?.models) ? payload.models : [];
    return dedupeModels(rows.filter(supportedGenerate).map((model: any) => {
      const name = String(model.baseModelId || model.name || "").replace(/^models\//, "");
      return { id: name, label: String(model.displayName || name), provider };
    }));
  }

  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return dedupeModels(rows.filter((model: any) => typeof model?.id === "string" && model.id.trim()).map((model: any) => ({
    id: model.id,
    label: typeof model.name === "string" && model.name.trim() ? model.name : model.id,
    provider
  })));
}

const providerError = (provider: ProviderKind, status: number): string => status === 401 || status === 403 ? "API Key 無效或沒有模型列表權限" : `取得 ${provider} 模型列表失敗（${status}）`;

const nextPageUrl = (payload: any, currentUrl: string, provider: ProviderKind): string => {
  const declaredNext = payload?.links?.next ?? payload?.next ?? payload?.next_url ?? payload?.pagination?.next;
  if (typeof declaredNext === "string" && declaredNext) return new URL(declaredNext, currentUrl).toString();

  if (provider !== "openrouter") return "";
  const totalCount = Number(payload?.total_count);
  const currentDataCount = Array.isArray(payload?.data) ? payload.data.length : 0;
  if (!Number.isFinite(totalCount) || currentDataCount === 0) return "";
  const current = new URL(currentUrl);
  const offset = Number(current.searchParams.get("offset") ?? "0");
  if (totalCount <= offset + currentDataCount) return "";
  current.searchParams.set("offset", String(offset + currentDataCount));
  current.searchParams.set("limit", "1000");
  return current.toString();
};

export async function listModels(provider: ProviderKind, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ModelOption[]> {
  if (!apiKey.trim()) throw new Error("API Key 不可為空");

  if (provider === "gemini") {
    const models: ModelOption[] = [];
    let pageToken = "";
    let pageCount = 0;
    do {
      const url = new URL(endpoints.gemini);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetchImpl(url.toString(), { method: "GET", headers: requestHeaders, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "API Key 無效或沒有模型列表權限" : `取得 Gemini 模型列表失敗（${response.status}）`);
      const payload = await response.json();
      models.push(...normalizeModels(payload, "gemini"));
      pageToken = typeof payload?.nextPageToken === "string" ? payload.nextPageToken : "";
      pageCount += 1;
    } while (pageToken && pageCount < MAX_MODEL_PAGES);
    return dedupeModels(models);
  }

  const models: ModelOption[] = [];
  let pageCount = 0;
  let url = new URL(endpoints[provider]);
  if (provider === "openrouter") {
    url.searchParams.set("offset", "0");
    url.searchParams.set("limit", "1000");
  }
  const visited = new Set<string>();
  while (pageCount < MAX_MODEL_PAGES && !visited.has(url.toString())) {
    const currentUrl = url.toString();
    visited.add(currentUrl);
    const response = await fetchImpl(currentUrl, { method: "GET", headers: { ...requestHeaders, Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
    if (!response.ok) throw new Error(providerError(provider, response.status));
    const payload = await response.json();
    models.push(...normalizeModels(payload, provider));
    const next = nextPageUrl(payload, currentUrl, provider);
    url = next ? new URL(next) : new URL("about:blank");
    pageCount += 1;
    if (!next) break;
  }
  return dedupeModels(models);
}
