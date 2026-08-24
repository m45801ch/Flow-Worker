export type ExtractedFrame = { blob: Blob; width: number; height: number; capturedAt: string };

function waitForSeek(video: HTMLVideoElement, target: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    const fail = () => { if (!settled) { settled = true; reject(new Error("Unable to seek video for last-frame capture")); } };
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("error", fail, { once: true });
    try { video.currentTime = target; } catch { fail(); }
    if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.001) finish();
  });
}

export async function extractLastFrame(video: HTMLVideoElement): Promise<ExtractedFrame> {
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("Video duration is required for last-frame capture");
  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  if (!width || !height) throw new Error("Video dimensions are required for last-frame capture");
  await waitForSeek(video, Math.max(0, video.duration - 0.1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.drawImage(video, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to encode last frame as PNG")), "image/png"));
  return { blob, width, height, capturedAt: new Date().toISOString() };
}
