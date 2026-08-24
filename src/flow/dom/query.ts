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
export const readElementValue = (element: Element | null): string => {
  if (element instanceof HTMLSelectElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return String(element.value);
  return element?.textContent?.trim() || "";
};
export const dispatchValueEvents = (element: Element) => { element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); };
