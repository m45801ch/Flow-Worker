import { asArray, asRecord, blocker, duplicateValues, ids, report, text, type GateReport } from "./types";

const scenePeoplePattern = /(?:with|including|contains?|featuring|crowd|人群|有人|包含人物|人物入鏡|角色入鏡|男[人子]|女[人子])/i;
const propHandPattern = /(?:hand|hands|holding|握住|手持|手部|手入鏡)/i;

export function runArtGates(document: unknown): GateReport {
  const root = asRecord(document);
  const scenes = asArray(root.scenes);
  const props = asArray(root.props);
  const costumes = asArray(root.costumes);
  const blockers = [];
  const all = [...scenes, ...props, ...costumes];
  if (!Array.isArray(root.scenes)) blockers.push(blocker("art.scenes", "美術文件必須包含 scenes 陣列。", "scenes"));
  if (!Array.isArray(root.props)) blockers.push(blocker("art.props", "美術文件必須包含 props 陣列。", "props"));
  const duplicates = duplicateValues(ids(all));
  if (duplicates.length) blockers.push(blocker("art.duplicate-id", `美術資產包含重複穩定 ID：${duplicates.join(", ")}`, "assets"));
  scenes.forEach((item, index) => {
    const scene = asRecord(item);
    const prompt = text(scene.imagePrompt || scene.prompt);
    if (!text(scene.id)) blockers.push(blocker("art.missing-id", `場景 ${index + 1} 缺少穩定 ID。`, `scenes[${index}].id`));
    if (!prompt) blockers.push(blocker("art.scene-prompt", `場景 ${index + 1} 缺少圖片 Prompt。`, `scenes[${index}].imagePrompt`));
    if (scenePeoplePattern.test(prompt)) blockers.push(blocker("art.scene-no-people", `場景 ${text(scene.name) || index + 1} 的場景圖 Prompt 不得包含人物。`, `scenes[${index}].imagePrompt`));
  });
  props.forEach((item, index) => {
    const prop = asRecord(item);
    const prompt = text(prop.imagePrompt || prop.prompt);
    if (!text(prop.id)) blockers.push(blocker("art.missing-id", `道具 ${index + 1} 缺少穩定 ID。`, `props[${index}].id`));
    if (!/white\s*background|純白背景|白色背景/i.test(prompt)) blockers.push(blocker("art.prop-white-background", `道具 ${text(prop.name) || index + 1} 必須指定白底。`, `props[${index}].imagePrompt`));
    if (propHandPattern.test(prompt) && !/no\s+hand|without\s+hand|無手|沒有手/i.test(prompt)) blockers.push(blocker("art.prop-no-hands", `道具 ${text(prop.name) || index + 1} 不得包含手部。`, `props[${index}].imagePrompt`));
    if (!text(prop.scale)) blockers.push(blocker("art.prop-scale", `道具 ${text(prop.name) || index + 1} 缺少尺度描述。`, `props[${index}].scale`));
  });
  return report(blockers, [], { scenes: scenes.length, props: props.length, costumes: costumes.length });
}
