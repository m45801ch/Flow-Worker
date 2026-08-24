import type { ProviderKind } from "./models";

export type GenerationStage = "outline" | "characters" | "art" | "script" | "storyboard";
export type ProviderMap<T> = Record<ProviderKind, T>;
export type StageRoute = { provider: ProviderKind; model: string; temperature: number };
export type StoredProviderSettings = {
  apiKeys: ProviderMap<string>;
  models: ProviderMap<string>;
  temperatures: ProviderMap<number>;
  stageRoutes: Record<GenerationStage, StageRoute>;
  defaultProvider: ProviderKind;
};
export type ResolvedStageConfig = StageRoute & { apiKey: string };

const providers: ProviderKind[] = ["gemini", "openai", "groq", "openrouter"];
const stages: GenerationStage[] = ["outline", "characters", "art", "script", "storyboard"];
const defaults: ProviderMap<string> = { gemini: "gemini-3.7-flash", openai: "gpt-4.1-mini", groq: "llama-3.3-70b-versatile", openrouter: "openai/gpt-4.1-mini" };
const stageTemperature: Record<GenerationStage, number> = { outline: 0.7, characters: 0.5, art: 0.4, script: 0.5, storyboard: 0.3 };
const isProvider = (value: unknown): value is ProviderKind => typeof value === "string" && providers.includes(value as ProviderKind);
const finiteTemperature = (value: unknown, fallback: number) => { const number = Number(value); return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback; };

export function normalizeProviderSettings(raw: unknown): StoredProviderSettings {
  const source = raw && typeof raw === "object" ? raw as Record<string, any> : {};
  const legacyProvider: ProviderKind = isProvider(source.provider) ? source.provider : "gemini";
  const defaultProvider: ProviderKind = isProvider(source.defaultProvider) ? source.defaultProvider : legacyProvider;
  const sourceKeys = source.apiKeys && typeof source.apiKeys === "object" ? source.apiKeys : {};
  const sourceModels = source.models && typeof source.models === "object" ? source.models : {};
  const sourceTemperatures = source.temperatures && typeof source.temperatures === "object" ? source.temperatures : {};
  const apiKeys = Object.fromEntries(providers.map((provider) => [provider, typeof sourceKeys[provider] === "string" ? sourceKeys[provider] : provider === legacyProvider && typeof source.apiKey === "string" ? source.apiKey : ""])) as ProviderMap<string>;
  const models = Object.fromEntries(providers.map((provider) => [provider, typeof sourceModels[provider] === "string" && sourceModels[provider].trim() ? sourceModels[provider].trim() : provider === legacyProvider && typeof source.model === "string" && source.model.trim() ? source.model.trim() : defaults[provider]])) as ProviderMap<string>;
  const temperatures = Object.fromEntries(providers.map((provider) => [provider, finiteTemperature(sourceTemperatures[provider], provider === legacyProvider ? finiteTemperature(source.temperature, 0.7) : 0.5)])) as ProviderMap<number>;
  const sourceRoutes = source.stageRoutes && typeof source.stageRoutes === "object" ? source.stageRoutes as Record<string, Record<string, unknown>> : {};
  const stageRoutes = Object.fromEntries(stages.map((stage) => {
    const route: Record<string, unknown> = sourceRoutes[stage] && typeof sourceRoutes[stage] === "object" ? sourceRoutes[stage] : {};
    const provider = isProvider(route.provider) ? route.provider : defaultProvider;
    return [stage, { provider, model: typeof route.model === "string" && route.model.trim() ? route.model.trim() : models[provider], temperature: finiteTemperature(route.temperature, stageTemperature[stage]) }];
  })) as Record<GenerationStage, StageRoute>;
  return { apiKeys, models, temperatures, stageRoutes, defaultProvider };
}

export function resolveStageConfig(settings: StoredProviderSettings, stage: GenerationStage): ResolvedStageConfig {
  const route = settings.stageRoutes[stage];
  if (!route || !isProvider(route.provider)) throw new Error(`No Provider route configured for ${stage}`);
  const apiKey = settings.apiKeys[route.provider]?.trim();
  if (!apiKey) throw new Error(`API Key is required for ${route.provider} before running ${stage}`);
  if (!route.model.trim()) throw new Error(`Model is required for ${route.provider} before running ${stage}`);
  return { provider: route.provider, apiKey, model: route.model.trim(), temperature: finiteTemperature(route.temperature, stageTemperature[stage]) };
}
