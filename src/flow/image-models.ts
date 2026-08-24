export const builtInImageModels = [
  { name: "Nano Banana Pro", label: "🍌 Nano Banana Pro" },
  { name: "Nano Banana 2", label: "🍌 Nano Banana 2" },
  { name: "Nano Banana 2 Lite", label: "🍌 Nano Banana 2 Lite" },
] as const;

export type BuiltInImageModelName = (typeof builtInImageModels)[number]["name"];
