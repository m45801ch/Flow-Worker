import { beforeAll, describe, expect, it } from "vitest";
import { createProject } from "../domain/project";

let applyStage: typeof import("./main").applyStage;
let stageInput: typeof import("./main").stageInput;
beforeAll(async () => {
  document.body.innerHTML = '<div id="root"></div>';
  ({ applyStage, stageInput } = await import("./main"));
});

describe("side panel pipeline mapping", () => {
  it("builds stage input from the current project instead of fixed demo data", () => {
    const project = createProject("test", { ...createProject().project.settings, theme: "A lighthouse mystery" });
    const input = stageInput("characters", project);
    expect(input.userPrompt).toContain("A lighthouse mystery");
    expect(input.userPrompt).not.toContain("趙王");
    const artInput = stageInput("art", project);
    expect(artInput.systemPrompt).toContain("complete English cinematic visual prompt");
    expect(artInput.schema).toContain("sheetPrompt");
    const scriptInput = stageInput("script", project);
    expect(scriptInput.userPrompt).toContain('"targetDurationSec":60');
    expect(scriptInput.userPrompt).toContain("episode.targetSeconds 必須設為 60");
  });

  it("maps all five pipeline outputs into project state", () => {
    let project = createProject();
    project = applyStage(project, "outline", { title: "Lighthouse", logline: "A mystery" });
    project = applyStage(project, "characters", { characters: [{ name: "Mara" }], locations: [{ name: "Lighthouse" }], props: [{ name: "Key" }], costumes: [{ name: "Coat" }] });
    project = applyStage(project, "art", { assetPrompts: [{ assetId: "char-1", prompt: "Cinematic close-up of Mara, a disciplined detective with sharp observant eyes, short black hair, calm focused expression, wearing a tailored charcoal detective coat over a dark shirt, cinematic noir lighting, 8k resolution, highly detailed facial features.", sheetPrompt: "16:9 HORIZONTAL CHARACTER SHEET. LEFT 34% FRONT HALF-BODY PORTRAIT. RIGHT-TOP FRONT, SIDE, BACK VIEWS. RIGHT-BOTTOM 4 DETAILS. SAME FACE, SAME HAIR, SAME PROPORTIONS.", negativePrompt: "text, watermark, extra people" }], spatialMaps: [{ sceneId: "scene-1", entities: [], relations: [] }] });
    project = applyStage(project, "script", { episodes: [{ title: "Opening", scenes: [{ beats: [{ action: "arrives", dialogue: "", durationSec: 4 }] }] }] });
    project = applyStage(project, "storyboard", { shotStates: [{ shotId: "shot-1", sceneId: "scene-1", characters: [], props: [], environment: { lighting: "night", weather: "clear", anchors: [] }, camera: { shotSize: "wide", lensMm: 35, distanceM: 4, angle: "eye", movement: "static" }, lighting: { source: "moon", intensity: "low", color: "blue" }, continuity: { locks: [], allowedChanges: [] } }] });
    expect(project.outline?.data.title).toBe("Lighthouse");
    expect(project.characters[0].name).toBe("Mara");
    expect(project.characters[0].prompts.visual).toContain("Cinematic close-up of Mara");
    expect(project.characters[0].prompts.sheet).toContain("CHARACTER SHEET");
    expect(project.characters[0].prompts.negative).toContain("extra people");
    expect(project.episodes[0].scenes[0].beats[0].action).toBe("arrives");
    expect(project.shotStates[0].shotId).toBe("shot-1");
  });

  it("marks art complete even when the provider uses a different valid prompt shape", () => {
    const project = applyStage(createProject(), "art", { visualPrompts: [{ name: "unused", visualPrompt: "wide scene" }] });
    expect(project.artCompleted).toBe(true);
  });

  it("maps a top-level scenes script response into an episode", () => {
    const project = applyStage(createProject(), "script", { scenes: [{ name: "Opening", actions: [{ description: "A door opens", lines: "誰在那裡？" }] }] });
    expect(project.episodes).toHaveLength(1);
    expect(project.episodes[0].scenes[0].beats[0].action).toBe("A door opens");
  });

  it("recursively maps provider-specific script scenes", () => {
    const project = applyStage(createProject(), "script", { screenplay: { actOne: { scene_1: { scene_number: 1, heading: "INT. ROOM", events: [{ visual: "A lamp flickers", dialogue: { text: "有人嗎？" } }] } } } });
    expect(project.episodes[0].scenes[0].locationId).toBe("INT. ROOM");
    expect(project.episodes[0].scenes[0].beats[0].dialogue).toBe("有人嗎？");
  });

  it("normalizes incomplete storyboard output before compiling prompts", () => {
    const project = applyStage(createProject(), "storyboard", { shots: [{ id: "ai-shot", scene: "scene-1" }] });
    const shot = project.shotStates[0] as any;
    expect(shot.continuity).toEqual({ locks: [], allowedChanges: [] });
    expect(shot.camera).toBeDefined();
    expect(shot.environment.anchors).toEqual([]);
  });

  it("maps nested storyboard scenes into shot states", () => {
    const project = applyStage(createProject(), "storyboard", { storyboard: { scenes: [{ shots: [{ id: "nested-shot" }] }] } });
    expect((project.shotStates[0] as any).shotId).toBe("nested-shot");
  });

  it("recursively discovers provider-specific storyboard arrays", () => {
    const project = applyStage(createProject(), "storyboard", { storyboardPlan: { sequence: [{ shot_number: 3, framing: "wide", visual: "A figure enters" }] } });
    expect((project.shotStates[0] as any).shotId).toBe(3);
    expect((project.shotStates[0] as any).camera.shotSize).toBe("wide");
  });

  it("maps shuohao segments, cuts, and H3 production prompts", () => {
    const project = applyStage(createProject(), "storyboard", { episodes: [{ ep: 1, segments: [{ id: "E01-01", sceneIndex: 0, h3Prompt: "[Shot 1] 0.00s wide shot", cuts: [{ beats: [1, 2], seconds: 4, size: "wide shot", camera: "static", characters: ["C01"], props: [], frame: "A figure enters" }] }] }] });
    expect(project.shotStates).toHaveLength(1);
    expect(project.promptVersions[0].prompt).toContain("[Shot 1]");
  });
});


describe("script duration budget", () => {
  it("caps one episode at the configured target and removes empty beats", () => {
    const settings = { ...createProject().project.settings, episodeDurationSec: 120 };
    const project = applyStage(createProject("120-second test", settings), "script", {
      episodes: [{
        id: "E01",
        scenes: [{
          id: "scene-1",
          flow: [
            { action: "趙王閱讀書信", durationSec: 15 },
            { action: "", durationSec: 15 },
            { action: "群臣低聲議論", durationSec: 15 },
            { action: "藺相如出列", durationSec: 15 },
            { action: "趙王沉思", durationSec: 15 },
            { action: "殿內氣氛凝重", durationSec: 15 },
            { action: "趙王看向群臣", durationSec: 15 },
            { action: "藺相如拱手", durationSec: 15 },
            { action: "眾臣安靜下來", durationSec: 15 },
            { action: "趙王等待答覆", durationSec: 15 },
          ],
        }],
      }],
    });
    const beats = project.episodes[0].scenes[0].beats;
    const totalSeconds = beats.reduce((sum, beat) => sum + beat.durationSec, 0);
    expect(totalSeconds).toBeLessThanOrEqual(120);
    expect(beats.every((beat) => [4, 6, 8].includes(beat.durationSec))).toBe(true);
    expect(beats.every((beat) => beat.action.trim() || beat.dialogue.trim())).toBe(true);
  });
});
