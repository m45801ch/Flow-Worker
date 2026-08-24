import type { FlowRoot } from "../dom/query";

export type MediaBaseline = Set<string>;

function mediaKey(element: HTMLMediaElement | HTMLImageElement): string {
  return element.dataset.flowMedia || (element instanceof HTMLVideoElement ? element.currentSrc || element.src : element.currentSrc || element.src) || element.outerHTML;
}

export function captureMediaBaseline(root: FlowRoot = document): MediaBaseline {
  return new Set(Array.from(root.querySelectorAll<HTMLVideoElement | HTMLImageElement>("video, img")).map(mediaKey));
}

export function findNewMedia(root: FlowRoot = document, baseline: MediaBaseline): Array<HTMLVideoElement | HTMLImageElement> {
  return Array.from(root.querySelectorAll<HTMLVideoElement | HTMLImageElement>("video, img")).filter((element) => !baseline.has(mediaKey(element)));
}
