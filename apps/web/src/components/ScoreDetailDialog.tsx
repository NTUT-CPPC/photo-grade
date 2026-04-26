import { useEffect } from "react";
import { modeLabel } from "@photo-grade/shared";
import { FINAL_CRITERIA_ORDER, groupByJudge } from "../state/work-scores";
import type { Judge, Mode, WorkScoreRow } from "../types";

type Props = {
  base?: string;
  mode: Mode;
  rows: WorkScoreRow[];
  judges: Judge[] | null;
  onClose: () => void;
};

export function ScoreDetailDialog({ base, mode, rows, judges, onClose }: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grouped = groupByJudge(rows, mode, judges);

  return (
    <div className="score-detail-backdrop" onClick={onClose} role="presentation">
      <div className="score-detail" role="dialog" aria-modal="true" aria-label="評分明細" onClick={(e) => e.stopPropagation()}>
        <header className="score-detail__head">
          <span className="score-detail__title">{modeLabel(mode)} 評分明細</span>
          {base ? <span className="score-detail__base">{base}</span> : null}
          <button type="button" className="score-detail__close" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </header>
        <div className="score-detail__body">
          {grouped.length ? (
            mode === "final" ? (
              <FinalTable grouped={grouped} />
            ) : (
              <SimpleList grouped={grouped} />
            )
          ) : (
            <p className="score-detail__empty">尚無分數</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SimpleList({ grouped }: { grouped: ReturnType<typeof groupByJudge> }) {
  return (
    <ul className="score-detail__list">
      {grouped.map((judge) => (
        <li key={`${judge.judgeIndex}-${judge.judgeLabel}`}>
          <span className="score-detail__judge">{judge.judgeLabel}</span>
          <span className="score-detail__values">
            {judge.entries.map((entry, idx) => (
              <span key={entry.field}>
                {idx > 0 ? <span className="score-detail__sep"> · </span> : null}
                {entry.value}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FinalTable({ grouped }: { grouped: ReturnType<typeof groupByJudge> }) {
  return (
    <table className="score-detail__table">
      <thead>
        <tr>
          <th>評審</th>
          {FINAL_CRITERIA_ORDER.map((c) => (
            <th key={c}>{c}</th>
          ))}
          <th>合計</th>
        </tr>
      </thead>
      <tbody>
        {grouped.map((judge) => {
          const cells = FINAL_CRITERIA_ORDER.map(
            (criterion) => judge.entries.find((e) => e.criterionLabel === criterion)?.value ?? null
          );
          const total = cells.reduce<number | null>((acc, v) => (v == null ? acc : (acc ?? 0) + v), null);
          return (
            <tr key={`${judge.judgeIndex}-${judge.judgeLabel}`}>
              <td>{judge.judgeLabel}</td>
              {cells.map((value, idx) => (
                <td key={idx}>{value ?? "–"}</td>
              ))}
              <td>{total ?? "–"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
