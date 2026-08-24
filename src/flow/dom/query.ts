export type FlowRoot = Document | Element;
export type QueryMatch = { element: HTMLElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null; candidates: string[] };

const roleSelector = (role: string) => `[data-flow-role="${role}"]`;

export function queryFlowElement(root: FlowRoot, role: string, labels: string[] = []): QueryMatch {
  const direct = root.querySelector<HTMLElement>(roleSelector(role));
  if (direct) return { element: direct, candidates: [] };
  const candidates = labels.flatMap((label) => Array.from(root.querySelectorAll<HTMLElement>("[aria-label]")).filter((element) => element.getAttribute("aria-label") === label));
  if (candidates.length === 1) return { element: candidates[0], candidates: [] };
  return { element: null, candidates: candidates.map((element) => element.getAttribute("aria-label") || element.textContent?.trim() || "unknown") };
}

export const optionValues = (element: HTMLSelectElement | null): string[] => element ? Array.from(element.options).map((option) => option.value || option.textContent?.trim() || "").filter(Boolean) : [];
export const optionLabels = (element: HTMLSelectElement | null): string[] => element ? Array.from(element.options).map((option) => option.textContent?.replace(/\s+/g, " ").trim() || option.value || "").filter(Boolean) : [];
export const canonicalOptionLabel = (value: string): string => value.normalize("NFKC").replace(/^[^\p{L}\p{N}]*/u, "").replace(/\s+/g, " ").trim();
export const optionNames = (element: HTMLSelectElement | null): string[] => optionLabels(element).map(canonicalOptionLabel);
export const normalizeOptionLabel = (value: string): string => canonicalOptionLabel(value).toLowerCase();
export const findOptionIndex = (element: HTMLSelectElement, expected: string): number => {
  const normalizedExpected = normalizeOptionLabel(expected);
  return Array.from(element.options).findIndex((option) => option.value === expected || normalizeOptionLabel(option.value) === normalizedExpected || normalizeOptionLabel(option.textContent || "") === normalizedExpected);
};
export const readElementValue = (element: Element | null): string => {
  if (element instanceof HTMLSelectElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return String(element.value);
  return element?.textContent?.trim() || "";
};
export const dispatchValueEvents = (element: Element) => { element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); };
