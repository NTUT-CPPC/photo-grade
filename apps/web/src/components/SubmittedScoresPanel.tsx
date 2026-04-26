import { summarizeForMode, useWorkScores, type CompactSummary } from "../state/work-scores";
import type { Mode } from "../types";

type Props = {
  base?: string;
  mode: Mode;
};

export function SubmittedScoresPanel({ base, mode }: Props) {
  const { rows } = useWorkScores(base);
  const summary = summarizeForMode(rows, mode);
  const empty = summary.kind === "empty";
  const className = `submitted-scores${empty ? " submitted-scores--empty" : ""}`;

  return (
    <div className={className} aria-live="polite">
      {empty ? null : renderSummary(summary)}
    </div>
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
