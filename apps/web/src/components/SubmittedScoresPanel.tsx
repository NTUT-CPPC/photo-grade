import { useEffect, useState } from "react";
import { getJudges } from "../api/client";
import { FINAL_CRITERIA_ORDER, summarizeRows, useWorkScores, type JudgeRow } from "../state/work-scores";
import type { Judge, Mode } from "../types";

type Props = {
  base?: string;
  mode: Mode;
};

export function SubmittedScoresPanel({ base, mode }: Props) {
  const { rows } = useWorkScores(base);
  const [judges, setJudges] = useState<Judge[] | null>(null);

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

  const summary = summarizeRows(rows, mode, judges);
  const empty = summary.length === 0;
  const className = `submitted-scores submitted-scores--${mode}${empty ? " submitted-scores--empty" : ""}`;

  return (
    <div className={className} aria-live="polite">
      {empty ? null : renderSummary(mode, summary)}
    </div>
  );
}

function renderSummary(mode: Mode, summary: JudgeRow[]) {
  if (mode === "initial") {
    const value = summary[0]?.entries[0]?.value;
    if (value == null) return null;
    return <div className="submitted-scores__line">初評 {value}</div>;
  }

  if (mode === "secondary") {
    return (
      <div className="submitted-scores__row">
        {summary.map((judge) => (
          <span className="submitted-scores__judge" key={judge.judgeLabel}>
            <span className="submitted-scores__name">{judge.judgeLabel}</span>
            <span className="submitted-scores__value">{judge.entries[0]?.value ?? "–"}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="submitted-scores__legend">美 / 事 / 創</div>
      {summary.map((judge) => (
        <div className="submitted-scores__judge-row" key={judge.judgeLabel}>
          <span className="submitted-scores__name">{judge.judgeLabel}</span>
          <span className="submitted-scores__values">
            {FINAL_CRITERIA_ORDER.map((criterion, index) => {
              const entry = judge.entries.find((e) => e.criterionLabel === criterion);
              return (
                <span key={criterion}>
                  {entry ? entry.value : "–"}
                  {index < FINAL_CRITERIA_ORDER.length - 1 ? " / " : ""}
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </>
  );
}
