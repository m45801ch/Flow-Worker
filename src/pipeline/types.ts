import type { ProjectContext } from "../domain/types";
import type { ProjectDocument } from "../domain/project";
export type PipelineStage = "outline" | "characters" | "art" | "script" | "storyboard";
export type StageResult<T> = { stage: PipelineStage; version: number; output: T; generatedAt: string };
export interface PipelineRunner<I, O> { run(input: I, context: ProjectContext): Promise<StageResult<O>>; }
export type GenerationPort = { generateText(input: { systemPrompt: string; userPrompt: string; schema: string; language: string; model: string; temperature: number }): Promise<{ json?: unknown; text: string }> };
export const stagePrompt = (stage: PipelineStage, project: ProjectDocument) => `You are the ${stage} stage of a general AI film planning pipeline. Never hardcode a story, character, dynasty, throne, or example. Return only JSON matching the requested schema. Project settings: ${JSON.stringify(project.project.settings)}`;
