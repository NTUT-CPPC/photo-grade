import { useEffect, useRef, useState } from "react";
import { scoreLabel, modeLabel } from "@photo-grade/shared";
import { onScoreNotification } from "../api/socket";
import { useJudges } from "../state/judges";
import { judgeIndexForField } from "../state/work-scores";
import type { Judge, Mode, ScoreNotification } from "../types";

type FlashPayload = ScoreNotification & {
  workCode?: string;
  scores?: ScoreNotification["scores"] | Array<{ field: string; value: number; label?: string; judgeLabel?: string }>;
  submittedAt?: string;
};

type FlashJudge = {
  judgeLabel: string;
  judgeIndex: number;
  entries: Array<{ criterionLabel: string; value: number }>;
};

type Flash = {
  key: string;
  mode: Mode | null;
  criterion: string | null;
  judges: FlashJudge[];
};

type Props = {
  base?: string;
};

const FADE_MS = 280;
const HOLD_MS = 2000;

export function ScoreSubmissionFlash({ base }: Props) {
  const [flash, setFlash] = useState<Flash | null>(null);
  const [visible, setVisible] = useState(false);
  const judges = useJudges();
  const hideTimer = useRef<number | null>(null);
  const removeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!base || judges === null) return;
    return onScoreNotification((notification: FlashPayload) => {
      const matches = notification.workCode === base || notification.base === base;
      if (!matches) return;
      const next = buildFlash(notification, judges);
      if (!next) return;
      setFlash(next);
      setVisible(true);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
      if (removeTimer.current != null) window.clearTimeout(removeTimer.current);
      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        removeTimer.current = window.setTimeout(() => {
          setFlash(null);
          removeTimer.current = null;
        }, FADE_MS + 40);
      }, HOLD_MS);
    });
  }, [base, judges]);

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
      if (removeTimer.current != null) window.clearTimeout(removeTimer.current);
    };
  }, []);

  if (!flash) return null;

  const title = buildTitle(flash);

  return (
    <div className={`score-flash${visible ? " show" : ""}`} role="status" aria-live="polite">
      <div className="score-flash__title">{title}</div>
      <div className="score-flash__grid">
        {flash.judges.map((judge) => (
          <div className="score-flash__row" key={`${judge.judgeIndex}-${judge.judgeLabel}`}>
            <span className="score-flash__name">{judge.judgeLabel}</span>
            <span className="score-flash__values">{joinValues(judge.entries)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function joinValues(entries: FlashJudge["entries"]): string {
  if (!entries.length) return "–";
  return entries.map((e) => String(e.value)).join(" / ");
}

function buildTitle(flash: Flash): string {
  if (!flash.mode) return "已送出";
  const head = modeLabel(flash.mode);
  if (flash.mode === "final" && flash.criterion) return `${head}・${flash.criterion} 已送出`;
  return `${head} 已送出`;
}

function buildFlash(payload: FlashPayload, judges: Judge[] | null): Flash | null {
  const flat: Array<{ field: string; value: number; criterionLabel: string; judgeLabel: string; judgeIndex: number; mode: Mode }> = [];

  if (Array.isArray(payload.scores)) {
    for (const item of payload.scores) {
      if (!item || typeof item.field !== "string" || typeof item.value !== "number") continue;
      const meta = scoreLabel(item.field);
      const idx = judgeIndexForField(item.field);
      const label = judgeNameAt(idx, judges) ?? item.judgeLabel ?? meta.judgeLabel;
      flat.push({
        field: item.field,
        value: item.value,
        criterionLabel: item.label ?? meta.label,
        judgeLabel: label,
        judgeIndex: idx,
        mode: meta.mode as Mode
      });
    }
  } else if (payload.scores && typeof payload.scores === "object") {
    for (const [field, raw] of Object.entries(payload.scores)) {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const meta = scoreLabel(field);
      const idx = judgeIndexForField(field);
      const label = judgeNameAt(idx, judges) ?? meta.judgeLabel;
      flat.push({
        field,
        value,
        criterionLabel: meta.label,
        judgeLabel: label,
        judgeIndex: idx,
        mode: meta.mode as Mode
      });
    }
  }

  if (!flat.length) return null;

  const detectedMode: Mode | null = (payload.mode as Mode | undefined) ?? flat[0]?.mode ?? null;

  if (detectedMode === "initial") {
    const initialEntry = flat.find((entry) => entry.field === "初評") ?? flat[0];
    return {
      key: payload.submittedAt ?? payload.at ?? new Date().toISOString(),
      mode: "initial",
      criterion: null,
      judges: [
        {
          judgeLabel: "通過評審數",
          judgeIndex: 0,
          entries: [{ criterionLabel: initialEntry.criterionLabel, value: initialEntry.value }]
        }
      ]
    };
  }

  const byJudge = new Map<number, FlashJudge>();
  const fallback: FlashJudge[] = [];
  for (const entry of flat) {
    if (entry.judgeIndex < 0) {
      fallback.push({
        judgeLabel: entry.judgeLabel,
        judgeIndex: -1,
        entries: [{ criterionLabel: entry.criterionLabel, value: entry.value }]
      });
      continue;
    }
    let bucket = byJudge.get(entry.judgeIndex);
    if (!bucket) {
      bucket = { judgeLabel: entry.judgeLabel, judgeIndex: entry.judgeIndex, entries: [] };
      byJudge.set(entry.judgeIndex, bucket);
    }
    bucket.entries.push({ criterionLabel: entry.criterionLabel, value: entry.value });
  }

  const judgeRows = [
    ...Array.from(byJudge.entries()).sort((a, b) => a[0] - b[0]).map(([, row]) => row),
    ...fallback
  ];

  const allCriteria = new Set(flat.map((entry) => entry.criterionLabel));
  const criterion =
    detectedMode === "final" && allCriteria.size === 1 ? flat[0]?.criterionLabel ?? null : null;

  return {
    key: payload.submittedAt ?? payload.at ?? new Date().toISOString(),
    mode: detectedMode,
    criterion,
    judges: judgeRows
  };
}

function judgeNameAt(index: number, judges: Judge[] | null): string | null {
  if (index < 0 || !judges) return null;
  const name = judges[index]?.name?.trim();
  return name ? name : null;
}
