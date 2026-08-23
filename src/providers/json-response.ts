function balancedCandidates(raw: string) {
  const candidates: string[] = [];
  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== "{" && raw[start] !== "[") continue;
    const opening = raw[start]; const closing = opening === "{" ? "}" : "]";
    let depth = 0; let quoted = false; let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const character = raw[index];
      if (quoted) { if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === '"') quoted = false; continue; }
      if (character === '"') { quoted = true; continue; }
      if (character === opening) depth += 1;
      if (character === closing) { depth -= 1; if (depth === 0) { candidates.push(raw.slice(start, index + 1)); break; } }
    }
  }
  return candidates;
}

export function parseStructuredJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? raw.trim();
  const candidates = [fenced.trim(), ...balancedCandidates(fenced)];
  for (const candidate of candidates) { try { return JSON.parse(candidate) as T; } catch { /* try the next balanced candidate */ } }
  throw new Error("Provider did not return valid structured JSON");
}
