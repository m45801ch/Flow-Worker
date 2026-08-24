import { describe, expect, it } from "vitest";
import { compileStoryboardJobs } from "./storyboard-job-compiler";

const context = { projectId: "project-1", sourceDocumentVersion: 3, videoModel: "Veo 3.1 - Fast", aspectRatio: "16:9" as const };
const storyboard = { source: "script", episodes: [{ id: "E01", segments: [{ id: "E01-01", sceneId: "S01", h3Prompt: "wide harbor", veoPrompt: "Mara walks to the lighthouse", assetBindings: ["C01", "S01"], cuts: [{ id: "E01-01-C01", beats: ["B01"], durationSec: 4, inputAssetIds: ["A01"] }, { id: "E01-01-C02", beats: ["B02"], durationSec: 8, action: "Mara opens the door" }] }] }] };

describe("storyboard Flow video jobs", () => {
  it("creates one immutable Veo job per cut", () => {
    const jobs = compileStoryboardJobs(storyboard, context);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ kind: "veo-segment", sourceEntityId: "E01-01-C01", outputMode: "video", modelName: "Veo 3.1 - Fast", aspectRatio: "16:9", durationSec: 4, assetBindings: ["C01", "S01"], inputAssetIds: ["A01"] });
    expect(jobs[1].durationSec).toBe(8);
  });

  it("preserves segment, cut, beat, and continuity metadata on every job", () => {
    const enriched = { ...storyboard, episodes: [{ ...storyboard.episodes[0], segments: [{ ...storyboard.episodes[0].segments[0], cuts: [{ ...storyboard.episodes[0].segments[0].cuts[0], previousState: "Mara stands at the lighthouse door", currentState: "Mara remains standing at the lighthouse door", continuityLocks: ["Mara remains standing"], allowedChanges: ["camera pushes in"], forbiddenChanges: ["Mara sits down"] }] }] }] };
    const [job] = compileStoryboardJobs(enriched, context);
    expect(job).toMatchObject({ segmentId: "E01-01", cutId: "E01-01-C01", beatClaims: ["B01"], previousState: "Mara stands at the lighthouse door", currentState: "Mara remains standing at the lighthouse door", allowedChanges: ["camera pushes in"], forbiddenChanges: ["Mara sits down"] });
  });

  it("runs continuity gates for structured Shot State and persists blockers", () => {
    const previousShotState = { characters: { zhao: { identityRef: "char-3", pose: "standing", position: "center", facing: "camera", eyeLine: "camera", scale: "42%", costumeRef: "costume-royal", heldPropIds: [] } }, environment: { sceneId: "S01", spatialAnchors: [{ id: "throne", description: "dragon throne", worldPosition: "back wall", visible: false }], lighting: "daylight" }, camera: { shotSize: "medium", lensMm: 50, axis: "axis-A", movement: "static", framing: "center" } };
    const currentShotState = { ...previousShotState, environment: { ...previousShotState.environment, spatialAnchors: [{ ...previousShotState.environment.spatialAnchors[0], visible: true }] } };
    const enriched = { ...storyboard, episodes: [{ ...storyboard.episodes[0], segments: [{ ...storyboard.episodes[0].segments[0], cuts: [{ ...storyboard.episodes[0].segments[0].cuts[0], inputAssetIds: ["char-3"], previousShotState, currentShotState }] }] }] };
    const [job] = compileStoryboardJobs(enriched, context);
    expect(job.continuityBlockers).toEqual(expect.arrayContaining([expect.stringContaining("spatial.anchor")]));
    expect(job.continuityScore).toBeTypeOf("number");
  });

  it("rejects a non-native duration instead of coercing it", () => {
    const invalid = { ...storyboard, episodes: [{ ...storyboard.episodes[0], segments: [{ ...storyboard.episodes[0].segments[0], cuts: [{ ...storyboard.episodes[0].segments[0].cuts[0], durationSec: 5 }] }] }] };
    expect(() => compileStoryboardJobs(invalid, context)).toThrow(/4, 6, or 8/i);
  });

  it("rejects a cut longer than eight seconds instead of reassigning its beats", () => {
    const invalid = { ...storyboard, episodes: [{ ...storyboard.episodes[0], segments: [{ ...storyboard.episodes[0].segments[0], cuts: [{ ...storyboard.episodes[0].segments[0].cuts[0], durationSec: 9 }] }] }] };
    expect(() => compileStoryboardJobs(invalid, context)).toThrow(/8 seconds/i);
  });

  it("rejects a cut without a beat claim", () => {
    const invalid = { ...storyboard, episodes: [{ ...storyboard.episodes[0], segments: [{ ...storyboard.episodes[0].segments[0], cuts: [{ ...storyboard.episodes[0].segments[0].cuts[0], beats: [] }] }] }] };
    expect(() => compileStoryboardJobs(invalid, context)).toThrow(/beat/i);
  });
});
