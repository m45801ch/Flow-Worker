export type FrameStrategy = "use-tail-frame" | "rebuild-start-frame" | "use-scene-start-frame";
export type ShotContinuitySummary = { sceneId: string; cameraKey: string };
export type FrameStrategyInput = { previous: ShotContinuitySummary; current: ShotContinuitySummary };

export function selectNextFrameStrategy(input: FrameStrategyInput): FrameStrategy {
  if (input.previous.sceneId !== input.current.sceneId) return "use-scene-start-frame";
  if (input.previous.cameraKey !== input.current.cameraKey) return "rebuild-start-frame";
  return "use-tail-frame";
}
