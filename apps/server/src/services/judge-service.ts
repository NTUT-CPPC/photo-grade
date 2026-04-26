import { prisma } from "../prisma.js";

const DEFAULT_JUDGE_NAMES = ["何老師", "鄧老師", "SHA老師"] as const;

export type JudgeDto = {
  id: string;
  name: string;
  sortOrder: number;
};

export type JudgeUpdateInput = {
  id?: string;
  name: string;
};

export async function listJudges(): Promise<JudgeDto[]> {
  await ensureDefaultJudges();
  const judges = await prisma.judge.findMany({ orderBy: { sortOrder: "asc" } });
  return judges.map((judge) => ({ id: judge.id, name: judge.name, sortOrder: judge.sortOrder }));
}

export async function addJudge(nameInput: string): Promise<JudgeDto> {
  const name = normalizeJudgeName(nameInput);
  const existing = await prisma.judge.findMany({ orderBy: { sortOrder: "desc" }, take: 1 });
  const sortOrder = (existing[0]?.sortOrder ?? -1) + 1;
  const created = await prisma.judge.create({ data: { name, sortOrder } });
  return { id: created.id, name: created.name, sortOrder: created.sortOrder };
}

export async function deleteJudge(id: string): Promise<void> {
  const judgeId = id.trim();
  if (!judgeId) throw new Error("judge id is required.");
  await prisma.judge.delete({ where: { id: judgeId } });
}

export async function replaceJudges(inputs: JudgeUpdateInput[]): Promise<JudgeDto[]> {
  if (!Array.isArray(inputs)) throw new Error("judges must be an array.");
  const normalized = inputs.map((input) => ({ id: input.id?.trim(), name: normalizeJudgeName(input.name) }));
  if (!normalized.length) throw new Error("at least one judge is required.");

  await prisma.$transaction(async (tx) => {
    const keepIds = normalized.map((judge) => judge.id).filter((id): id is string => Boolean(id));
    await tx.judge.deleteMany({ where: keepIds.length ? { id: { notIn: keepIds } } : {} });

    for (const [index, judge] of normalized.entries()) {
      if (judge.id) {
        await tx.judge.update({
          where: { id: judge.id },
          data: { name: judge.name, sortOrder: index }
        });
      } else {
        await tx.judge.create({ data: { name: judge.name, sortOrder: index } });
      }
    }
  });

  return listJudges();
}

async function ensureDefaultJudges(): Promise<void> {
  const count = await prisma.judge.count();
  if (count > 0) return;
  await prisma.judge.createMany({
    data: DEFAULT_JUDGE_NAMES.map((name, index) => ({ name, sortOrder: index }))
  });
}

function normalizeJudgeName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("judge name is required.");
  if (name.length > 32) throw new Error("judge name must be 32 characters or fewer.");
  return name;
}
