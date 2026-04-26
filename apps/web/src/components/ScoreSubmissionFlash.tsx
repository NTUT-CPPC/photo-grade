import { useEffect, useRef, useState } from "react";
import { scoreLabel, modeLabel } from "@photo-grade/shared";
import { getJudges } from "../api/client";
import { onScoreNotification } from "../api/socket";
import { judgeIndexForField } from "../state/work-scores";
import type { Judge, Mode, ScoreNotification } from "../types";

type FlashPayload = ScoreNotification & {
  workCode?: string;
  scores?: ScoreNotification["scores"] | Array<{ field: string; value: number; label?: string; judgeLabel?: string }>;
  submittedAt?: string;
};

type FlashEntry = {
  judgeLabel: string;
  criterionLabel: string;
  value: number;
  judgeIndex: number;
};

type Flash = {
  key: string;
  mode: Mode | null;
  entries: FlashEntry[];
};

type Props = {
  base?: string;
};

export function ScoreSubmissionFlash({ base }: Props) {
  const [flash, setFlash] = useState<Flash | null>(null);
  const [visible, setVisible] = useState(false);
  const [judges, setJudges] = useState<Judge[] | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    getJudges()
      .then((list) => {
        if (live) setJudges(list);
      })
      .catch(() => {
        if (live) setJudges([]);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!base) return;
    return onScoreNotification((notification: FlashPayload) => {
      const matches = notification.workCode === base || notification.base === base;
      if (!matches) return;
      const next = buildFlash(notification, judges);
      if (!next) return;
      setFlash(next);
      setVisible(true);
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setVisible(false);
        timer.current = window.setTimeout(() => {
          setFlash(null);
          timer.current = null;
        }, 320);
      }, 2000);
    });
  }, [base, judges]);

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  if (!flash) return null;

  return (
    <div className={`score-flash${visible ? " show" : ""}`} role="status" aria-live="polite">
      <div className="score-flash__title">
        {flash.mode ? `${modeLabel(flash.mode)} 已送出` : "已送出"}
      </div>
      <div className="score-flash__grid">
        {flash.entries.map((entry, idx) => (
          <div className="score-flash__row" key={`${entry.judgeLabel}-${entry.criterionLabel}-${idx}`}>
            <span className="score-flash__judge">{entry.judgeLabel}</span>
            {entry.criterionLabel && entry.criterionLabel !== modeLabelOrEmpty(flash.mode) ? (
              <span className="score-flash__criterion">{entry.criterionLabel}</span>
            ) : null}
            <span className="score-flash__value">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildFlash(payload: FlashPayload, judges: Judge[] | null): Flash | null {
  const entries: FlashEntry[] = [];
  let detectedMode: Mode | null = (payload.mode as Mode | undefined) ?? null;

  if (Array.isArray(payload.scores)) {
    for (const item of payload.scores) {
      if (!item || typeof item.field !== "string" || typeof item.value !== "number") continue;
      const meta = scoreLabel(item.field);
      const idx = judgeIndexForField(item.field);
      const label = judgeNameAt(idx, judges) ?? item.judgeLabel ?? meta.judgeLabel;
      entries.push({
        judgeLabel: label,
        criterionLabel: item.label ?? meta.label,
        value: item.value,
        judgeIndex: idx
      });
      detectedMode = detectedMode ?? meta.mode;
    }
  } else if (payload.scores && typeof payload.scores === "object") {
    for (const [field, raw] of Object.entries(payload.scores)) {
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const meta = scoreLabel(field);
      const idx = judgeIndexForField(field);
      const label = judgeNameAt(idx, judges) ?? meta.judgeLabel;
      entries.push({
        judgeLabel: label,
        criterionLabel: meta.label,
        value,
        judgeIndex: idx
      });
      detectedMode = detectedMode ?? meta.mode;
    }
  }

  if (!entries.length) return null;
  entries.sort((a, b) => {
    if (a.judgeIndex !== b.judgeIndex) return a.judgeIndex - b.judgeIndex;
    return 0;
  });

  return {
    key: payload.submittedAt ?? payload.at ?? new Date().toISOString(),
    mode: detectedMode,
    entries
  };
}

function judgeNameAt(index: number, judges: Judge[] | null): string | null {
  if (index < 0 || !judges) return null;
  const name = judges[index]?.name?.trim();
  return name ? name : null;
}

function modeLabelOrEmpty(mode: Mode | null): string {
  if (!mode) return "";
  if (mode === "initial") return "初評";
  if (mode === "secondary") return "複評";
  return "決評";
}
