const sensitiveNames = new Set(["apikey", "authorization", "token", "secret", "password", "access_token", "refreshtoken"]);
const omittedNames = new Set(["apikey", "authorization", "token", "secret", "password", "access_token", "refreshtoken", "dataurl", "rawresponse", "rawproviderresponse"]);

const keyName = (key: string) => key.toLowerCase().replace(/[\s_-]/g, "");
const isDataUrl = (value: unknown): boolean => typeof value === "string" && /^data:[^,]+,/i.test(value);

function walk(value: unknown, omitSensitive: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, omitSensitive));
  if (!value || typeof value !== "object") return isDataUrl(value) ? "[REDACTED]" : value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = keyName(key);
    if (omitSensitive && omittedNames.has(normalized)) continue;
    if (!omitSensitive && sensitiveNames.has(normalized)) { output[key] = "[REDACTED]"; continue; }
    const next = walk(item, omitSensitive);
    if (omitSensitive && isDataUrl(next)) continue;
    output[key] = next;
  }
  return output;
}

export function redactSecrets<T>(value: T): T {
  return walk(value, false) as T;
}

export function safeJson<T>(value: T): T {
  return walk(value, true) as T;
}
