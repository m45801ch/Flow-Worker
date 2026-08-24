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
