import { Send, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { submitScore } from "../api/client";
import { emitScore } from "../api/socket";
import { TwoPaneShell } from "../components/TwoPaneShell";
import { modeLabel, useGallery } from "../state/gallery";
import type { Mode } from "../types";

const JUDGES = ["何老師", "鄧老師", "SHA老師"];
const FINAL_STEPS = ["美感", "故事", "創意"] as const;

const NAME_MAP: Record<string, string> = {
  初評: "何老師",
  複評一: "何老師",
  複評二: "鄧老師",
  複評三: "SHA老師",
  決評美感一: "何老師",
  決評美感二: "鄧老師",
  決評美感三: "SHA老師",
  決評故事一: "何老師",
  決評故事二: "鄧老師",
  決評故事三: "SHA老師",
  決評創意一: "何老師",
  決評創意二: "鄧老師",
  決評創意三: "SHA老師"
};

export function ScorePage() {
  const gallery = useGallery("score");
  const item = gallery.current;
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const fields = useMemo(() => scoreFields(gallery.mode, step), [gallery.mode, step]);

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
      .map(([field, value]) => `${NAME_MAP[field] ?? field} ${value} 分`)
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

function scoreFields(mode: Mode, step: number): Field[] {
  if (mode === "initial") {
    return [{ key: "初評", label: "", options: [0, 1, 2, 3] }];
  }

  if (mode === "secondary") {
    return ["複評一", "複評二", "複評三"].map((key, index) => ({
      key,
      label: JUDGES[index],
      options: [3, 4, 5]
    }));
  }

  const prefix = `決評${FINAL_STEPS[step]}`;
  return ["一", "二", "三"].map((suffix, index) => ({
    key: `${prefix}${suffix}`,
    label: JUDGES[index],
    options: [3, 4, 5]
  }));
}
