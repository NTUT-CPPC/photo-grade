import { useEffect, useState } from "react";
import { getJudges } from "../api/client";
import { summarizeForMode, useWorkScores, type CompactSummary } from "../state/work-scores";
import type { Judge, Mode } from "../types";
import { ScoreDetailDialog } from "./ScoreDetailDialog";

type Props = {
  base?: string;
  mode: Mode;
};

export function SubmittedScoresPanel({ base, mode }: Props) {
  const { rows } = useWorkScores(base);
  const [judges, setJudges] = useState<Judge[] | null>(null);
  const [open, setOpen] = useState(false);

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

  const summary = summarizeForMode(rows, mode);
  const empty = summary.kind === "empty";
  const className = `submitted-scores${empty ? " submitted-scores--empty" : ""}`;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          if (!empty) setOpen(true);
        }}
        disabled={empty}
        aria-label={empty ? "尚無分數" : "顯示完整評分"}
        aria-live="polite"
      >
        {empty ? null : renderSummary(summary)}
      </button>
      {open ? (
        <ScoreDetailDialog
          base={base}
          mode={mode}
          rows={rows}
          judges={judges}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function renderSummary(summary: Exclude<CompactSummary, { kind: "empty" }>) {
  if (summary.kind === "value") {
    return (
      <span className="submitted-scores__chip">
        <span className="submitted-scores__label">{summary.modeLabel}</span>
        <span className="submitted-scores__value">{summary.value}</span>
      </span>
    );
  }
  if (summary.kind === "list") {
    return (
      <>
        <span className="submitted-scores__label">{summary.modeLabel}</span>
        <span className="submitted-scores__value">
          {summary.values.map((value, idx) => (
            <span key={idx}>
              {value}
              {idx < summary.values.length - 1 ? <span className="submitted-scores__sep">/</span> : null}
            </span>
          ))}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="submitted-scores__label">{summary.modeLabel}</span>
      {summary.entries.map((entry) => (
        <span className="submitted-scores__chip" key={entry.label}>
          <span className="submitted-scores__sublabel">{entry.label}</span>
          <span className="submitted-scores__value">{entry.value}</span>
        </span>
      ))}
    </>
  );
}
