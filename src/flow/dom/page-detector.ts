import type { FlowRoot } from "./query";

export type FlowPageDetection = { isFlowPage: boolean; hostname: string; path: string; reason: string };

export function detectFlowPage(root: FlowRoot = document): FlowPageDetection {
  const locationLike = root.ownerDocument?.location || (root as Document).location || globalThis.location;
  const hostname = locationLike?.hostname || "";
  const path = locationLike?.pathname || "";
  const fixture = root.querySelector('[data-flow-page="project"]') !== null;
  const isLabs = hostname === "labs.google" || hostname.endsWith(".labs.google");
  const isFlowPath = /flow/i.test(path) || fixture;
  return { isFlowPage: (isLabs && isFlowPath) || fixture, hostname, path, reason: fixture ? "fixture" : isLabs && isFlowPath ? "labs.google Flow page" : "not a supported Flow page" };
}
