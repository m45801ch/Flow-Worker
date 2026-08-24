import type { ScriptDocument } from "../domain/contracts/script";
import type { StoryboardDocument } from "../domain/contracts/storyboard";

type ScriptBeat = {
  id?: unknown;
  kind?: unknown;
  action?: unknown;
  dialogue?: unknown;
  speaker?: unknown;
  line?: unknown;
  durationSec?: unknown;
};

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const nativeDuration = (value: unknown): 4 | 6 | 8 => {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 4) return 4;
  if (duration <= 6) return 6;
  return 8;
};

function beatDescription(beat: ScriptBeat): string {
  const action = text(beat.action);
  const dialogue = text(beat.line) ? `${text(beat.speaker)}：${text(beat.line)}` : text(beat.dialogue);
  return [action && `動作：${action}`, dialogue && `台詞：${dialogue}`].filter(Boolean).join("；");
}

export function buildStoryboardFromScript(input: unknown): StoryboardDocument {
  const root = input && typeof input === "object" ? input as { episodes?: unknown } : {};
  const episodes = Array.isArray(root.episodes) ? root.episodes as Array<Record<string, unknown>> : [];
  return {
    source: "script",
    episodes: episodes.map((episode, episodeIndex) => {
      const episodeId = text(episode.id) || `E${String(episodeIndex + 1).padStart(2, "0")}`;
      const scenes = Array.isArray(episode.scenes) ? episode.scenes as Array<Record<string, unknown>> : [];
      return {
        id: episodeId,
        segments: scenes.map((scene, sceneIndex) => {
          const sceneId = text(scene.id) || `scene-${episodeIndex + 1}-${sceneIndex + 1}`;
          const segmentId = `${episodeId}-${sceneId}-SEG`;
          const rawFlow = Array.isArray(scene.flow) ? scene.flow as ScriptBeat[] : [];
          const beats = rawFlow
            .map((beat, beatIndex) => ({ beat, beatId: text(beat.id) || `${sceneId}-B${beatIndex + 1}`, description: beatDescription(beat) }))
            .filter((item) => item.description);
          const prompt = beats.map((item) => item.description).join("。 ") || `依照場景 ${sceneId} 的劇本內容建立連續畫面`;
          return {
            id: segmentId,
            sceneId,
            h3Prompt: prompt,
            veoPrompt: prompt,
            cuts: beats.map((item, beatIndex) => ({
              id: `${segmentId}-C${beatIndex + 1}`,
              beats: [item.beatId],
              durationSec: nativeDuration(item.beat.durationSec),
              action: item.description,
            })),
          };
        }),
      };
    }),
  };
}

export type { ScriptDocument };
