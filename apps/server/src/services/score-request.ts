import { defaultFieldForRound, isScoreRound, type JudgingMode, type ScoreInput } from "@photo-grade/shared";
import { prisma } from "../prisma.js";

export async function normalizeScoreRequest(body: unknown): Promise<ScoreInput[]> {
  if (!body || typeof body !== "object") throw new Error("Score payload must be an object.");
  const payload = body as Record<string, unknown>;
  const workKey = stringValue(payload.workId) ?? stringValue(payload.base) ?? stringValue(payload.workCode);
  if (!workKey) throw new Error("workId or base is required.");
  const work = await findWork(workKey);
  if (!work) throw new Error(`Work not found: ${workKey}`);
  const round = scoreRound(payload.round) ?? scoreRound(payload.mode);
  const judgeId = stringValue(payload.judgeId);

  if (payload.scores && typeof payload.scores === "object" && !Array.isArray(payload.scores)) {
    return Object.entries(payload.scores as Record<string, unknown>).map(([field, value]) => ({
      workId: work.id,
      round,
      judgeId,
      field,
      value: numberValue(value)
    }));
  }

  const field = stringValue(payload.field) ?? (round ? defaultFieldForRound(round) : null);
  if (!field) throw new Error("field is required when scores is not provided.");
  return [
    {
      workId: work.id,
      round,
      judgeId,
      field,
      value: numberValue(payload.score ?? payload.value)
    }
  ];
}

async function findWork(key: string) {
  return prisma.work.findFirst({ where: { OR: [{ id: key }, { code: key }] } });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) throw new Error("score value must be numeric.");
  return numeric;
}

function scoreRound(value: unknown): JudgingMode | undefined {
  return typeof value === "string" && isScoreRound(value) ? value : undefined;
}
