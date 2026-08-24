import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoryboardDirectorView } from "./views/StoryboardDirectorView";
import type { StoryboardDocument } from "../domain/contracts/storyboard";

const storyboard: StoryboardDocument = {
  source: "script",
  episodes: [{
    id: "E01",
    segments: [{
      id: "SEG-01", sceneId: "S01", h3Prompt: "Palace hall", veoPrompt: "Lin Xiangru walks forward",
      cuts: [
        { id: "CUT-01", beats: ["B01"], durationSec: 4, previousState: "Lin stands at center", currentState: "Lin takes one step", continuityLocks: ["identity", "costume"], allowedChanges: ["camera push-in"], forbiddenChanges: ["throne appears"] },
        { id: "CUT-02", beats: ["B02"], durationSec: 8, previousState: "Lin takes one step", currentState: "Lin stops", continuityBlockers: ["spatial anchor: throne appeared without explanation"] },
      ],
    }],
  }],
};

describe("Storyboard Director", () => {
  it("requires a loaded script before compiling storyboard jobs", () => {
    render(<StoryboardDirectorView storyboard={storyboard} projectId="project-1" sourceDocumentVersion={3} videoModel="Veo 3.1 - Fast" aspectRatio="16:9" onQueue={vi.fn()} />);
    expect(screen.getByText(/請先載入劇本/)).toBeInTheDocument();
  });

  it("shows native Cut details and blocks only the inconsistent Cut", async () => {
    const onQueue = vi.fn();
    const onExportManifest = vi.fn();
    const { container } = render(<StoryboardDirectorView storyboard={storyboard} script={{ source: "loaded-script" }} projectId="project-1" sourceDocumentVersion={3} videoModel="Veo 3.1 - Fast" aspectRatio="16:9" onQueue={onQueue} onExportManifest={onExportManifest} />);
    expect(screen.getByText("CUT-01")).toBeInTheDocument();
    expect(screen.getByText("4 秒")).toBeInTheDocument();
    expect(screen.getByText("8 秒")).toBeInTheDocument();
    expect(screen.getAllByText(/上一鏡狀態/).length).toBeGreaterThan(0);
    expect(screen.getByText(/throne appeared/i)).toBeInTheDocument();
    const queueButtons = screen.getAllByRole("button").filter((button) => button.textContent?.includes("加入 Flow 佇列"));
    expect(queueButtons).toHaveLength(1);
    expect(queueButtons[0]).not.toBeDisabled();
    const blockedButton = screen.getByRole("button", { name: /修正連續性問題/ });
    expect(blockedButton).toBeDisabled();
    fireEvent.click(queueButtons[0]);
    expect(onQueue).toHaveBeenCalledWith([expect.objectContaining({ cutId: "CUT-01", durationSec: 4 })]);
    expect(await screen.findByText(/已成功送入 Flow 佇列：CUT-01/)).toBeInTheDocument();
    expect(container.querySelector(".action-result.success")).toHaveTextContent("已送出 Flow 佇列");
    expect(screen.getByText("已送出資訊（1）")).toBeInTheDocument();
    expect(container.querySelector(".submission-entry strong")).toHaveTextContent(/CUT-01 · Veo 3.1 - Fast · 16:9 · 4 秒/);
    const exportButton = screen.getByRole("button", { name: /匯出分段清單/ });
    expect(exportButton).toBeDisabled();
    fireEvent.click(exportButton);
    expect(onExportManifest).not.toHaveBeenCalled();
  });

  it("shows a failure notice when saving a storyboard job fails", async () => {
    const onQueue = vi.fn().mockRejectedValue(new Error("儲存任務失敗"));
    const { container } = render(<StoryboardDirectorView storyboard={storyboard} script={{ source: "loaded-script" }} projectId="project-1" sourceDocumentVersion={3} videoModel="Veo 3.1 - Fast" aspectRatio="16:9" onQueue={onQueue} />);
    fireEvent.click(screen.getAllByRole("button", { name: /加入 Flow 佇列/ })[0]);
    expect(await screen.findByText("送入 Flow 佇列失敗：儲存任務失敗")).toHaveClass("generation-error");
    expect(container.querySelector(".action-result.error")).toHaveTextContent("失敗：儲存任務失敗");
  });

  it("exports a manifest when every Cut passes continuity", () => {
    const onExportManifest = vi.fn();
    const validStoryboard: StoryboardDocument = { ...storyboard, episodes: [{ ...storyboard.episodes[0], segments: [{ ...storyboard.episodes[0].segments[0], cuts: [storyboard.episodes[0].segments[0].cuts[0]] }] }] };
    render(<StoryboardDirectorView storyboard={validStoryboard} script={{ source: "loaded-script" }} projectId="project-1" sourceDocumentVersion={3} videoModel="Veo 3.1 - Fast" aspectRatio="16:9" onQueue={vi.fn()} onExportManifest={onExportManifest} />);
    const exportButton = screen.getByRole("button", { name: /匯出分段清單/ });
    expect(exportButton).not.toBeDisabled();
    fireEvent.click(exportButton);
    expect(onExportManifest).toHaveBeenCalledWith(expect.objectContaining({ id: "SEG-01", totalDurationSec: 4, status: "planned" }));
  });
});


