import type { ProviderKind } from "./models";
import { normalizeProviderSettings, resolveStageConfig, type GenerationStage, type ResolvedStageConfig } from "./settings";

const providerKinds: ProviderKind[] = ["gemini", "openai", "groq", "openrouter"];
const isProvider = (value: unknown): value is ProviderKind => typeof value === "string" && providerKinds.includes(value as ProviderKind);
const isStage = (value: unknown): value is GenerationStage => ["outline", "characters", "art", "script", "storyboard"].includes(String(value));

type GenerationRequestOverrides = { stage?: unknown; provider?: unknown; apiKey?: unknown; model?: unknown; temperature?: unknown };

export function routeGenerationRequest(message: GenerationRequestOverrides, saved: unknown): ResolvedStageConfig {
  const persisted = saved && typeof saved === "object" ? saved as Record<string, any> : {};
  const settings = normalizeProviderSettings(persisted.flowProviderSettings ?? persisted);
  if (isStage(message.stage)) return resolveStageConfig(settings, message.stage);
  const provider = isProvider(message.provider) ? message.provider : isProvider(persisted.provider) ? persisted.provider : settings.defaultProvider;
  const apiKey = typeof message.apiKey === "string" ? message.apiKey : typeof persisted.apiKey === "string" ? persisted.apiKey : settings.apiKeys[provider];
  const model = typeof message.model === "string" && message.model.trim() ? message.model.trim() : typeof persisted.model === "string" && persisted.model.trim() ? persisted.model.trim() : settings.models[provider];
  const temperature = typeof message.temperature === "number" ? message.temperature : typeof persisted.temperature === "number" ? persisted.temperature : settings.temperatures[provider];
  if (!apiKey?.trim()) throw new Error(`API Key is required for ${provider}`);
  if (!model?.trim()) throw new Error(`Model is required for ${provider}`);
  return { provider, apiKey: apiKey.trim(), model: model.trim(), temperature: Math.min(1, Math.max(0, temperature)) };
}
