import type { JudgingMode } from "./types.js";

export const JUDGES = [
  { key: "judge1", suffix: "1", label: "何老師" },
  { key: "judge2", suffix: "2", label: "鄧老師" },
  { key: "judge3", suffix: "3", label: "SHA老師" }
] as const;

export const FINAL_CRITERIA = [
  { key: "aesthetic", label: "美感", fieldPrefix: "決評美感" },
  { key: "story", label: "故事", fieldPrefix: "決評故事" },
  { key: "creativity", label: "創意", fieldPrefix: "決評創意" }
] as const;

export type ScoreRound = "initial" | "secondary" | "final";

export const SCORE_ROUNDS = ["initial", "secondary", "final"] as const;

export const ROUND_FIELDS: Record<ScoreRound, readonly string[]> = {
  initial: ["初評"],
  secondary: fieldsForJudgeCount("secondary", JUDGES.length),
  final: FINAL_CRITERIA.flatMap((criterion) => fieldsForJudgeCount("final", JUDGES.length, criterion.key))
};

export function isScoreRound(value: string): value is ScoreRound {
  return SCORE_ROUNDS.includes(value as ScoreRound);
}

export function modeLabel(mode: JudgingMode): string {
  if (mode === "initial") return "初評";
  if (mode === "secondary") return "複評";
  return "決評";
}

export function roundForScoreField(field: string): ScoreRound | null {
  if (field === "初評") return "initial";
  if (/^複評([1-9]\d*)$/.test(field)) return "secondary";
  if (/^決評(美感|故事|創意)([1-9]\d*)$/.test(field)) return "final";
  return null;
}

export function defaultFieldForRound(round: ScoreRound): string {
  return ROUND_FIELDS[round][0];
}

export function scoreRangeForField(field: string): { min: number; max: number } | null {
  if (field === "初評") return { min: 0, max: 3 };
  if (/^複評([1-9]\d*)$/.test(field)) return { min: 3, max: 5 };
  if (/^決評(美感|故事|創意)([1-9]\d*)$/.test(field)) return { min: 3, max: 5 };
  return null;
}

export function validateScore(field: string, value: number, round = roundForScoreField(field)): boolean {
  const range = scoreRangeForField(field);
  return !!range && !!round && Number.isInteger(value) && value >= range.min && value <= range.max;
}

export function scoreLabel(field: string): { label: string; judgeLabel: string; mode: JudgingMode } {
  if (field === "初評") return { label: "初評", judgeLabel: JUDGES[0].label, mode: "initial" };
  const secondary = field.match(/^複評([1-9]\d*)$/);
  if (secondary) {
    const judge = JUDGES[judgeIndexFromSuffix(secondary[1])];
    return { label: "複評", judgeLabel: judge?.label ?? `評審${secondary[1]}`, mode: "secondary" };
  }
  const final = field.match(/^決評(美感|故事|創意)([1-9]\d*)$/);
  if (final) {
    const judge = JUDGES[judgeIndexFromSuffix(final[2])];
    return { label: final[1], judgeLabel: judge?.label ?? `評審${final[2]}`, mode: "final" };
  }
  return { label: field, judgeLabel: field, mode: "initial" };
}

export function fieldsForMode(mode: JudgingMode, criterionKey?: string, judgeCount: number = JUDGES.length): string[] {
  if (mode === "initial") return ["初評"];
  if (mode === "secondary") return fieldsForJudgeCount("secondary", judgeCount);
  const criterion = FINAL_CRITERIA.find((c) => c.key === criterionKey) ?? FINAL_CRITERIA[0];
  return fieldsForJudgeCount("final", judgeCount, criterion.key);
}

export function judgeFieldSuffix(index: number): string {
  return JUDGES[index]?.suffix ?? String(index + 1);
}

function fieldsForJudgeCount(mode: "secondary" | "final", judgeCount: number, criterionKey?: string): string[] {
  const count = Math.max(1, Math.floor(judgeCount));
  const suffixes = Array.from({ length: count }, (_value, index) => judgeFieldSuffix(index));
  if (mode === "secondary") return suffixes.map((suffix) => `複評${suffix}`);
  const criterion = FINAL_CRITERIA.find((c) => c.key === criterionKey) ?? FINAL_CRITERIA[0];
  return suffixes.map((suffix) => `${criterion.fieldPrefix}${suffix}`);
}

function judgeIndexFromSuffix(suffix: string): number {
  const numeric = Number(suffix);
  return Number.isInteger(numeric) && numeric > 0 ? numeric - 1 : -1;
}
