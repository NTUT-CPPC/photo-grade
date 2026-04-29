import {
  defaultFieldForRound,
  isScoreRound,
  roundForScoreField,
  scoreLabel,
  validateScore,
  type ScoreChangedPayload,
  type ScoreInput
} from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { enqueueSheetSync } from "../queue.js";

export async function submitScores(inputs: ScoreInput[]): Promise<ScoreChangedPayload> {
  if (!inputs.length) throw new Error("No scores submitted.");
  const work = await prisma.work.findUniqueOrThrow({ where: { id: inputs[0].workId } });
  const normalized = inputs.map((input) => normalizeScoreInput(input));
  for (const input of normalized) {
    if (input.workId !== work.id) throw new Error("All scores must target the same work.");
    if (!validateScore(input.field, input.value, input.round)) {
      throw new Error(`Invalid ${input.round} score ${input.field}=${input.value}`);
    }
  }

  const saved = await prisma.$transaction(async (tx) => {
    const scores = [];
    for (const input of normalized) {
      const score = await tx.score.upsert({
        where: {
          workId_round_judgeId_field: {
            workId: work.id,
            round: input.round,
            judgeId: input.judgeId,
            field: input.field
          }
        },
        update: { value: input.value, sheetStatus: "PENDING", sheetError: null, syncedAt: null },
        create: {
          workId: work.id,
          round: input.round,
          judgeId: input.judgeId,
          field: input.field,
          value: input.value
        }
      });
      await tx.sheetSyncOutbox.create({ data: { scoreId: score.id } });
      scores.push(score);
    }
    await recomputeWorkDerivedScores(work.id, tx);
    return scores;
  });

  enqueueSheetSync(saved.map((s) => s.id)).catch((err) => {
    console.error("Failed to enqueue sheet sync job; DB outbox remains pending.", err);
  });

  return {
    workId: work.id,
    workCode: work.code,
    submittedAt: new Date().toISOString(),
    scores: saved.map((s) => {
      const label = scoreLabel(s.field);
      return { field: s.field, value: s.value, label: label.label, judgeLabel: label.judgeLabel };
    })
  };
}

export async function scoresForWork(workId: string) {
  return prisma.score.findMany({ where: { workId }, orderBy: { field: "asc" } });
}

type NormalizedScoreInput = Required<Pick<ScoreInput, "workId" | "field" | "value">> & {
  round: "initial" | "secondary" | "final";
  judgeId: string;
};

function normalizeScoreInput(input: ScoreInput): NormalizedScoreInput {
  const round = input.round ?? roundForScoreField(input.field);
  if (!round || !isScoreRound(round)) throw new Error(`Unsupported scoring round for field ${input.field}`);
  const field = input.field || defaultFieldForRound(round);
  return {
    workId: input.workId,
    round,
    judgeId: input.judgeId?.trim() || "default",
    field,
    value: input.value
  };
}

type DerivedClient = Pick<typeof prisma, "score" | "work" | "judge" | "presentationState" | "ruleConfig">;

export async function getActiveInitialThreshold(client: DerivedClient = prisma): Promise<number> {
  const presentation = await client.presentationState.findUnique({ where: { id: 1 } });
  const override = presentation?.secondaryThreshold ?? null;
  if (override !== null && override > 0) return override;
  return getDefaultInitialThreshold(client);
}

export async function getDefaultInitialThreshold(client: DerivedClient = prisma): Promise<number> {
  const [judgeCount, ruleConfig] = await Promise.all([
    client.judge.count(),
    client.ruleConfig.findUnique({ where: { id: 1 } })
  ]);
  const adminDefault = ruleConfig?.defaultSecondaryThreshold ?? null;
  if (adminDefault !== null && adminDefault > 0) return adminDefault;
  return Math.ceil(Math.max(judgeCount, 1) / 2);
}

async function recomputeWorkDerivedScores(
  workId: string,
  client: DerivedClient = prisma
): Promise<void> {
  const scores = await client.score.findMany({ where: { workId } });
  const initial = scores.find((s) => s.round === "initial" && s.field === "初評")?.value ?? null;
  const secondaryTotal = scores.filter((s) => s.round === "secondary").reduce((sum, s) => sum + s.value, 0);
  const threshold = await getActiveInitialThreshold(client);
  await client.work.update({
    where: { id: workId },
    data: {
      initialPassed: initial !== null ? initial >= threshold : undefined,
      secondaryTotal
    }
  });
}

export async function recomputeAllInitialPassed(client: DerivedClient = prisma): Promise<{ updated: number }> {
  const threshold = await getActiveInitialThreshold(client);
  const works = await client.work.findMany({
    select: {
      id: true,
      initialPassed: true,
      scores: { where: { round: "initial", field: "初評" }, select: { value: true } }
    }
  });
  let updated = 0;
  for (const work of works) {
    const initial = work.scores[0]?.value ?? null;
    const next = initial !== null ? initial >= threshold : false;
    if (next !== work.initialPassed) {
      await client.work.update({ where: { id: work.id }, data: { initialPassed: next } });
      updated++;
    }
  }
  return { updated };
}
