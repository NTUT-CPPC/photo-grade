import { Send, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getJudges, submitScore } from "../api/client";
import { emitScore } from "../api/socket";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { modeLabel, useGallery } from "../state/gallery";
import type { Mode } from "../types";

const FINAL_STEPS = ["美感", "故事", "創意"] as const;
const JUDGE_SUFFIXES = ["一", "二", "三"] as const;
const DEFAULT_JUDGE_LABELS = ["評審一", "評審二", "評審三"];

export function ScorePage() {
  const gallery = useGallery("score");
  const item = gallery.current;
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [judgeLabels, setJudgeLabels] = useState<string[]>(DEFAULT_JUDGE_LABELS);
  const fields = useMemo(() => scoreFields(gallery.mode, step, judgeLabels), [gallery.mode, step, judgeLabels]);

  useEffect(() => {
    let live = true;
    getJudges()
      .then((judges) => {
        if (!live || !judges.length) return;
        const next = [...DEFAULT_JUDGE_LABELS];
        judges.slice(0, 3).forEach((judge, index) => {
          next[index] = judge.name;
        });
        setJudgeLabels(next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  function resetForNavigation(next: () => void) {
    setStep(0);
    setValues({});
    next();
  }

  async function handleSubmit() {
    if (!item || fields.some((field) => !values[field.key])) return;
    const scores = Object.fromEntries(fields.map((field) => [field.key, values[field.key]]));
    await submitScore({ base: item.base, scores, mode: gallery.mode });
    const summary = Object.entries(scores)
      .map(([field, value]) => `${judgeNameForField(field, judgeLabels)} ${value} 分`)
      .join(", ");
    emitScore({ base: item.base, mode: gallery.mode, scores, summary, at: new Date().toISOString() });
    setSubmitted(true);
    window.setTimeout(() => setSubmitted(false), 1200);
    if (gallery.mode === "final" && step < FINAL_STEPS.length - 1) {
      setStep((value) => value + 1);
      setValues({});
    }
  }

  const concept = item?.json?.concept ?? item?.concept;

  return (
    <TwoPaneShell
      item={item}
      photoQuality="mini"
      canPrev={gallery.idx > 0}
      canNext={gallery.idx < gallery.items.length - 1}
      onPrev={() => resetForNavigation(() => void gallery.navigate(gallery.idx - 1))}
      onNext={() => resetForNavigation(() => void gallery.navigate(gallery.idx + 1))}
      onJump={(base) => resetForNavigation(() => gallery.jumpTo(base))}
    >
      <span className="mode-banner">模式：{modeLabel(gallery.mode)}</span>
      <header className="photo-details compact">
        <div className="meta-line">{gallery.idx + 1}/{gallery.items.length || 0}</div>
        <h1>{concept?.title ?? item?.base ?? "No photo"}</h1>
        <small>{item ? `${item.base}_mini.jpg` : "-"}</small>
      </header>
      <section className="score-panel">
        <h2>請輸入評分</h2>
        {gallery.mode === "final" ? (
          <div className="tab-bar">
            {FINAL_STEPS.map((label, index) => (
              <button
                key={label}
                className={index === step ? "active" : ""}
                type="button"
                onClick={() => {
                  setStep(index);
                  setValues({});
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="score-options">
          {fields.map((field) => (
            <div className="score-row" key={field.key}>
              {field.label ? <span>{field.label}</span> : null}
              {field.options.map((option) => (
                <label className="score-btn" key={`${field.key}-${option}`}>
                  <input
                    type="radio"
                    name={field.key}
                    value={option}
                    checked={values[field.key] === String(option)}
                    onChange={() => setValues((current) => ({ ...current, [field.key]: String(option) }))}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <button className="submit-btn" type="button" onClick={() => void handleSubmit()}>
          {submitted ? <Check size={20} /> : <Send size={20} />}
        </button>
      </section>
      {gallery.error ? <p className="system-note error">{gallery.error}</p> : null}
    </TwoPaneShell>
  );
}

type Field = {
  key: string;
  label: string;
  options: number[];
};

function scoreFields(mode: Mode, step: number, judges: string[]): Field[] {
  if (mode === "initial") {
    return [{ key: "初評", label: "", options: [0, 1, 2, 3] }];
  }

  if (mode === "secondary") {
    return JUDGE_SUFFIXES.map((suffix, index) => ({
      key: `複評${suffix}`,
      label: judges[index] ?? DEFAULT_JUDGE_LABELS[index],
      options: [3, 4, 5]
    }));
  }

  const prefix = `決評${FINAL_STEPS[step]}`;
  return JUDGE_SUFFIXES.map((suffix, index) => ({
    key: `${prefix}${suffix}`,
    label: judges[index] ?? DEFAULT_JUDGE_LABELS[index],
    options: [3, 4, 5]
  }));
}

function judgeNameForField(field: string, judges: string[]): string {
  if (field === "初評") return judges[0] ?? DEFAULT_JUDGE_LABELS[0];
  const suffix = field.slice(-1);
  const index = JUDGE_SUFFIXES.indexOf(suffix as (typeof JUDGE_SUFFIXES)[number]);
  if (index >= 0) return judges[index] ?? DEFAULT_JUDGE_LABELS[index];
  return field;
}
