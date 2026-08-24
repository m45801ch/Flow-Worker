import { asArray, asRecord, blocker, duplicateValues, ids, report, text, type GateReport } from "./types";

const requiredSheetTerms = ["16:9", "left", "34%", "front", "right-top", "side", "back", "right-bottom", "4", "same face", "same hair", "proportions"];
const visualPromptTerms = /\b(face|eyes|hair|costume|clothing|robe|dress|portrait|close-up|full-body|expression|lighting|lens|camera|texture|features)\b/i;
const isCinematicImagePrompt = (prompt: string): boolean => {
  const words = prompt.split(/\s+/).filter(Boolean);
  return words.length >= 12 && /\bcinematic\b/i.test(prompt) && visualPromptTerms.test(prompt) && !/[\u3400-\u9fff]/.test(prompt);
};

export function runCastGates(document: unknown): GateReport {
  const root = asRecord(document);
  const characters = asArray(root.characters);
  const blockers = [];
  if (!Array.isArray(root.characters)) blockers.push(blocker("cast.characters", "角色文件必須包含 characters 陣列。", "characters"));
  const duplicates = duplicateValues(ids(characters));
  if (duplicates.length) blockers.push(blocker("cast.duplicate-id", `角色包含重複穩定 ID：${duplicates.join(", ")}`, "characters"));
  characters.forEach((item, index) => {
    const character = asRecord(item);
    const image = asRecord(character.image);
    if (!text(character.id)) blockers.push(blocker("cast.missing-id", `角色 ${index + 1} 缺少穩定 ID。`, `characters[${index}].id`));
    if (!text(character.name)) blockers.push(blocker("cast.missing-name", `角色 ${index + 1} 缺少名稱。`, `characters[${index}].name`));
    const imagePrompt = text(image.prompt);
    if (!imagePrompt) blockers.push(blocker("cast.image-prompt", `角色 ${index + 1} 缺少外觀 Prompt。`, `characters[${index}].image.prompt`));
    else if (!isCinematicImagePrompt(imagePrompt)) blockers.push(blocker("cast.image-prompt-quality", `角色 ${text(character.name) || index + 1} 的 image.prompt 必須是完整英文 cinematic image prompt（至少 12 個英文詞，包含可視覺化外觀與攝影描述），不可只放中文角色摘要。`, `characters[${index}].image.prompt`));
    const sheetPrompt = text(image.sheetPrompt).toLowerCase();
    const missing = requiredSheetTerms.filter((term) => !sheetPrompt.includes(term));
    if (missing.length) blockers.push(blocker("cast.sheet-layout", `角色 ${text(character.name) || index + 1} 的三視圖 Prompt 缺少：${missing.join(", " )}`, `characters[${index}].image.sheetPrompt`));
    if (!text(image.negativePrompt)) blockers.push(blocker("cast.negative-prompt", `角色 ${text(character.name) || index + 1} 缺少 negative prompt。`, `characters[${index}].image.negativePrompt`));
  });
  return report(blockers, [], { characters: characters.length, validImagePrompts: characters.filter((item) => isCinematicImagePrompt(text(asRecord(asRecord(item).image).prompt))).length, validSheetPrompts: characters.filter((item) => { const prompt = text(asRecord(asRecord(item).image).sheetPrompt).toLowerCase(); return requiredSheetTerms.every((term) => prompt.includes(term)); }).length });
}
