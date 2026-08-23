import type { ProjectDocument } from "../domain/project";
import type { ProjectContext } from "../domain/types";
import type { GenerationPort, PipelineRunner, PipelineStage, StageResult } from "./types";
import { stagePrompt } from "./types";

const run = <I, O>(stage: PipelineStage, port: GenerationPort, project: ProjectDocument): PipelineRunner<I, O> => ({ async run(input: I, context: ProjectContext): Promise<StageResult<O>> {
  const result = await port.generateText({ systemPrompt: stagePrompt(stage, project), userPrompt: JSON.stringify(input), schema: `{"stage":"${stage}","data":{}}`, language: context.language, model: project.project.model, temperature: 0.7 });
  if (!result.json) throw new Error(`${stage} did not return structured JSON`);
  return { stage, version: 1, output: result.json as O, generatedAt: new Date().toISOString() };
} });
export const createPipeline = (port: GenerationPort, project: ProjectDocument) => ({ outline: run("outline", port, project), characters: run("characters", port, project), art: run("art", port, project), script: run("script", port, project), storyboard: run("storyboard", port, project) });
