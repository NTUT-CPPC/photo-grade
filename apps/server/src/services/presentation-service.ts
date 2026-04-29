import { type JudgingMode, type PresentationStatePayload } from "@photo-grade/shared";
import { prisma } from "../prisma.js";

const MODES = new Set<JudgingMode>(["initial", "secondary", "final"]);

const DEFAULT_FINAL_CUTOFF = 60;
const MIN_FINAL_CUTOFF = 1;
const MAX_FINAL_CUTOFF = 1000;

export type PresentationPatch = {
  mode?: JudgingMode;
  workId?: string | null;
  workCode?: string | null;
  base?: string | null;
  idx?: number;
  index?: number;
  finalCutoff?: number;
};

export async function getPresentationState(): Promise<PresentationStatePayload> {
  const state =
    (await prisma.presentationState.findUnique({ where: { id: 1 } })) ??
    (await prisma.presentationState.create({
      data: { id: 1, mode: "initial", idx: 0, finalCutoff: DEFAULT_FINAL_CUTOFF }
    }));
  const work = state.workId ? await prisma.work.findUnique({ where: { id: state.workId } }) : null;
  return {
    mode: validateMode(state.mode),
    workId: state.workId,
    workCode: work?.code ?? null,
    idx: state.idx,
    finalCutoff: state.finalCutoff ?? DEFAULT_FINAL_CUTOFF,
    updatedAt: state.updatedAt.toISOString()
  };
}

export async function setPresentationState(input: PresentationPatch): Promise<PresentationStatePayload> {
  const data: { mode?: JudgingMode; workId?: string | null; idx?: number; finalCutoff?: number } = {};
  if (input.mode !== undefined) data.mode = validateMode(input.mode);
  const nextIdx = input.idx ?? input.index;
  if (nextIdx !== undefined) {
    if (!Number.isInteger(nextIdx) || nextIdx < 0) throw new Error("idx must be a non-negative integer.");
    data.idx = nextIdx;
  }
  if (input.finalCutoff !== undefined) {
    if (
      !Number.isInteger(input.finalCutoff) ||
      input.finalCutoff < MIN_FINAL_CUTOFF ||
      input.finalCutoff > MAX_FINAL_CUTOFF
    ) {
      throw new Error(`finalCutoff must be an integer between ${MIN_FINAL_CUTOFF} and ${MAX_FINAL_CUTOFF}.`);
    }
    data.finalCutoff = input.finalCutoff;
  }

  const workKey = input.workId ?? input.workCode ?? input.base;
  if (workKey !== undefined) {
    data.workId = workKey === null ? null : await resolveWorkId(workKey);
  }

  await prisma.presentationState.upsert({
    where: { id: 1 },
    update: data,
    create: {
      id: 1,
      mode: data.mode ?? "initial",
      workId: data.workId,
      idx: data.idx ?? 0,
      finalCutoff: data.finalCutoff ?? DEFAULT_FINAL_CUTOFF
    }
  });
  return getPresentationState();
}

function validateMode(mode: string): JudgingMode {
  if (!MODES.has(mode as JudgingMode)) throw new Error(`mode must be one of: ${Array.from(MODES).join(", ")}`);
  return mode as JudgingMode;
}

async function resolveWorkId(workKey: string): Promise<string> {
  const trimmed = workKey.trim();
  if (!trimmed) throw new Error("workId/workCode cannot be empty.");
  const work = await prisma.work.findFirst({ where: { OR: [{ id: trimmed }, { code: trimmed }] } });
  if (!work) throw new Error(`Work not found: ${trimmed}`);
  return work.id;
}
