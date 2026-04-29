import { randomInt } from "node:crypto";
import type { OrderingMode, OrderingStatePayload } from "@photo-grade/shared";
import { prisma } from "../prisma.js";

const ORDERING_MODES: ReadonlySet<OrderingMode> = new Set(["sequential", "shuffle"]);

function validateOrderingMode(value: string): OrderingMode {
  if (!ORDERING_MODES.has(value as OrderingMode)) {
    throw new Error(`mode must be one of: ${Array.from(ORDERING_MODES).join(", ")}`);
  }
  return value as OrderingMode;
}

function fisherYatesShuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function toPayload(state: {
  defaultMode: string;
  activeMode: string;
  shuffleOrder: unknown;
  generatedAt: Date | null;
  updatedAt: Date;
}): OrderingStatePayload {
  const order = Array.isArray(state.shuffleOrder)
    ? state.shuffleOrder.filter((value): value is string => typeof value === "string")
    : [];
  return {
    defaultMode: validateOrderingMode(state.defaultMode),
    activeMode: validateOrderingMode(state.activeMode),
    shuffleOrder: order,
    generatedAt: state.generatedAt ? state.generatedAt.toISOString() : null,
    updatedAt: state.updatedAt.toISOString(),
    hasShuffle: order.length > 0
  };
}

async function ensureOrderingRow() {
  const existing = await prisma.orderingState.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.orderingState.create({
    data: { id: 1, defaultMode: "sequential", activeMode: "sequential", shuffleOrder: [] }
  });
}

export async function getOrderingState(): Promise<OrderingStatePayload> {
  const row = await ensureOrderingRow();
  return toPayload(row);
}

async function freshShuffleOrderFromWorks(): Promise<string[]> {
  const works = await prisma.work.findMany({ select: { code: true } });
  const codes = works.map((w) => w.code);
  return fisherYatesShuffle(codes);
}

export async function setDefaultMode(
  modeInput: string,
  options: { regenerate?: boolean } = {}
): Promise<OrderingStatePayload> {
  const mode = validateOrderingMode(modeInput);
  await ensureOrderingRow();

  const shouldRegenerate = options.regenerate === true || mode === "shuffle";
  if (shouldRegenerate) {
    const order = await freshShuffleOrderFromWorks();
    await prisma.orderingState.update({
      where: { id: 1 },
      data: {
        defaultMode: mode,
        activeMode: mode,
        shuffleOrder: order,
        generatedAt: new Date()
      }
    });
  } else {
    // sequential without regenerate → keep shuffleOrder so a host can re-enable
    await prisma.orderingState.update({
      where: { id: 1 },
      data: { defaultMode: mode, activeMode: mode }
    });
  }

  return getOrderingState();
}

export async function setActiveMode(modeInput: string): Promise<OrderingStatePayload> {
  const mode = validateOrderingMode(modeInput);
  await ensureOrderingRow();
  await prisma.orderingState.update({
    where: { id: 1 },
    data: { activeMode: mode }
  });
  return getOrderingState();
}

export async function regenerateShuffle(): Promise<OrderingStatePayload> {
  await ensureOrderingRow();
  const order = await freshShuffleOrderFromWorks();
  await prisma.orderingState.update({
    where: { id: 1 },
    data: { shuffleOrder: order, generatedAt: new Date() }
  });
  return getOrderingState();
}
