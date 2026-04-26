import { Send, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getJudges, submitScore } from "../api/client";
import { emitScore } from "../api/socket";
import { SubmittedScoresPanel } from "../components/SubmittedScoresPanel";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { modeLabel, useGallery } from "../state/gallery";
import type { Mode } from "../types";
import { fieldsForMode } from "@photo-grade/shared";

const FINAL_STEPS = ["美感", "故事", "創意"] as const;
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
        setJudgeLabels(judges.map((judge) => judge.name));
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
      <SubmittedScoresPanel base={item?.base} mode={gallery.mode} />
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

  const criterionKey = mode === "final" ? finalCriterionKey(step) : undefined;
  return fieldsForMode(mode, criterionKey, Math.max(1, judges.length)).map((key, index) => ({
    key,
    label: judges[index] ?? DEFAULT_JUDGE_LABELS[index] ?? `評審${index + 1}`,
    options: [3, 4, 5]
  }));
}

function judgeNameForField(field: string, judges: string[]): string {
  if (field === "初評") return judges[0] ?? DEFAULT_JUDGE_LABELS[0];
  const index = judgeIndexForField(field);
  return index >= 0 ? judges[index] ?? DEFAULT_JUDGE_LABELS[index] ?? `評審${index + 1}` : field;
}

function finalCriterionKey(step: number): "aesthetic" | "story" | "creativity" {
  if (FINAL_STEPS[step] === "故事") return "story";
  if (FINAL_STEPS[step] === "創意") return "creativity";
  return "aesthetic";
}

function judgeIndexForField(field: string): number {
  const match = field.match(/(一|二|三|[1-9]\d*)$/);
  if (!match) return -1;
  if (match[1] === "一") return 0;
  if (match[1] === "二") return 1;
  if (match[1] === "三") return 2;
  return Number(match[1]) - 1;
}
