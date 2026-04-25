export const SCORE_MIN = 0;
export const SCORE_MAX = 10;
export const SCORE_STEP = 0.5;

export const SCORE_CATEGORIES = [
  {
    key: "impact",
    label: "Impact",
    description: "Immediate visual impression and emotional pull.",
    weight: 0.35
  },
  {
    key: "technical",
    label: "Technical",
    description: "Focus, exposure, color, processing, and presentation quality.",
    weight: 0.25
  },
  {
    key: "composition",
    label: "Composition",
    description: "Framing, balance, timing, and visual organization.",
    weight: 0.25
  },
  {
    key: "story",
    label: "Story",
    description: "Subject clarity, originality, and narrative strength.",
    weight: 0.15
  }
] as const;

export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];
export type ScoreCategoryKey = ScoreCategory["key"];

export type ScoreBreakdown = Record<ScoreCategoryKey, number>;

export const SCORE_CATEGORY_KEYS = SCORE_CATEGORIES.map((category) => category.key);

export function isScoreCategoryKey(value: string): value is ScoreCategoryKey {
  return SCORE_CATEGORY_KEYS.includes(value as ScoreCategoryKey);
}

export function roundScore(value: number): number {
  return Math.round(value / SCORE_STEP) * SCORE_STEP;
}

export function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Score must be a finite number.");
  }

  const rounded = roundScore(value);
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, rounded));
}

export function calculateWeightedScore(scores: ScoreBreakdown): number {
  const total = SCORE_CATEGORIES.reduce((sum, category) => {
    return sum + normalizeScore(scores[category.key]) * category.weight;
  }, 0);

  return Number(total.toFixed(2));
}

export function emptyScoreBreakdown(value = SCORE_MIN): ScoreBreakdown {
  return SCORE_CATEGORY_KEYS.reduce((scores, key) => {
    scores[key] = normalizeScore(value);
    return scores;
  }, {} as ScoreBreakdown);
}

export function assertScoreBreakdown(value: Partial<Record<string, number>>): ScoreBreakdown {
  const scores = emptyScoreBreakdown();

  for (const key of SCORE_CATEGORY_KEYS) {
    const raw = value[key];
    if (typeof raw !== "number") {
      throw new Error(`Missing numeric score for ${key}.`);
    }
    scores[key] = normalizeScore(raw);
  }

  return scores;
}

export type ScoreRound = "initial" | "secondary" | "final";

export const SCORE_ROUNDS = ["initial", "secondary", "final"] as const;

export const ROUND_FIELDS: Record<ScoreRound, readonly string[]> = {
  initial: ["初評"],
  secondary: ["複評一", "複評二", "複評三"],
  final: ["決評總分"]
};

export const ROUND_SCORE_LIMITS: Record<ScoreRound, { min: number; max: number; step: number }> = {
  initial: { min: 0, max: 3, step: 1 },
  secondary: { min: 0, max: 100, step: 1 },
  final: { min: 0, max: 100, step: 1 }
};

export function isScoreRound(value: string): value is ScoreRound {
  return SCORE_ROUNDS.includes(value as ScoreRound);
}

export function roundForScoreField(field: string): ScoreRound | null {
  if ((ROUND_FIELDS.initial as readonly string[]).includes(field)) return "initial";
  if ((ROUND_FIELDS.secondary as readonly string[]).includes(field)) return "secondary";
  if ((ROUND_FIELDS.final as readonly string[]).includes(field)) return "final";
  return null;
}

export function defaultFieldForRound(round: ScoreRound): string {
  return ROUND_FIELDS[round][0];
}

export function validateScore(field: string, value: number, round = roundForScoreField(field)): boolean {
  if (!round || !Number.isFinite(value)) return false;
  if (!(ROUND_FIELDS[round] as readonly string[]).includes(field)) return false;
  const limits = ROUND_SCORE_LIMITS[round];
  if (value < limits.min || value > limits.max) return false;
  return Math.abs(value / limits.step - Math.round(value / limits.step)) < Number.EPSILON;
}

export function scoreLabel(field: string): { label: string; judgeLabel: string } {
  const round = roundForScoreField(field);
  const judgeLabel = field.replace(/^複評/, "評審");
  return {
    label: round === "initial" ? "初評" : round === "secondary" ? "複評" : round === "final" ? "決評" : field,
    judgeLabel
  };
}
