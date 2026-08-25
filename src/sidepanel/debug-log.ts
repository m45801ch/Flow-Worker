import { safeJson } from "../security/redaction";

export type DebugLogEntry = { id: string; time: string; level: "info" | "error"; stage: string; message: string; details?: Record<string, unknown> };
export type DebugLogMode = "important" | "verbose";
const storageKey = "flow-companion-debug-log";
const modeStorageKey = "flow-companion-debug-mode";
const maxLogEntries = 300;
let memoryLogs: DebugLogEntry[] = [];
let memoryLogMode: DebugLogMode = "important";

const importantMessagePattern = /error|failed|failure|retry|重試|錯誤|失敗|未確認|找不到|not found|not detected|ignored|starting batch|batch finished|submitted|submit|acknowledgement|accepted|already submitted|re-entering|item result|result reported|generated|生成|建立|送出|停止|stopped|completed|image model set|aspect set|outputs set|mode|模式/i;

export function getDebugLogMode(): DebugLogMode {
  try {
    const stored = localStorage.getItem(modeStorageKey);
    if (stored === "important" || stored === "verbose") memoryLogMode = stored;
  } catch { /* use memory fallback */ }
  return memoryLogMode;
}

function isImportantLog(level: DebugLogEntry["level"], message: string) {
  return level === "error" || importantMessagePattern.test(message);
}

function compactLogs(logs: DebugLogEntry[], mode = getDebugLogMode()) {
  const selected = mode === "verbose" ? logs : logs.filter((entry) => isImportantLog(entry.level, entry.message));
  return selected.slice(-maxLogEntries);
}

export function setDebugLogMode(mode: DebugLogMode) {
  memoryLogMode = mode;
  try { localStorage.setItem(modeStorageKey, mode); } catch { /* use memory fallback */ }
  const compacted = compactLogs(readDebugLogs(), mode);
  memoryLogs = compacted;
  try { localStorage.setItem(storageKey, JSON.stringify(compacted)); } catch { /* use memory fallback */ }
  try { window.dispatchEvent(new Event("flow-companion-debug-mode")); } catch { /* diagnostics must never break generation */ }
}

export function readDebugLogs(): DebugLogEntry[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) as DebugLogEntry[] : memoryLogs;
    const normalized = Array.isArray(parsed) ? parsed : [];
    memoryLogs = compactLogs(normalized);
    return memoryLogs;
  } catch { return memoryLogs; }
}

export function recordDebugLog(level: DebugLogEntry["level"], stage: string, message: string, details?: Record<string, unknown>) {
  if (level === "info" && getDebugLogMode() === "important" && !isImportantLog(level, message)) return null;
  const entry: DebugLogEntry = { id: crypto.randomUUID(), time: new Date().toISOString(), level, stage, message, details: details ? safeJson(details) : undefined };
  const next = compactLogs([...readDebugLogs(), entry]);
  memoryLogs = next;
  try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* use memory fallback */ }
  try { window.dispatchEvent(new CustomEvent("flow-companion-debug", { detail: entry })); } catch { /* diagnostics must never break generation */ }
  if (level === "error") console.error(`[Flow Companion][${stage}] ${message}`, entry.details ?? ""); else console.info(`[Flow Companion][${stage}] ${message}`, entry.details ?? "");
  return entry;
}

export function clearDebugLogs() { memoryLogs = []; try { localStorage.removeItem(storageKey); } catch { /* ignore */ } try { window.dispatchEvent(new Event("flow-companion-debug-clear")); } catch { /* ignore */ } }

export const DEBUG_LOG_MAX_ENTRIES = maxLogEntries;
export const isImportantDebugLog = isImportantLog;
