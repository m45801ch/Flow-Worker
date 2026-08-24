import { asArray, asRecord, blocker, duplicateValues, ids, report, text, type GateReport } from "./types";

export function runScriptGates(document: unknown): GateReport {
  const root = asRecord(document);
  const episodes = asArray(root.episodes);
  const blockers = [];
  if (!Array.isArray(root.episodes)) blockers.push(blocker("script.episodes", "劇本文件必須包含 episodes 陣列。", "episodes"));
  const sceneIds: string[] = [];
  let actionCount = 0;
  let dialogueCount = 0;
  let totalSeconds = 0;
  episodes.forEach((episode, episodeIndex) => {
    const scenes = asArray(asRecord(episode).scenes);
    if (!scenes.length) blockers.push(blocker("script.empty-episode", `第 ${episodeIndex + 1} 集沒有場次。`, `episodes[${episodeIndex}].scenes`));
    scenes.forEach((scene, sceneIndex) => {
      const sceneRecord = asRecord(scene);
      const sceneId = text(sceneRecord.id);
      if (!sceneId) blockers.push(blocker("script.missing-scene-id", `第 ${episodeIndex + 1} 集第 ${sceneIndex + 1} 場缺少 ID。`, `episodes[${episodeIndex}].scenes[${sceneIndex}].id`));
      sceneIds.push(sceneId);
      const flow = asArray(sceneRecord.flow);
      if (!flow.length) blockers.push(blocker("script.empty-scene", `場次 ${sceneId || `${episodeIndex + 1}-${sceneIndex + 1}`} 沒有 flow 節拍。`, `episodes[${episodeIndex}].scenes[${sceneIndex}].flow`));
      if (!flow.some((beat) => text(asRecord(beat).action))) blockers.push(blocker("script.action-beat", `場次 ${sceneId || `${episodeIndex + 1}-${sceneIndex + 1}`} 至少需要一個動作節拍。`, `episodes[${episodeIndex}].scenes[${sceneIndex}].flow`));
      flow.forEach((beat, beatIndex) => {
        const value = asRecord(beat);
        const duration = Number(value.durationSec);
        if (!Number.isFinite(duration) || duration <= 0) blockers.push(blocker("script.invalid-duration", `節拍 ${sceneId || "unknown"}-${beatIndex + 1} 的 durationSec 必須大於 0。`, `flow[${beatIndex}].durationSec`));
        else totalSeconds += duration;
        if (text(value.action)) actionCount += 1;
        if (text(value.line) || text(value.dialogue)) dialogueCount += 1;
        if (text(value.kind) === "dialogue" && (!text(value.speaker) || !text(value.line))) blockers.push(blocker("script.dialogue-fields", `對白節拍 ${sceneId || "unknown"}-${beatIndex + 1} 必須包含 speaker 與 line。`, `flow[${beatIndex}]`));
      });
    });
  });
  const duplicates = duplicateValues(sceneIds.filter(Boolean));
  if (duplicates.length) blockers.push(blocker("script.duplicate-scene-id", `劇本包含重複場次 ID：${duplicates.join(", ")}`, "episodes"));
  return report(blockers, [], { episodes: episodes.length, scenes: sceneIds.filter(Boolean).length, actionBeats: actionCount, dialogueBeats: dialogueCount, totalSeconds });
}
