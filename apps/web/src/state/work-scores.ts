import { useEffect, useState } from "react";
import { scoreLabel } from "@photo-grade/shared";
import { getScoresForWork } from "../api/client";
import { onScoreNotification } from "../api/socket";
import type { Judge, Mode, ScoreNotification, WorkScoreRow } from "../types";

export type JudgeRow = {
  judgeLabel: string;
  judgeIndex: number;
  entries: Array<{ field: string; criterionLabel: string; value: number }>;
};

export type CompactSummary =
  | { kind: "empty" }
  | { kind: "value"; modeLabel: string; value: number }
  | { kind: "criteria"; modeLabel: string; entries: Array<{ label: string; value: number }> };

export const FINAL_CRITERIA_ORDER = ["美感", "故事", "創意"] as const;
export const FINAL_CRITERIA_SHORT: Record<string, string> = { 美感: "美", 故事: "事", 創意: "創" };

export function useWorkScores(base: string | undefined): {
  rows: WorkScoreRow[];
  loading: boolean;
} {
  const [rows, setRows] = useState<WorkScoreRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!base) {
      setRows([]);
      return;
    }
    let live = true;
    setLoading(true);
    getScoresForWork(base)
      .then((next) => {
        if (live) setRows(next);
      })
      .catch(() => {
        if (live) setRows([]);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [base]);

  useEffect(() => {
    if (!base) return;
    return onScoreNotification((notification: ScoreNotification & { workCode?: string }) => {
      const matches = notification.workCode === base || notification.base === base;
      if (!matches) return;
      getScoresForWork(base)
        .then((next) => setRows(next))
        .catch(() => undefined);
    });
  }, [base]);

  return { rows, loading };
}

export function judgeIndexForField(field: string): number {
  if (field === "初評") return 0;
  const match = field.match(/(一|二|三|[1-9]\d*)$/);
  if (!match) return -1;
  if (match[1] === "一") return 0;
  if (match[1] === "二") return 1;
  if (match[1] === "三") return 2;
  return Number(match[1]) - 1;
}

export function summarizeForMode(rows: WorkScoreRow[], mode: Mode): CompactSummary {
  if (mode === "initial") {
    const value = rows.find((r) => r.field === "初評")?.value;
    if (value == null) return { kind: "empty" };
    return { kind: "value", modeLabel: "初評", value };
  }

  if (mode === "secondary") {
    const submitted = rows.filter((r) => r.round === "secondary");
    if (!submitted.length) return { kind: "empty" };
    const total = submitted.reduce((sum, r) => sum + r.value, 0);
    return { kind: "value", modeLabel: "複評", value: total };
  }

  const entries: Array<{ label: string; value: number }> = [];
  for (const criterion of FINAL_CRITERIA_ORDER) {
    const matched = rows.filter((r) => r.round === "final" && r.field.startsWith(`決評${criterion}`));
    if (!matched.length) continue;
    const sum = matched.reduce((acc, r) => acc + r.value, 0);
    entries.push({ label: FINAL_CRITERIA_SHORT[criterion] ?? criterion, value: sum });
  }
  if (!entries.length) return { kind: "empty" };
  return { kind: "criteria", modeLabel: "決評", entries };
}

export function groupByJudge(rows: WorkScoreRow[], mode: Mode, judges: Judge[] | null): JudgeRow[] {
  const filtered = rows.filter((row) => modeForRow(row) === mode);
  if (!filtered.length) return [];

  const buckets = new Map<number, JudgeRow>();
  const fallback: JudgeRow[] = [];

  for (const row of filtered) {
    const meta = scoreLabel(row.field);
    const idx = judgeIndexForField(row.field);
    const label = judgeNameAt(idx, judges) ?? meta.judgeLabel;
    const entry = { field: row.field, criterionLabel: meta.label, value: row.value };
    if (idx < 0) {
      fallback.push({ judgeLabel: label, judgeIndex: -1, entries: [entry] });
      continue;
    }
    let bucket = buckets.get(idx);
    if (!bucket) {
      bucket = { judgeLabel: label, judgeIndex: idx, entries: [] };
      buckets.set(idx, bucket);
    }
    bucket.entries.push(entry);
  }

  for (const bucket of buckets.values()) {
    bucket.entries.sort((a, b) => criterionOrder(a.criterionLabel) - criterionOrder(b.criterionLabel));
  }

  return [...Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([, row]) => row), ...fallback];
}

function modeForRow(row: WorkScoreRow): Mode {
  const meta = scoreLabel(row.field);
  return (meta.mode ?? row.round) as Mode;
}

function judgeNameAt(index: number, judges: Judge[] | null): string | null {
  if (index < 0 || !judges) return null;
  const name = judges[index]?.name?.trim();
  return name ? name : null;
}

function criterionOrder(label: string): number {
  const idx = (FINAL_CRITERIA_ORDER as readonly string[]).indexOf(label);
  return idx < 0 ? 99 : idx;
}
