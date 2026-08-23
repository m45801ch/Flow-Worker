import type { ContinuityReport, ShotState } from "./types";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function evaluateContinuity(previous: ShotState, current: ShotState): ContinuityReport {
  const blockers = [] as ContinuityReport["blockers"];
  const warnings = [] as ContinuityReport["warnings"];
  const changedFields: string[] = [];
  if (previous.sceneId !== current.sceneId) { changedFields.push("sceneId"); blockers.push({ code: "SCENE_CHANGED", severity: "blocker", message: "Scene changed without an explicit transition." }); }
  const before = previous.characters[0]; const after = current.characters[0];
  if (before && after) {
    for (const [field, label] of [["heightCm", "height"], ["costumeId", "costume"], ["position", "position"], ["heldProps", "props"]] as const) {
      if (!same(before[field], after[field])) changedFields.push(label);
    }
    if (before.pose !== after.pose) {
      changedFields.push("pose");
      const isJustified = current.transition?.steps.join(",") === "turn,walk_to_chair,arrive,turn,sit";
      if (!isJustified) blockers.push({ code: "ACTION_JUMP", severity: "blocker", message: `Action jumps from ${before.pose} to ${after.pose} without a transition.` });
    }
  }
  if (!same(previous.props, current.props)) changedFields.push("props");
  if (!same(previous.environment, current.environment)) changedFields.push("environment");
  if (!same(previous.lighting, current.lighting)) changedFields.push("lighting");
  const cameraOnly = changedFields.every((field) => ["shotSize", "lensMm", "distanceM", "angle", "movement"].includes(field));
  const score = blockers.length ? 40 : cameraOnly ? 100 : warnings.length ? 82 : 96;
  return { score, blockers, warnings, changedFields };
}
