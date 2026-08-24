import { describe, expect, it, vi } from "vitest";
import { extractLastFrame } from "./frame-extractor";

describe("extractLastFrame", () => {
  it("seeks to the final 0.1 seconds and returns a PNG blob", async () => {
    const video = { duration: 10, videoWidth: 1280, videoHeight: 720, currentTime: 0, readyState: 4, addEventListener: vi.fn((event: string, callback: () => void) => { if (event === "seeked") callback(); }) } as unknown as HTMLVideoElement;
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    vi.spyOn(document, "createElement").mockReturnValueOnce(canvas);
    vi.spyOn(canvas, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    const result = await extractLastFrame(video);
    expect(video.currentTime).toBeCloseTo(9.9, 1);
    expect(result.blob.type).toBe("image/png");
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
  });
});
