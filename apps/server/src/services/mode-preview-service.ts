import type { JudgingMode, ModePreviewResult } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { selectFinalists } from "./final-selection.js";
import { listJudges } from "./judge-service.js";
import { getPresentationState } from "./presentation-service.js";
import { getActiveInitialThreshold, getDefaultInitialThreshold } from "./score-service.js";
import { DEFAULT_FINAL_TOP_N, getEffectiveDefaultFinalTopN } from "./work-service.js";

export interface ModePreviewOptions {
  topN?: number;
  threshold?: number;
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

  const defaultTopN = await getEffectiveDefaultFinalTopN();

  if (mode === "initial") {
    const count = await prisma.work.count();
    return {
      mode,
      count,
      baseCount: count,
      overflow: 0,
      defaultTopN,
      currentTopN: defaultTopN
    };
  }

  if (mode === "secondary") {
    const judges = await listJudges();
    const judgeCount = Math.max(judges.length, 1);
    const defaultThreshold = await getDefaultInitialThreshold();
    let threshold = options.threshold;
    if (threshold === undefined) {
      threshold = await getActiveInitialThreshold();
    }
    if (!Number.isInteger(threshold) || threshold < 1) threshold = defaultThreshold;

    // Count works whose initial-vote tally meets the threshold.
    const initialScores = await prisma.score.findMany({
      where: { round: "initial", field: "初評" },
      select: { workId: true, value: true }
    });
    const passing = initialScores.filter((row) => row.value >= threshold).length;
    return {
      mode,
      count: passing,
      baseCount: passing,
      overflow: 0,
      defaultTopN,
      currentTopN: defaultTopN,
      judgeCount,
      initialThreshold: threshold,
      defaultThreshold,
      currentThreshold: threshold
    };
  }

  // final
  let topN = options.topN;
  if (topN === undefined) {
    const presentation = await getPresentationState();
    topN = presentation.finalCutoff ?? defaultTopN;
  }
  if (!Number.isInteger(topN) || topN < 1) topN = defaultTopN;

  const works = await prisma.work.findMany({
    select: {
      id: true,
      code: true,
      initialPassed: true,
      secondaryTotal: true,
      scores: { where: { round: "secondary" }, select: { id: true } }
    }
  });
  const accepted = selectFinalists(
    works.map((work) => ({ ...work, secondaryScoreCount: work.scores.length })),
    topN
  );
  const count = accepted.length;
  const overflow = count > topN ? count - topN : 0;
  return {
    mode,
    count,
    baseCount: topN,
    overflow,
    defaultTopN,
    currentTopN: topN
  };
}
