import type { JudgingMode, ModePreviewResult } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { listJudges } from "./judge-service.js";
import { getPresentationState } from "./presentation-service.js";
import { DEFAULT_FINAL_TOP_N } from "./work-service.js";

export interface ModePreviewOptions {
  topN?: number;
}

const VALID_MODES: ReadonlySet<JudgingMode> = new Set(["initial", "secondary", "final"]);

export async function previewMode(
  modeInput: string,
  options: ModePreviewOptions = {}
): Promise<ModePreviewResult> {
  if (!VALID_MODES.has(modeInput as JudgingMode)) {
    throw new Error(`mode must be one of: ${Array.from(VALID_MODES).join(", ")}`);
  }
  const mode = modeInput as JudgingMode;

  if (mode === "initial") {
    const count = await prisma.work.count();
    const judges = await listJudges();
    const judgeCount = Math.max(judges.length, 1);
    const initialThreshold = Math.ceil(judgeCount / 2);
    return {
      mode,
      count,
      baseCount: count,
      overflow: 0,
      defaultTopN: DEFAULT_FINAL_TOP_N,
      currentTopN: DEFAULT_FINAL_TOP_N,
      judgeCount,
      initialThreshold
    };
  }

  if (mode === "secondary") {
    const count = await prisma.work.count({ where: { initialPassed: true } });
    return {
      mode,
      count,
      baseCount: count,
      overflow: 0,
      defaultTopN: DEFAULT_FINAL_TOP_N,
      currentTopN: DEFAULT_FINAL_TOP_N
    };
  }

  // final
  let topN = options.topN;
  if (topN === undefined) {
    const presentation = await getPresentationState();
    topN = presentation.finalCutoff ?? DEFAULT_FINAL_TOP_N;
  }
  if (!Number.isInteger(topN) || topN < 1) topN = DEFAULT_FINAL_TOP_N;

  const works = await prisma.work.findMany({ select: { id: true, secondaryTotal: true } });
  const ranked = [...works].sort((a, b) => b.secondaryTotal - a.secondaryTotal);
  const accepted: typeof ranked = [];
  let lastScore: number | null = null;
  for (const work of ranked) {
    if (accepted.length < topN || work.secondaryTotal === lastScore) {
      accepted.push(work);
      lastScore = work.secondaryTotal;
    } else {
      break;
    }
  }
  const count = accepted.length;
  const overflow = count > topN ? count - topN : 0;
  return {
    mode,
    count,
    baseCount: topN,
    overflow,
    defaultTopN: DEFAULT_FINAL_TOP_N,
    currentTopN: topN
  };
}
