import type { BeatClaim } from "../contracts/storyboard-continuity";

export type BeatCoverageBlocker = { code: "beat.duplicate" | "beat.missing" | "cut.cross-scene" | "beat.order"; message: string };
export type BeatCoverageResult = { ok: boolean; blockers: BeatCoverageBlocker[] };

export function validateBeatCoverage(scriptBeats: BeatClaim[], cutClaims: string[][]): BeatCoverageResult {
  const blockers: BeatCoverageBlocker[] = [];
  const expectedIds = scriptBeats.slice().sort((a, b) => a.order - b.order).map((beat) => beat.beatId);
  const allClaimed = cutClaims.flat();
  const counts = new Map<string, number>();
  for (const beatId of allClaimed) counts.set(beatId, (counts.get(beatId) ?? 0) + 1);
  for (const [beatId, count] of counts) if (count > 1) blockers.push({ code: "beat.duplicate", message: `Beat ${beatId} is claimed more than once` });
  for (const beatId of expectedIds) if ((counts.get(beatId) ?? 0) === 0) blockers.push({ code: "beat.missing", message: `Beat ${beatId} is not claimed` });
  const sceneIds = new Map(scriptBeats.map((beat) => [beat.beatId, beat.sceneId]));
  for (const claims of cutClaims) {
    const scenes = new Set(claims.map((beatId) => sceneIds.get(beatId)).filter(Boolean));
    if (scenes.size > 1) blockers.push({ code: "cut.cross-scene", message: "A Cut cannot claim beats from multiple scenes" });
  }
  const claimedOrder = allClaimed.map((beatId) => expectedIds.indexOf(beatId));
  if (claimedOrder.some((order, index) => order < 0 || (index > 0 && order !== claimedOrder[index - 1] + 1))) blockers.push({ code: "beat.order", message: "Beat claims must remain contiguous and in script order" });
  return { ok: blockers.length === 0, blockers };
}
