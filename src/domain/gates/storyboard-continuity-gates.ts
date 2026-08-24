import type { ShotState } from "../contracts/storyboard-continuity";
import { detectActionTransition } from "../storyboard/shot-state";

export type ContinuityBlockerCode = "state.required" | "character.identity" | "pose.transition" | "spatial.anchor" | "scale.lock" | "camera.axis" | "reference.binding";
export type ContinuityBlocker = { code: ContinuityBlockerCode; message: string };
export type ContinuityScore = { identity: number; costume: number; pose: number; position: number; scale: number; props: number; environment: number; lighting: number; camera: number; overall: number };
export type ContinuityGateInput = { previous: ShotState; current: ShotState; allowedChanges: string[]; beatClaims: Array<{ action?: string; text?: string }>; referenceAssetIds: string[] };
export type ContinuityGateResult = { ok: boolean; score: ContinuityScore; blockers: ContinuityBlocker[] };

const hasChangePermission = (allowedChanges: string[], words: string[]) => {
  const text = allowedChanges.join(" ").toLowerCase();
  return words.some((word) => text.includes(word));
};

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function evaluateStoryboardContinuity(input: ContinuityGateInput): ContinuityGateResult {
  const blockers: ContinuityBlocker[] = [];
  const previousCharacters = input.previous.characters;
  const currentCharacters = input.current.characters;
  const characterIds = new Set([...Object.keys(previousCharacters), ...Object.keys(currentCharacters)]);
  let identity = 100;
  let costume = 100;
  let pose = 100;
  let position = 100;
  let scale = 100;
  let props = 100;
  for (const id of characterIds) {
    const previous = previousCharacters[id];
    const current = currentCharacters[id];
    if (!previous || !current) { identity = 0; blockers.push({ code: "character.identity", message: `Character ${id} is missing from one Shot State` }); continue; }
    if (previous.identityRef !== current.identityRef) { identity = 0; blockers.push({ code: "character.identity", message: `Character ${id} identity changed without an allowed change` }); }
    if (previous.costumeRef !== current.costumeRef) { costume = 0; blockers.push({ code: "character.identity", message: `Character ${id} costume changed without an allowed change` }); }
    if (previous.pose !== current.pose || previous.facing !== current.facing || previous.eyeLine !== current.eyeLine) pose = Math.min(pose, 50);
    if (previous.position !== current.position) position = Math.min(position, 50);
    if (previous.scale !== current.scale && !hasChangePermission(input.allowedChanges, ["scale", "camera", "distance", "framing"])) { scale = 0; blockers.push({ code: "scale.lock", message: `Character ${id} scale changed without a camera explanation` }); }
    if (!equal(previous.heldPropIds, current.heldPropIds)) props = Math.min(props, 50);
    if (!input.referenceAssetIds.includes(current.identityRef)) blockers.push({ code: "reference.binding", message: `Missing reference asset for character ${id}` });
  }
  const previousAnchors = new Map(input.previous.environment.spatialAnchors.map((anchor) => [anchor.id, anchor]));
  for (const anchor of input.current.environment.spatialAnchors) {
    const previous = previousAnchors.get(anchor.id);
    if (previous && (previous.visible !== anchor.visible || previous.worldPosition !== anchor.worldPosition) && !hasChangePermission(input.allowedChanges, ["spatial", "move", "prop", "environment"])) {
      blockers.push({ code: "spatial.anchor", message: `Spatial anchor ${anchor.id} changed without an allowed spatial transition` });
    }
  }
  const environment = input.previous.environment.sceneId === input.current.environment.sceneId ? 100 : 0;
  if (environment === 0 && !hasChangePermission(input.allowedChanges, ["scene", "location", "environment"])) blockers.push({ code: "spatial.anchor", message: "Scene environment changed without an allowed transition" });
  const lighting = input.previous.environment.lighting === input.current.environment.lighting ? 100 : 50;
  const cameraAxisChanged = input.previous.camera.axis !== input.current.camera.axis;
  const camera = cameraAxisChanged && !hasChangePermission(input.allowedChanges, ["axis", "camera", "reverse", "cross"])
    ? 0
    : 100;
  if (camera === 0) blockers.push({ code: "camera.axis", message: "Camera axis changed without an explicit camera transition" });
  const transition = detectActionTransition(input.previous, input.current, input.beatClaims);
  if (transition.blockers.includes("action-transition")) { pose = 0; blockers.push({ code: "pose.transition", message: "Pose changed without enough transition beats" }); }
  const overall = Math.round((identity + costume + pose + position + scale + props + environment + lighting + camera) / 9);
  return { ok: blockers.length === 0, score: { identity, costume, pose, position, scale, props, environment, lighting, camera, overall }, blockers };
}
