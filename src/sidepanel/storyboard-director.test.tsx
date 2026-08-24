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

  it("shows native Cut details and blocks only the inconsistent Cut", () => {
    const onQueue = vi.fn();
    const onExportManifest = vi.fn();
    render(<StoryboardDirectorView storyboard={storyboard} script={{ source: "loaded-script" }} projectId="project-1" sourceDocumentVersion={3} videoModel="Veo 3.1 - Fast" aspectRatio="16:9" onQueue={onQueue} onExportManifest={onExportManifest} />);
    expect(screen.getByText("CUT-01")).toBeInTheDocument();
    expect(screen.getByText("4 秒")).toBeInTheDocument();
    expect(screen.getByText("8 秒")).toBeInTheDocument();
    expect(screen.getAllByText(/previous state/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/throne appeared/i)).toBeInTheDocument();
    const queueButtons = screen.getAllByRole("button").filter((button) => button.textContent?.includes("加入 Flow 佇列"));
    expect(queueButtons).toHaveLength(1);
    expect(queueButtons[0]).not.toBeDisabled();
    const blockedButton = screen.getByRole("button", { name: /修正 continuity blocker/ });
    expect(blockedButton).toBeDisabled();
    fireEvent.click(queueButtons[0]);
    expect(onQueue).toHaveBeenCalledWith([expect.objectContaining({ cutId: "CUT-01", durationSec: 4 })]);
    const exportButton = screen.getByRole("button", { name: /匯出 Segment Manifest/ });
    expect(exportButton).toBeDisabled();
    fireEvent.click(exportButton);
    expect(onExportManifest).not.toHaveBeenCalled();
  });

  it("exports a manifest when every Cut passes continuity", () => {
    const onExportManifest = vi.fn();
    const validStoryboard: StoryboardDocument = { ...storyboard, episodes: [{ ...storyboard.episodes[0], segments: [{ ...storyboard.episodes[0].segments[0], cuts: [storyboard.episodes[0].segments[0].cuts[0]] }] }] };
    render(<StoryboardDirectorView storyboard={validStoryboard} script={{ source: "loaded-script" }} projectId="project-1" sourceDocumentVersion={3} videoModel="Veo 3.1 - Fast" aspectRatio="16:9" onQueue={vi.fn()} onExportManifest={onExportManifest} />);
    const exportButton = screen.getByRole("button", { name: /匯出 Segment Manifest/ });
    expect(exportButton).not.toBeDisabled();
    fireEvent.click(exportButton);
    expect(onExportManifest).toHaveBeenCalledWith(expect.objectContaining({ id: "SEG-01", totalDurationSec: 4, status: "planned" }));
  });
});
