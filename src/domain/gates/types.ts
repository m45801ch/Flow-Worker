export type GateSeverity = "blocker" | "warning";

export type GateIssue = {
  code: string;
  message: string;
  path?: string;
  severity: GateSeverity;
};

export type GateReport = {
  passed: boolean;
  blockers: GateIssue[];
  warnings: GateIssue[];
  metrics: Record<string, number | string | boolean>;
};

export const report = (
  blockers: GateIssue[] = [],
  warnings: GateIssue[] = [],
  metrics: Record<string, number | string | boolean> = {}
): GateReport => ({
  passed: blockers.length === 0,
  blockers,
  warnings,
  metrics
});

export const blocker = (code: string, message: string, path?: string): GateIssue => ({ code, message, path, severity: "blocker" });
export const warning = (code: string, message: string, path?: string): GateIssue => ({ code, message, path, severity: "warning" });

export const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
export const ids = (items: unknown[]): string[] => items.map((item) => text(asRecord(item).id)).filter(Boolean);

export function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
