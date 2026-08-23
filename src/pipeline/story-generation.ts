import type { StorySettings } from "../domain/project";

export function buildStoryGenerationInput(theme: string, settings: StorySettings) {
  return {
    systemPrompt: "你是通用 AI 電影製作規劃師。請不要寫死任何故事、角色、朝代或道具。只回傳可解析的 JSON。",
    userPrompt: JSON.stringify({ task: "generate_outline", storyTheme: theme, settings }),
    schema: "{title,logline,summary,structure,characterRelationships,episodeSummaries,hook,cliffhanger}",
    language: settings.language,
  };
}
