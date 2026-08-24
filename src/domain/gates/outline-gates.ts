import { asArray, asRecord, blocker, duplicateValues, ids, report, text, type GateReport } from "./types";

export function runOutlineGates(document: unknown): GateReport {
  const root = asRecord(document);
  const blockers = [];
  const arrays = ["characters", "scenes", "props", "beats", "episodes"] as const;
  const collections = Object.fromEntries(arrays.map((key) => [key, asArray(root[key])]));

  if (!text(asRecord(root.adaptation).source) && Object.keys(asRecord(root.adaptation)).length === 0) {
    blockers.push(blocker("outline.adaptation", "大綱必須提供 adaptation 來源或設定。", "adaptation"));
  }
  for (const key of arrays) {
    if (!Array.isArray(root[key])) blockers.push(blocker("outline.collection", `${key} 必須是陣列。`, key));
    const duplicates = duplicateValues(ids(collections[key]));
    if (duplicates.length) blockers.push(blocker("outline.duplicate-id", `${key} 包含重複穩定 ID：${duplicates.join(", ")}`, key));
    collections[key].forEach((item, index) => {
      if (!text(asRecord(item).id)) blockers.push(blocker("outline.missing-id", `${key}[${index}] 缺少穩定 ID。`, `${key}[${index}].id`));
    });
  }
  const beatIds = new Set(ids(collections.beats));
  collections.episodes.forEach((episode, episodeIndex) => {
    const scenes = asArray(asRecord(episode).scenes);
    for (const scene of scenes) {
      for (const beat of asArray(asRecord(scene).beats)) {
        const id = text(asRecord(beat).id);
        if (id && !beatIds.has(id)) blockers.push(blocker("outline.reference", `場景引用不存在的 beat：${id}`, `episodes[${episodeIndex}]`));
      }
    }
  });
  return report(blockers, [], {
    characters: collections.characters.length,
    scenes: collections.scenes.length,
    props: collections.props.length,
    beats: collections.beats.length,
    episodes: collections.episodes.length
  });
}
