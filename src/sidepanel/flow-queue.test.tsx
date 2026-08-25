import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlowQueueView } from "./views/FlowQueueView";
import type { StoredJobRecord } from "../storage/job-store";

const job: StoredJobRecord = {
  id: "job-1", projectId: "project-1", kind: "character-sheet", sourceEntityId: "char-1", status: "pending",
  modelName: "Nano Banana 2", aspectRatio: "16:9", outputCount: 1, prompt: "character prompt", assetBindings: [], inputAssetIds: [],
  manifest: { id: "job-1" } as any, attempts: 0, outputAssetIds: [], checkpoint: "pending", updatedAt: "2026-08-24T00:00:00.000Z",
};

describe("Flow Queue controls", () => {
  it("offers single Prompt execution and removal for each job", () => {
    const onExecuteJob = vi.fn();
    const onRemove = vi.fn();
    const onRemoveAll = vi.fn();
    render(<FlowQueueView jobs={[job]} running={false} error="" queueDelaySec={3} onQueueDelayChange={vi.fn()} onExecute={vi.fn()} onStop={vi.fn()} onPause={vi.fn()} onResume={vi.fn()} onRetry={vi.fn()} onCancel={vi.fn()} onExecuteJob={onExecuteJob} onRemove={onRemove} onRemoveAll={onRemoveAll} />);
    fireEvent.click(screen.getByRole("button", { name: /單獨執行/ }));
    fireEvent.click(screen.getByRole("button", { name: /移除/ }));
    expect(onExecuteJob).toHaveBeenCalledWith("job-1");
    expect(onRemove).toHaveBeenCalledWith("job-1");
    fireEvent.click(screen.getByRole("button", { name: "刪除全部任務" }));
    expect(onRemoveAll).toHaveBeenCalledTimes(1);
  });

  it("allows changing the delay between queued jobs", () => {
    const onQueueDelayChange = vi.fn();
    render(<FlowQueueView jobs={[]} running={false} error="" queueDelaySec={3} onQueueDelayChange={onQueueDelayChange} onExecute={vi.fn()} onStop={vi.fn()} onPause={vi.fn()} onResume={vi.fn()} onRetry={vi.fn()} onCancel={vi.fn()} onExecuteJob={vi.fn()} onRemove={vi.fn()} onRemoveAll={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("任務間隔等待秒數"), { target: { value: "5" } });
    expect(onQueueDelayChange).toHaveBeenCalledWith(5);
  });
});
