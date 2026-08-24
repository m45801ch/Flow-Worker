import { beforeEach, describe, expect, it } from "vitest";
import { scanFlowCapabilities } from "./capability-scanner";
import { detectFlowPage } from "./page-detector";
import { configureFlow } from "./mode-adapter";
import { fillFlowPrompt } from "./prompt-adapter";
import { bindFlowAssets } from "./asset-binder";
import type { FlowJobManifest } from "../jobs/types";

const job = (outputMode: "image" | "video" = "video"): FlowJobManifest => ({ id: "job-1", projectId: "project-1", kind: outputMode === "video" ? "veo-segment" : "character-sheet", sourceDocumentVersion: 1, sourceEntityId: "C01", prompt: "prompt", negativePrompt: "negative", assetBindings: ["C01"], inputAssetIds: [], outputMode, modelName: outputMode === "video" ? "Veo 3.1 - Quality" : "Nano Banana 2", aspectRatio: "9:16", durationSec: outputMode === "video" ? 8 : undefined, dependencies: [], retryPolicy: { maxAttempts: 2, backoffMs: 10 } });

function mountFixture(locale: string) {
  document.documentElement.lang = locale;
  document.body.innerHTML = `
    <main data-flow-page="project">
      <select data-flow-role="mode" aria-label="${locale === "en" ? "Mode" : "模式"}">
        <option value="image">${locale === "en" ? "Image" : "圖片"}</option>
        <option value="video">${locale === "en" ? "Video" : "影片"}</option>
      </select>
      <select data-flow-role="model" aria-label="${locale === "en" ? "Model" : "模型"}"
        ><option value="image_model_2">🍌 Nano Banana 2</option><option value="video_model_quality">Veo 3.1 - Quality</option></select>
      <select data-flow-role="aspect" aria-label="${locale === "en" ? "Aspect ratio" : "比例"}"><option value="16:9">16:9</option><option value="9:16">9:16</option></select>
      <textarea data-flow-role="prompt"></textarea>
      <input data-flow-role="asset-input" type="file" />
      <button data-flow-role="submit">${locale === "en" ? "Generate" : "生成"}</button>
    </main>`;
}

describe("Flow DOM adapters", () => {
  beforeEach(() => { mountFixture("en"); });

  it.each(["zh-TW", "zh-CN", "en"]) ("selects exact configured models and aspect in %s", async (locale) => {
    mountFixture(locale);
    const result = await configureFlow(job(), document);
    expect(result.ok).toBe(true);
    expect((document.querySelector('[data-flow-role="mode"]') as HTMLSelectElement).value).toBe("video");
    expect((document.querySelector('[data-flow-role="model"]') as HTMLSelectElement).value).toBe("video_model_quality");
    expect((document.querySelector('[data-flow-role="aspect"]') as HTMLSelectElement).value).toBe("9:16");
  });

  it("selects the configured image model by its visible name even when Flow uses an internal option value", async () => {
    const result = await configureFlow(job("image"), document);
    expect(result.ok).toBe(true);
    expect((document.querySelector('[data-flow-role="model"]') as HTMLSelectElement).value).toBe("image_model_2");
  });

  it("scans current capabilities instead of replacing a missing model", () => {
    const capabilities = scanFlowCapabilities(document);
    expect(capabilities.imageModels).toEqual(["Nano Banana 2"]);
    expect(capabilities.videoModels).toContain("Veo 3.1 - Quality");
    expect(capabilities.aspectRatios).toEqual(["16:9", "9:16"]);
  });

  it("fills prompt and reads it back from the exact prompt element", () => {
    expect(fillFlowPrompt("hello Flow", document)).toEqual({ ok: true, expected: "hello Flow", actual: "hello Flow", candidates: [] });
  });

  it("detects non-Flow pages and reports ambiguous asset bindings", () => {
    expect(detectFlowPage(document).isFlowPage).toBe(true);
    document.body.innerHTML = "<main></main>";
    expect(detectFlowPage(document).isFlowPage).toBe(false);
    mountFixture("en");
    expect(bindFlowAssets(["C01"], document)).toMatchObject({ ok: false, status: "needs-user-selection" });
  });
});