describe("Storyboard Director script fallback", () => {
  it("builds a valid segment and claims beats when storyboard data is missing", () => {
    const onQueue = vi.fn();
    const script = {
      source: "outline",
      episodes: [{
        id: "E01",
        title: "第一集",
        scenes: [{
          id: "scene-1-1",
          flow: [{ kind: "action", action: "趙王閱讀秦王書信", durationSec: 4 }],
        }],
      }],
    };
    render(<StoryboardDirectorView storyboard={undefined} script={script} projectId="project-1" sourceDocumentVersion={3} videoModel="Veo 3.1 - Fast" aspectRatio="16:9" onQueue={onQueue} />);
    expect(screen.getByText(/scene-1-1 ·/)).toBeInTheDocument();
    expect(screen.getByText(/1 個鏡頭 · 4 秒/)).toBeInTheDocument();
    const queueButton = screen.getByRole("button", { name: /加入 Flow 佇列/ });
    expect(queueButton).not.toBeDisabled();
    fireEvent.click(queueButton);
    expect(onQueue).toHaveBeenCalledWith([expect.objectContaining({ segmentId: "E01-scene-1-1-SEG", cutId: "E01-scene-1-1-SEG-C1", beatClaims: ["scene-1-1-B1"] })]);
  });
});


describe("Storyboard Director asset matching", () => {
  it("shows and queues a character reference when the Cut mentions the character", async () => {
    const onQueue = vi.fn().mockResolvedValue(undefined);
    const script = { source: "script", episodes: [{ id: "E01", scenes: [{ id: "scene-1", flow: [{ action: "趙王手持秦王書信，眉頭深鎖", durationSec: 4 }] }] }] };
    render(<StoryboardDirectorView storyboard={undefined} script={script} projectId="project-1" sourceDocumentVersion={2} videoModel="Veo 3.1 - Fast" aspectRatio="16:9" assetCatalog={[{ id: "char-zhao", name: "趙王", kind: "character", referenceAssetIds: ["ref-zhao"] }]} onQueue={onQueue} />);
    expect(screen.getByText("本鏡自動加入素材")).toBeInTheDocument();
    expect(screen.getByText("本鏡自動加入素材").parentElement?.textContent).toContain("趙王");
    fireEvent.click(screen.getByRole("button", { name: /加入 Flow 佇列/ }));
    expect(await screen.findByText(/已成功送入 Flow 佇列/)).toBeInTheDocument();
    expect(onQueue).toHaveBeenCalledWith([expect.objectContaining({ assetNames: ["趙王"], inputAssetIds: ["ref-zhao"] })]);
  });
});
