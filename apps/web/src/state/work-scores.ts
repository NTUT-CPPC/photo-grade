import { useEffect, useState } from "react";
import { scoreLabel } from "@photo-grade/shared";
import { getScoresForWork } from "../api/client";
import { onScoreNotification } from "../api/socket";
import type { Judge, Mode, ScoreNotification, WorkScoreRow } from "../types";

export type JudgeRow = {
  judgeLabel: string;
  entries: Array<{ field: string; criterionLabel: string; value: number }>;
};

export const FINAL_CRITERIA_ORDER = ["美感", "故事", "創意"] as const;

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

export function summarizeRows(rows: WorkScoreRow[], mode: Mode, judges: Judge[] | null): JudgeRow[] {
  const filtered = rows.filter((row) => modeForRow(row) === mode);
  if (!filtered.length) return [];

  const buckets = new Map<number, JudgeRow>();
  const fallback: JudgeRow[] = [];

  for (const row of filtered) {
    const meta = scoreLabel(row.field);
    const idx = judgeIndexForField(row.field);
    const label = judgeNameAt(idx, judges) ?? meta.judgeLabel;
    if (idx < 0) {
      fallback.push({
        judgeLabel: label,
        entries: [{ field: row.field, criterionLabel: meta.label, value: row.value }]
      });
      continue;
    }
    let bucket = buckets.get(idx);
    if (!bucket) {
      bucket = { judgeLabel: label, entries: [] };
      buckets.set(idx, bucket);
    }
    bucket.entries.push({ field: row.field, criterionLabel: meta.label, value: row.value });
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
