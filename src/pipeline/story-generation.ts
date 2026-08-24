import type { StorySettings } from "../domain/project";

export function normalizeTargetDurationSec(settings: Pick<StorySettings, "episodeDurationSec">): number {
  const duration = Number(settings.episodeDurationSec);
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 60;
}

export function buildDurationGuidance(settings: StorySettings): string {
  const targetDurationSec = normalizeTargetDurationSec(settings);
  return `影片目標時長為 ${targetDurationSec} 秒。請先分析這個時長，再規劃完整劇本：所有場次與 action／dialogue beat 的 durationSec 加總應盡量貼近 ${targetDurationSec} 秒；每個節拍只能使用 Flow 可拆分的 4、6 或 8 秒，單一節拍絕不可超過 8 秒；若動作或台詞較長，請拆成多個有實際內容的節拍；不得輸出 action 為空白、只有 durationSec 沒有動作或台詞的節拍，也不要任意重複內容；episode.targetSeconds 必須設為 ${targetDurationSec}。`;
}

export function buildStoryGenerationInput(theme: string, settings: StorySettings) {
  const targetDurationSec = normalizeTargetDurationSec(settings);
  return {
    systemPrompt: "你是通用 AI 電影製作規劃師。請不要寫死任何故事、角色、朝代或道具。只回傳可解析的 JSON。",
    userPrompt: JSON.stringify({ task: "generate_outline", storyTheme: theme, targetDurationSec, durationGuidance: buildDurationGuidance(settings), settings }),
    schema: "{title,logline,summary,structure,characterRelationships,episodeSummaries,hook,cliffhanger}",
    language: settings.language,
  };
}
