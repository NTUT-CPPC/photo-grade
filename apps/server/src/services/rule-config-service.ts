import type { RuleConfigPayload } from "@photo-grade/shared";
import { prisma } from "../prisma.js";

const MIN_TOPN = 1;
const MAX_TOPN = 1000;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 1000;

export type RuleConfigPatch = {
  defaultFinalTopN?: number;
  defaultSecondaryThreshold?: number | null;
};

export async function getRuleConfig(): Promise<RuleConfigPayload> {
  const row =
    (await prisma.ruleConfig.findUnique({ where: { id: 1 } })) ??
    (await prisma.ruleConfig.create({ data: { id: 1 } }));
  return {
    defaultFinalTopN: row.defaultFinalTopN,
    defaultSecondaryThreshold: row.defaultSecondaryThreshold ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function setRuleConfig(patch: RuleConfigPatch): Promise<RuleConfigPayload> {
  const data: { defaultFinalTopN?: number; defaultSecondaryThreshold?: number | null } = {};
  if (patch.defaultFinalTopN !== undefined) {
    if (
      !Number.isInteger(patch.defaultFinalTopN) ||
      patch.defaultFinalTopN < MIN_TOPN ||
      patch.defaultFinalTopN > MAX_TOPN
    ) {
      throw new Error(`defaultFinalTopN must be an integer in [${MIN_TOPN}, ${MAX_TOPN}].`);
    }
    data.defaultFinalTopN = patch.defaultFinalTopN;
  }
  if (patch.defaultSecondaryThreshold !== undefined) {
    if (patch.defaultSecondaryThreshold === null) {
      data.defaultSecondaryThreshold = null;
    } else if (
      !Number.isInteger(patch.defaultSecondaryThreshold) ||
      patch.defaultSecondaryThreshold < MIN_THRESHOLD ||
      patch.defaultSecondaryThreshold > MAX_THRESHOLD
    ) {
      throw new Error(
        `defaultSecondaryThreshold must be null or integer in [${MIN_THRESHOLD}, ${MAX_THRESHOLD}].`
      );
    } else {
      data.defaultSecondaryThreshold = patch.defaultSecondaryThreshold;
    }
  }
  if (Object.keys(data).length === 0) return getRuleConfig();
  await prisma.ruleConfig.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data }
  });
  return getRuleConfig();
}
