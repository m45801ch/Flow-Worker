import type { AssetKind, AssetCandidate } from "./types";

export const createAssetId = (kind: AssetKind, name: string, version = 1) => {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "_").replace(/^_|_$/g, "") || "unnamed";
  return `${kind}.${slug}.v${version}`;
};

export function resolveAssetReference(text: string, candidates: AssetCandidate[]) {
  const matched = candidates.filter((candidate) => [candidate.name, ...candidate.aliases].some((label) => text.includes(label)));
  const grouped = new Map<string, AssetCandidate[]>();
  for (const item of matched) {
    const key = item.name;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const ambiguous = [...grouped.values()].find((items) => items.length > 1);
  if (ambiguous) return { kind: "ambiguous" as const, candidates: ambiguous.map((item) => item.id) };
  return matched.length === 1 ? { kind: "resolved" as const, id: matched[0].id } : { kind: "unresolved" as const, candidates: matched.map((item) => item.id) };
}
