export type VeoPromptInput = {
  styleWorld: string;
  referenceBindings: string[];
  startState: string;
  action: string;
  camera: string;
  dialogue?: string;
  audio?: string;
  continuityLocks: string[];
  negative: string[];
};

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required for Veo prompt compilation`);
  return normalized;
};

const section = (heading: string, body: string) => `${heading}\n${body.trim()}`;

export function compileVeoPrompt(input: VeoPromptInput): string {
  const styleWorld = required(input.styleWorld, "styleWorld");
  const startState = required(input.startState, "startState");
  const action = required(input.action, "action timeline");
  const camera = required(input.camera, "camera");
  const references = input.referenceBindings.filter(Boolean).join(", ") || "none";
  const dialogue = input.dialogue?.trim() || "No spoken dialogue.";
  const audio = input.audio?.trim() || "Natural production sound only.";
  const locks = input.continuityLocks.filter(Boolean).join("; ") || "Preserve all supplied visual identity and spatial relationships.";
  const negative = input.negative.filter(Boolean).join(", ") || "No extra people, objects, text, or watermark.";
  return [
    section("STYLE & WORLD", styleWorld),
    section("REFERENCE BINDINGS", references),
    section("START STATE", startState),
    section("0–8 SECOND ACTION", action),
    section("CAMERA", camera),
    section("DIALOGUE & AUDIO", `Dialogue: ${dialogue}\nAudio: ${audio}`),
    section("CONTINUITY LOCKS", locks),
    section("NEGATIVE", negative)
  ].join("\n\n");
}
