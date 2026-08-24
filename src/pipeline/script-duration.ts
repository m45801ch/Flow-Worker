export type NormalizedScriptBeat = {
  id: string;
  action: string;
  dialogue: string;
  durationSec: 4 | 6 | 8;
};

const nativeDurations = [4, 6, 8] as const;

type RawBeat = {
  id?: unknown;
  action?: unknown;
  description?: unknown;
  text?: unknown;
  visual?: unknown;
  speaker?: unknown;
  line?: unknown;
  dialogue?: unknown;
  lines?: unknown;
  durationSec?: unknown;
  duration?: unknown;
};

const asText = (value: unknown): string => typeof value === "string" ? value.trim() : "";

function splitTextEvenly(value: string, count: number): string[] {
  if (count <= 1) return [value];
  const characters = Array.from(value);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.round(index * characters.length / count);
    const end = Math.round((index + 1) * characters.length / count);
    return characters.slice(start, end).join("").trim();
  }).filter(Boolean);
}

function nativePlan(totalSeconds: number): Array<4 | 6 | 8> {
  const total = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 4;
  const maxSum = Math.max(8, total + 8);
  const plans: Array<Array<4 | 6 | 8> | undefined> = Array.from({ length: maxSum + 1 });
  plans[0] = [];
  for (let sum = 0; sum <= maxSum; sum += 1) {
    const plan = plans[sum];
    if (!plan) continue;
    for (const duration of nativeDurations) {
      const nextSum = sum + duration;
      if (nextSum > maxSum) continue;
      const candidate = [...plan, duration];
      if (!plans[nextSum] || candidate.length < plans[nextSum]!.length) plans[nextSum] = candidate;
    }
  }
  let bestSum = 4;
  let bestPlan = plans[4] || [4];
  for (let sum = 4; sum <= maxSum; sum += 1) {
    const plan = plans[sum];
    if (!plan) continue;
    const bestScore = [Math.abs(bestSum - total), bestSum > total ? 1 : 0, bestPlan.length];
    const score = [Math.abs(sum - total), sum > total ? 1 : 0, plan.length];
    if (score[0] < bestScore[0] || (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])))) {
      bestSum = sum;
      bestPlan = plan;
    }
  }
  return bestPlan.slice().sort((a, b) => b - a);
}

export function normalizeScriptBeats(rawBeats: unknown[], idPrefix: string, maxDurationSec = Number.POSITIVE_INFINITY): NormalizedScriptBeat[] {
  const normalized: NormalizedScriptBeat[] = [];
  let remainingDurationSec = Number.isFinite(maxDurationSec) && maxDurationSec > 0 ? Math.floor(maxDurationSec) : Number.POSITIVE_INFINITY;
  rawBeats.forEach((value, index) => {
    const beat = (value && typeof value === "object" ? value : {}) as RawBeat;
    const action = asText(beat.action ?? beat.description ?? beat.text ?? beat.visual);
    const nestedDialogue = beat.dialogue && typeof beat.dialogue === "object" ? beat.dialogue as Record<string, unknown> : {};
    const speaker = asText(beat.speaker ?? nestedDialogue.speaker);
    const line = asText(beat.line ?? nestedDialogue.line);
    const rawDialogue = line ? `${speaker}：${line}` : asText(beat.dialogue) || asText(beat.lines) || asText(nestedDialogue.text);
    if (!action && !rawDialogue) return;
    const id = asText(beat.id) || `${idPrefix}-${index + 1}`;
    const requestedDurationSec = Number(beat.durationSec ?? beat.duration);
    const plan = nativePlan(Math.min(requestedDurationSec, remainingDurationSec));
    const dialogueParts = rawDialogue ? splitTextEvenly(rawDialogue, plan.length) : [];
    plan.forEach((durationSec, splitIndex) => {
      if (remainingDurationSec < durationSec) return;
      normalized.push({
        id: splitIndex === 0 ? id : `${id}-${splitIndex + 1}`,
        action: action ? splitIndex === 0 ? action : `${action}（延續動作，完成上一鏡未完內容）` : "",
        dialogue: rawDialogue ? dialogueParts[splitIndex] || rawDialogue : "",
        durationSec,
      });
      remainingDurationSec -= durationSec;
    });
  });
  return normalized;
}
