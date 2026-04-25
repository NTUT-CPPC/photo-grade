import { type JudgingMode, type PresentationStatePayload } from "@photo-grade/shared";
import { prisma } from "../prisma.js";

const MODES = new Set<JudgingMode>(["initial", "secondary", "final"]);

export type PresentationPatch = {
  mode?: JudgingMode;
  workId?: string | null;
  workCode?: string | null;
  base?: string | null;
  idx?: number;
  index?: number;
};

export async function getPresentationState(): Promise<PresentationStatePayload> {
  const state =
    (await prisma.presentationState.findUnique({ where: { id: 1 } })) ??
    (await prisma.presentationState.create({ data: { id: 1, mode: "initial", idx: 0 } }));
  const work = state.workId ? await prisma.work.findUnique({ where: { id: state.workId } }) : null;
  return {
    mode: validateMode(state.mode),
    workId: state.workId,
    workCode: work?.code ?? null,
    idx: state.idx,
    updatedAt: state.updatedAt.toISOString()
  };
}

export async function setPresentationState(input: PresentationPatch): Promise<PresentationStatePayload> {
  const data: { mode?: JudgingMode; workId?: string | null; idx?: number } = {};
  if (input.mode !== undefined) data.mode = validateMode(input.mode);
  const nextIdx = input.idx ?? input.index;
  if (nextIdx !== undefined) {
    if (!Number.isInteger(nextIdx) || nextIdx < 0) throw new Error("idx must be a non-negative integer.");
    data.idx = nextIdx;
  }

  const workKey = input.workId ?? input.workCode ?? input.base;
  if (workKey !== undefined) {
    data.workId = workKey === null ? null : await resolveWorkId(workKey);
  }

  await prisma.presentationState.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, mode: data.mode ?? "initial", workId: data.workId, idx: data.idx ?? 0 }
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
