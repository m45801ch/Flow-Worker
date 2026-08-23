import type { ShotState } from "./types";

type PromptInput = { previous: ShotState; current: ShotState; characterRefs: string[]; locationRef: string; propRefs: string[]; action?: string; dialogue?: string; characterDescriptions?: string[]; locationDescription?: string };
export function compileShotPrompt(input: PromptInput) {
  const { current } = input;
  const camera = [current.camera.shotSize, current.camera.angle, current.camera.lensMm ? `${current.camera.lensMm}mm lens` : "", current.camera.movement].filter(Boolean).join(", ");
  const atmosphere = [current.environment.weather, current.environment.lighting, current.lighting.source, current.lighting.color].filter(Boolean).join(", ");
  const stateCast = (current.characters as Array<any>).map((character) => character.description ? `${character.name || character.id}: ${character.description}` : character.id).filter(Boolean);
  const cast = input.characterDescriptions?.filter(Boolean).join("; ") || stateCast.join("; ") || input.characterRefs.join(", ");
  return [
    "Cinematic video shot",
    camera && `Camera: ${camera}`,
    input.locationDescription || input.locationRef ? `Setting: ${input.locationDescription || input.locationRef}` : "",
    atmosphere && `Atmosphere: ${atmosphere}`,
    cast && `Characters: ${cast}`,
    input.propRefs.length ? `Props: ${input.propRefs.join(", ")}` : "",
    input.action || (current as any).action || current.transition?.reason ? `Action: ${input.action || (current as any).action || current.transition?.reason}` : "",
    input.dialogue || (current as any).dialogue ? `Spoken dialogue in Traditional Chinese: \"${input.dialogue || (current as any).dialogue}\"` : "",
    "Preserve character identity, costume, props, environment, and spatial continuity."
  ].filter(Boolean).join(". ").replace(/\s+/g, " ").trim();
}
