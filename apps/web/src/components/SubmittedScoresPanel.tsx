import { useState } from "react";
import { useJudges } from "../state/judges";
import { modeLabel } from "../state/gallery";
import { summarizeForMode, useWorkScores, type CompactSummary } from "../state/work-scores";
import type { Mode } from "../types";
import { ScoreDetailDialog } from "./ScoreDetailDialog";

type Props = {
  base?: string;
  mode: Mode;
};

export function SubmittedScoresPanel({ base, mode }: Props) {
  const { rows } = useWorkScores(base);
  const judges = useJudges();
  const [open, setOpen] = useState(false);

  const summary = summarizeForMode(rows, mode);
  const empty = summary.kind === "empty";
  const className = `mode-banner mode-banner--scores submitted-scores${
    empty ? " submitted-scores--empty" : ""
  }`;
  const label = modeLabel(mode);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          if (!empty) setOpen(true);
        }}
        disabled={empty}
        aria-label={empty ? `${label}（尚無分數）` : `${label}：顯示完整評分`}
        aria-live="polite"
      >
        <span className="submitted-scores__mode">{label}</span>
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
        <span className="submitted-scores__value">{summary.value}</span>
      </span>
    );
  }
  if (summary.kind === "list") {
    return (
      <span className="submitted-scores__chip">
        <span className="submitted-scores__value">
          {summary.values.map((value, idx) => (
            <span key={`${summary.modeLabel}-${idx}-${value}`}>
              {value}
              {idx < summary.values.length - 1 ? <span className="submitted-scores__sep">/</span> : null}
            </span>
          ))}
        </span>
      </span>
    );
  }
  return (
    <>
      {summary.entries.map((entry) => (
        <span className="submitted-scores__chip" key={entry.label}>
          <span className="submitted-scores__sublabel">{entry.label}</span>
          <span className="submitted-scores__value">{entry.value}</span>
        </span>
      ))}
    </>
  );
}
