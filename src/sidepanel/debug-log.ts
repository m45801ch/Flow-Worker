import { safeJson } from "../security/redaction";

export type DebugLogEntry = { id: string; time: string; level: "info" | "error"; stage: string; message: string; details?: Record<string, unknown> };
const storageKey = "flow-companion-debug-log";
let memoryLogs: DebugLogEntry[] = [];

export function readDebugLogs(): DebugLogEntry[] {
  try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) as DebugLogEntry[] : memoryLogs; } catch { return memoryLogs; }
}
export function recordDebugLog(level: DebugLogEntry["level"], stage: string, message: string, details?: Record<string, unknown>) {
  const entry: DebugLogEntry = { id: crypto.randomUUID(), time: new Date().toISOString(), level, stage, message, details: details ? safeJson(details) : undefined };
  const next = [...readDebugLogs(), entry].slice(-100);
  memoryLogs = next;
  try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* use memory fallback */ }
  try { window.dispatchEvent(new CustomEvent("flow-companion-debug", { detail: entry })); } catch { /* diagnostics must never break generation */ }
  if (level === "error") console.error(`[Flow Companion][${stage}] ${message}`, entry.details ?? ""); else console.info(`[Flow Companion][${stage}] ${message}`, entry.details ?? "");
  return entry;
}
export function clearDebugLogs() { memoryLogs = []; try { localStorage.removeItem(storageKey); } catch { /* ignore */ } try { window.dispatchEvent(new Event("flow-companion-debug-clear")); } catch { /* ignore */ } }
