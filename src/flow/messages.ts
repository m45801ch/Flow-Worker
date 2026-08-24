import type { FlowJobManifest } from "./jobs/types";

export type FlowMessage =
  | { type: "SCAN_CAPABILITIES" }
  | { type: "CONFIGURE_FLOW"; job: FlowJobManifest }
  | { type: "FILL_PROMPT"; prompt: string }
  | { type: "BIND_ASSETS"; assetIds: string[] }
  | { type: "SUBMIT_FLOW_JOB"; job: FlowJobManifest };

const messageTypes = new Set(["SCAN_CAPABILITIES", "CONFIGURE_FLOW", "FILL_PROMPT", "BIND_ASSETS", "SUBMIT_FLOW_JOB"]);
const sensitiveKeys = new Set(["apiKey", "authorization", "Authorization", "token", "secret", "password"]);

export function isFlowMessage(value: unknown): value is FlowMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (typeof message.type !== "string" || !messageTypes.has(message.type)) return false;
  if (Object.keys(message).some((key) => sensitiveKeys.has(key))) return false;
  if (message.type === "SCAN_CAPABILITIES") return Object.keys(message).length === 1;
  if (message.type === "FILL_PROMPT") return typeof message.prompt === "string";
  if (message.type === "BIND_ASSETS") return Array.isArray(message.assetIds) && message.assetIds.every((id) => typeof id === "string");
  return Boolean(message.job && typeof message.job === "object" && typeof (message.job as Record<string, unknown>).id === "string");
}

export function redactFlowMessage(value: unknown): Partial<FlowMessage> {
  if (!value || typeof value !== "object") return {};
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "SCAN_CAPABILITIES": return { type: "SCAN_CAPABILITIES" };
    case "FILL_PROMPT": return typeof message.prompt === "string" ? { type: "FILL_PROMPT", prompt: message.prompt } : {};
    case "BIND_ASSETS": return Array.isArray(message.assetIds) ? { type: "BIND_ASSETS", assetIds: message.assetIds.filter((id): id is string => typeof id === "string") } : {};
    case "CONFIGURE_FLOW":
    case "SUBMIT_FLOW_JOB": {
      if (!isFlowMessage(message)) return {};
      const candidate = message as Record<string, unknown>;
      return { type: message.type, job: candidate.job as FlowJobManifest };
    }
    default: return {};
  }
}
