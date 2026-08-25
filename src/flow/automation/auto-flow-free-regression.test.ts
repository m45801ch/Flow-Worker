import { describe, expect, it } from "vitest";
import executor from "../auto-flow-free.js?raw";
import serviceWorker from "../../background/service-worker.ts?raw";

describe("embedded Auto-Flow executor regressions", () => {
  it("does not report success when trusted click has no Flow DOM acknowledgement", () => {
    expect(executor).toContain("trusted click accepted but Flow did not acknowledge");
    expect(executor).toContain("Google Flow 未確認建立請求");
    expect(executor).toContain("if (acknowledged)");
    expect(executor).toContain("for (let attempt = 1; attempt <= 2; attempt++)");
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


describe("frame and image-mode dispatch safeguards", () => {
  it("runs the injected executor only in the top Flow document and filters iframe state events", () => {
    expect(executor).toContain("if (window.top !== window) return;");
    expect(serviceWorker).toContain("target: { tabId }");
    expect(serviceWorker).not.toContain("allFrames: true");
    expect(serviceWorker).toContain("senderFrameId !== 0");
  });
  it("forces image mode before applying image settings and blocks submission when a required setting is missing", () => {
    expect(executor).toContain('const modeSuffix = kind === "image" ? "-trigger-image" : "-trigger-video"');
    expect(executor).toContain('.toLowerCase().endsWith(modeSuffix)');
    expect(executor).toContain('.toLowerCase().endsWith("-trigger-" + n)');
    expect(executor).toContain('button[role=\'tab\']');
    expect(executor).toContain('Google Flow 找不到圖片模型');
    expect(executor).toContain('Google Flow 找不到生成張數');
    expect(executor).toContain('Google Flow 未找到圖片結果，請查看 Flow 頁面與除錯紀錄');
    expect(executor).toContain('Google Flow 點數或方案錯誤：');
    expect(executor).toContain('function detectCreditBlock()');
    expect(executor).toContain('生成|產生|將|将');
    expect(executor).toContain('消耗|消費');
    expect(executor).toContain('點數不足');
    expect(executor).toContain('「0 个点数」通常只是目前動作的成本標籤');
    expect(executor).not.toContain('目前顯示 0 個點數，無法建立圖片');
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

describe("image queue reliability", () => {
  it("clears Slate editor before filling to avoid 923→1846 duplication on retry", () => {
    expect(executor).toContain("function clearPromptEditor");
    expect(executor).toContain("clearPromptEditor(el, slateEditor)");
    expect(executor).toContain("selectAll");
    expect(executor).toContain("923→1846");
  });
  it("reports image result before fetching prevImage and tolerates prevImage fetch failure", () => {
    expect(executor).toContain("Image result reported for item");
    expect(executor).toContain("先回報結果，讓背景將任務標記為完成");
    expect(executor).toContain("prevImage 下載失敗（不影響已完成判定）");
    expect(executor).toContain("waitForResult(60000)");
  });
});
