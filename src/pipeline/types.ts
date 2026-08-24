import type { ProjectDocument } from "../domain/project";
import type { ProjectContext } from "../domain/types";
import type { GateReport } from "../domain/gates/types";

export type NativeStage = "outline" | "cast" | "art" | "script" | "storyboard";
export type PipelineStage = NativeStage | "characters";
export type StageResult<T> = { stage: PipelineStage; version: number; output: T; generatedAt: string; gate?: GateReport };
export interface PipelineRunner<I, O> { run(input: I, context: ProjectContext): Promise<StageResult<O>>; }
export type GenerationPort = { generateText(input: { systemPrompt: string; userPrompt: string; schema: string; language: string; model: string; temperature: number }): Promise<{ json?: unknown; text: string }> };
export const stagePrompt = (stage: PipelineStage, project: ProjectDocument) => `You are the ${stage} stage of a general AI film planning pipeline. Never hardcode a story, character, dynasty, throne, or example. Return only JSON matching the requested schema. Project settings: ${JSON.stringify(project.project.settings)}`;
