import fs from "node:fs/promises";
import path from "node:path";
import type { JudgingMode, WorkSummary } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { dataDirs, publicAssetUrl } from "../storage.js";
import { getOrderingState } from "./ordering-service.js";
import { getPresentationState } from "./presentation-service.js";

export const DEFAULT_FINAL_TOP_N = 60;

export interface ListWorksOptions {
  topN?: number;
}

export async function listWorks(
  mode: JudgingMode = "initial",
  options: ListWorksOptions = {}
): Promise<WorkSummary[]> {
  const works = await prisma.work.findMany({ include: { assets: true }, orderBy: [{ code: "asc" }] });
  const sorted = works.sort((a, b) => compareCodes(a.code, b.code));
  let filtered = sorted;
  if (mode === "secondary") filtered = sorted.filter((w) => w.initialPassed);
  if (mode === "final") {
    let topN = options.topN;
    if (topN === undefined) {
      const presentation = await getPresentationState();
      topN = presentation.finalCutoff ?? DEFAULT_FINAL_TOP_N;
    }
    if (!Number.isInteger(topN) || topN < 1) topN = DEFAULT_FINAL_TOP_N;
    const ranked = [...sorted].sort((a, b) => b.secondaryTotal - a.secondaryTotal);
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
    const acceptedIds = new Set(accepted.map((w) => w.id));
    filtered = sorted.filter((w) => acceptedIds.has(w.id));
  }

  const ordered = await applyOrdering(filtered);
  return Promise.all(ordered.map(toSummary));
}

async function applyOrdering<T extends { code: string }>(items: T[]): Promise<T[]> {
  const ordering = await getOrderingState();
  if (ordering.activeMode !== "shuffle" || ordering.shuffleOrder.length === 0) return items;
  const positions = new Map<string, number>();
  ordering.shuffleOrder.forEach((code, index) => positions.set(code, index));
  return [...items].sort((a, b) => {
    const ai = positions.get(a.code);
    const bi = positions.get(b.code);
    if (ai === undefined && bi === undefined) return compareCodes(a.code, b.code);
    if (ai === undefined) return 1;
    if (bi === undefined) return -1;
    return ai - bi;
  });
}

async function toSummary(work: Awaited<ReturnType<typeof prisma.work.findMany>>[number] & { assets: Array<{ kind: string; path: string }> }): Promise<WorkSummary> {
  const assets: WorkSummary["assets"] = {};
  let metadataAssetPath: string | null = null;
  for (const asset of work.assets) {
    const filename = path.basename(asset.path);
    if (asset.kind === "original") assets.original = publicAssetUrl("originals", filename);
    if (asset.kind === "preview") assets.preview = publicAssetUrl("previews", filename);
    if (asset.kind === "thumbnail") assets.thumbnail = publicAssetUrl("thumbnails", filename);
    if (asset.kind === "metadata") {
      assets.metadata = `/api/works/${work.id}/metadata`;
      metadataAssetPath = asset.path;
    }
  }
  const metadata = metadataAssetPath ? await readPublicMetadata(metadataAssetPath) : null;
  return {
    id: work.id,
    code: work.code,
    title: work.title,
    description: work.description,
    author: work.author,
    school: work.school,
    department: work.department,
    sourceUrl: work.sourceUrl,
    initialPassed: work.initialPassed,
    secondaryTotal: work.secondaryTotal,
    assets,
    metadata
  };
}

async function readPublicMetadata(absPath: string): Promise<Record<string, unknown> | null> {
  if (!absPath.startsWith(dataDirs.root)) return null;
  try {
    const raw = await fs.readFile(absPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      concept: parsed.concept ?? null,
      info: parsed.info ?? null
    };
  } catch {
    return null;
  }
}

export async function metadataForWork(workId: string): Promise<unknown> {
  const asset = await prisma.asset.findUnique({ where: { workId_kind: { workId, kind: "metadata" } } });
  if (!asset) return null;
  if (!asset.path.startsWith(dataDirs.root)) throw new Error("Metadata path is outside DATA_DIR.");
  const content = await fs.readFile(asset.path, "utf8");
  return JSON.parse(content);
}

function compareCodes(a: string, b: string): number {
  const [na, sa] = a.split("-");
  const [nb, sb] = b.split("-");
  if (sa !== sb) return sa < sb ? -1 : 1;
  return Number(na) - Number(nb);
}
