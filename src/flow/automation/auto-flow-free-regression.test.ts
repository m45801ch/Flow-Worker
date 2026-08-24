import { describe, expect, it } from "vitest";
import executor from "../auto-flow-free.js?raw";

describe("embedded Auto-Flow executor regressions", () => {
  it("does not fail a Prompt when trusted click is accepted but immediate DOM acknowledgement is late", () => {
    expect(executor).toContain("trusted click accepted");
    expect(executor).toContain("if (await activateSubmitButton(button))");
    expect(executor).not.toContain("if (await activateSubmitButton(button) && await waitForSubmissionStart(button))");
  });

  it("reports the executor error detail with an ITEM_STATUS failure", () => {
    expect(executor).toContain("reportItemStatus(item.id, \"error\", errorMessage)");
    expect(executor).toContain("type: \"ITEM_STATUS\", id, status");
  });
});


  it("searches the Flow asset picker and names generated image downloads", () => {
    expect(executor).toContain("tryAddMatchedAssets(item.text, item.assetNames || [])");
    expect(executor).toContain("添加到提示");
    expect(executor).toContain("findPickerSearch");
    expect(executor).toContain("item.outputName || item.sourceEntityName");
  });


  it("uses the inspected Google Flow dialog selectors", () => {
    expect(executor).toContain('button[aria-haspopup="dialog"]');
    expect(executor).toContain('#add-menu-input');
    expect(executor).toContain('[role=\'option\']');
    expect(executor).toContain('=== "添加到提示"');
    expect(executor).toContain('div[role="dialog"][data-state="open"]');
  });


describe("image-mode dispatch safeguards", () => {
  it("forces image mode before applying image settings and blocks submission when a required setting is missing", () => {
    expect(executor).toContain('const modeSuffix = kind === "image" ? "-trigger-image" : "-trigger-video"');
    expect(executor).toContain('.toLowerCase().endsWith(modeSuffix)');
    expect(executor).toContain('.toLowerCase().endsWith("-trigger-" + n)');
    expect(executor).toContain('button[role=\'tab\']');
    expect(executor).toContain('Google Flow 找不到圖片模型');
    expect(executor).toContain('Google Flow 找不到生成張數');
    expect(executor).toContain('Google Flow 未找到圖片結果，請查看 Flow 頁面與除錯紀錄');
  });

  it("uses the inspected Flow Radix triggers for aspect ratio and output count", () => {
    expect(executor).toContain('"-trigger-LANDSCAPE"');
    expect(executor).toContain('"-trigger-PORTRAIT"');
    expect(executor).toContain('suffix.toUpperCase()');
    expect(executor).toContain('"-trigger-" + n');
    expect(executor).toContain('selectByText("x" + n)');
    expect(executor).toContain("[role=\"menuitem\"]");
    expect(executor).toContain("from role=menuitem");
  });
});
