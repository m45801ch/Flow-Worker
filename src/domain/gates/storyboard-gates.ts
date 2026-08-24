import { asArray, asRecord, blocker, duplicateValues, report, text, type GateReport } from "./types";

const allowedDurations = new Set([4, 6, 8]);

export function runStoryboardGates(document: unknown, script?: unknown): GateReport {
  const root = asRecord(document);
  const episodes = asArray(root.episodes);
  const blockers = [];
  const claimedBeats: string[] = [];
  let cuts = 0;
  if (!Array.isArray(root.episodes)) blockers.push(blocker("storyboard.episodes", "分鏡文件必須包含 episodes 陣列。", "episodes"));
  episodes.forEach((episode, episodeIndex) => {
    const segments = asArray(asRecord(episode).segments);
    if (!segments.length) blockers.push(blocker("storyboard.empty-episode", `第 ${episodeIndex + 1} 集沒有 segment。`, `episodes[${episodeIndex}].segments`));
    segments.forEach((segment, segmentIndex) => {
      const segmentRecord = asRecord(segment);
      const segmentId = text(segmentRecord.id);
      if (!segmentId) blockers.push(blocker("storyboard.missing-segment-id", `第 ${episodeIndex + 1} 集第 ${segmentIndex + 1} 段缺少 ID。`, `segments[${segmentIndex}].id`));
      if (!text(segmentRecord.h3Prompt) || !text(segmentRecord.veoPrompt)) blockers.push(blocker("storyboard.prompt", `段落 ${segmentId || `${episodeIndex + 1}-${segmentIndex + 1}`} 必須同時提供 h3Prompt 與 veoPrompt。`, `segments[${segmentIndex}]`));
      const segmentCuts = asArray(segmentRecord.cuts);
      if (!segmentCuts.length) blockers.push(blocker("storyboard.empty-segment", `段落 ${segmentId || "unknown"} 沒有 cut。`, `segments[${segmentIndex}].cuts`));
      segmentCuts.forEach((cut, cutIndex) => {
        cuts += 1;
        const cutRecord = asRecord(cut);
        const duration = Number(cutRecord.durationSec ?? cutRecord.seconds);
        if (duration > 8) blockers.push(blocker("storyboard.flow-max-8s", `Cut ${segmentId || "unknown"}-${cutIndex + 1} 超過 Flow 8 秒上限。`, `cuts[${cutIndex}].durationSec`));
        else if (!allowedDurations.has(duration)) blockers.push(blocker("storyboard.flow-duration-enum", `Cut ${segmentId || "unknown"}-${cutIndex + 1} 的秒數必須是 4、6 或 8。`, `cuts[${cutIndex}].durationSec`));
        const beats = asArray(cutRecord.beats).map(text).filter(Boolean);
        claimedBeats.push(...beats);
        if (!beats.length) blockers.push(blocker("storyboard.beat-claim", `Cut ${segmentId || "unknown"}-${cutIndex + 1} 必須認領劇本節拍。`, `cuts[${cutIndex}].beats`));
        if (!text(cutRecord.id)) blockers.push(blocker("storyboard.missing-cut-id", `段落 ${segmentId || "unknown"} 的 cut 缺少 ID。`, `cuts[${cutIndex}].id`));
      });
    });
  });
  const duplicates = duplicateValues(claimedBeats);
  if (duplicates.length) blockers.push(blocker("storyboard.duplicate-beat-claim", `節拍被多個 cut 認領：${duplicates.join(", ")}`, "episodes"));
  if (script) {
    const expectedBeats = new Set<string>();
    for (const episode of asArray(asRecord(script).episodes)) for (const scene of asArray(asRecord(episode).scenes)) for (const beat of asArray(asRecord(scene).flow)) if (text(asRecord(beat).id)) expectedBeats.add(text(asRecord(beat).id));
    const missing = [...expectedBeats].filter((id) => !claimedBeats.includes(id));
    if (missing.length) blockers.push(blocker("storyboard.unclaimed-beat", `仍有劇本節拍未被認領：${missing.join(", ")}`, "episodes"));
  }
  return report(blockers, [], { episodes: episodes.length, segments: episodes.reduce<number>((sum, episode) => sum + asArray(asRecord(episode).segments).length, 0), cuts, claimedBeats: claimedBeats.length });
}
