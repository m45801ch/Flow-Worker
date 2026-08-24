import { artDocumentSchema, type ArtDocument } from "../../domain/contracts/art";
import { castDocumentSchema, type CastDocument } from "../../domain/contracts/cast";
import { outlineDocumentSchema, type OutlineDocument } from "../../domain/contracts/outline";
import { scriptDocumentSchema, type ScriptDocument } from "../../domain/contracts/script";
import { storyboardDocumentSchema, type StoryboardDocument } from "../../domain/contracts/storyboard";
import { runArtGates } from "../../domain/gates/art-gates";
import { runCastGates } from "../../domain/gates/cast-gates";
import { runOutlineGates } from "../../domain/gates/outline-gates";
import { runScriptGates } from "../../domain/gates/script-gates";
import { runStoryboardGates } from "../../domain/gates/storyboard-gates";
import type { ProjectDocumentV2 } from "../../domain/project-v2";
import type { ProjectContext } from "../../domain/types";
import type { GenerationPort, NativeStage, PipelineRunner, StageResult } from "../types";
import { stagePrompt } from "../types";

const stageSchemas: Record<NativeStage, string> = {
  outline: JSON.stringify({ adaptation: {}, characters: [{ id: "C01" }], scenes: [{ id: "S01" }], props: [{ id: "P01" }], beats: [{ id: "B01" }], episodes: [{ id: "E01" }], params: {} }),
  cast: JSON.stringify({ characters: [{ id: "C01", name: "", persona: {}, relationships: [], evidence: [], image: { prompt: "", sheetPrompt: "", negativePrompt: "" }, voice: { prompt: "" } }] }),
  art: JSON.stringify({ scenes: [{ id: "S01", name: "", anchors: [], lightingStates: [], variants: [], imagePrompt: "" }], props: [{ id: "P01", name: "", scale: "", states: [], imagePrompt: "" }], costumes: [] }),
  script: JSON.stringify({ source: "outline", episodes: [{ id: "E01", title: "", scenes: [{ id: "E01-S01", flow: [{ kind: "action", action: "", durationSec: 4 }] }] }] }),
  storyboard: JSON.stringify({ source: "script", episodes: [{ id: "E01", segments: [{ id: "E01-01", sceneId: "S01", h3Prompt: "", veoPrompt: "", cuts: [{ id: "E01-01-C01", beats: ["B01"], durationSec: 4 }] }] }] })
};

type Contract = { schema: { safeParse(value: unknown): { success: boolean; data?: unknown; error?: { message: string } } }; gate: (value: unknown, upstream?: unknown) => ReturnType<typeof runOutlineGates> };

const contracts: Record<NativeStage, Contract> = {
  outline: { schema: outlineDocumentSchema, gate: runOutlineGates },
  cast: { schema: castDocumentSchema, gate: runCastGates },
  art: { schema: artDocumentSchema, gate: runArtGates },
  script: { schema: scriptDocumentSchema, gate: runScriptGates },
  storyboard: { schema: storyboardDocumentSchema, gate: runStoryboardGates }
};

export type StageDocument = OutlineDocument | CastDocument | ArtDocument | ScriptDocument | StoryboardDocument;
export type StageRunner<I, O> = PipelineRunner<I, O>;

const nativeStagePrompt = (stage: NativeStage): string => {
  const base = `You are the ${stage} stage in a deterministic story production pipeline. Return only JSON matching this exact native ${stage} contract. Preserve stable IDs, never invent unsupported references, and keep all prompts complete.`;
  return stage === "cast" ? `${base} For every character, image.prompt must be a complete English cinematic image.prompt of at least 12 words with visible appearance details and photography language such as face, hair, costume, expression, lighting, lens, or resolution. Never copy a short Chinese persona summary into image.prompt. image.sheetPrompt must remain a complete three-view layout prompt.` : base;
};

function createRunner<I, O extends StageDocument>(stage: NativeStage, port: GenerationPort, project: ProjectDocumentV2): StageRunner<I, O> {
  const contract = contracts[stage];
  return {
    async run(input: I, context: ProjectContext): Promise<StageResult<O>> {
      const response = await port.generateText({
        systemPrompt: nativeStagePrompt(stage),
        userPrompt: JSON.stringify({ input, projectId: project.project.id, sourceVersions: project.documents }),
        schema: stageSchemas[stage],
        language: context.language,
        model: project.project.model,
        temperature: stage === "storyboard" ? 0.3 : 0.5
      });
      if (response.json === undefined) throw new Error(`${stage} did not return structured JSON`);
      const parsed = contract.schema.safeParse(response.json);
      if (!parsed.success) throw new Error(`${stage} contract-invalid: ${parsed.error?.message || "invalid native document"}`);
      const gate = contract.gate(parsed.data, input);
      if (!gate.passed) throw new Error(`${stage} quality-gate-blocked: ${gate.blockers.map((item) => item.code).join(", ")}`);
      return { stage, version: 1, output: parsed.data as O, generatedAt: new Date().toISOString(), gate };
    }
  };
}

export function createStageRunners(port: GenerationPort, project: ProjectDocumentV2) {
  return {
    outline: createRunner<unknown, OutlineDocument>("outline", port, project),
    cast: createRunner<unknown, CastDocument>("cast", port, project),
    art: createRunner<unknown, ArtDocument>("art", port, project),
    script: createRunner<unknown, ScriptDocument>("script", port, project),
    storyboard: createRunner<unknown, StoryboardDocument>("storyboard", port, project)
  };
}

export const nativeContractSchemas = contracts;
export { stagePrompt };
