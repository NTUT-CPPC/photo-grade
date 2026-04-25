import fs from "node:fs/promises";
import path from "node:path";
import type { JudgingMode, WorkSummary } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { dataDirs, publicAssetUrl } from "../storage.js";

export async function listWorks(mode: JudgingMode = "initial"): Promise<WorkSummary[]> {
  const works = await prisma.work.findMany({ include: { assets: true }, orderBy: [{ code: "asc" }] });
  const sorted = works.sort((a, b) => compareCodes(a.code, b.code));
  let filtered = sorted;
  if (mode === "secondary") filtered = sorted.filter((w) => w.initialPassed);
  if (mode === "final") {
    const ranked = [...sorted].sort((a, b) => b.secondaryTotal - a.secondaryTotal);
    const accepted: typeof ranked = [];
    let lastScore: number | null = null;
    for (const work of ranked) {
      if (accepted.length < 30 || work.secondaryTotal === lastScore) {
        accepted.push(work);
        lastScore = work.secondaryTotal;
      } else {
        break;
      }
    }
    const acceptedIds = new Set(accepted.map((w) => w.id));
    filtered = sorted.filter((w) => acceptedIds.has(w.id));
  }
  return Promise.all(filtered.map(toSummary));
}

async function toSummary(work: Awaited<ReturnType<typeof prisma.work.findMany>>[number] & { assets: Array<{ kind: string; path: string }> }): Promise<WorkSummary> {
  const assets: WorkSummary["assets"] = {};
  for (const asset of work.assets) {
    const filename = path.basename(asset.path);
    if (asset.kind === "original") assets.original = publicAssetUrl("originals", filename);
    if (asset.kind === "preview") assets.preview = publicAssetUrl("previews", filename);
    if (asset.kind === "thumbnail") assets.thumbnail = publicAssetUrl("thumbnails", filename);
    if (asset.kind === "metadata") assets.metadata = `/api/works/${work.id}/metadata`;
  }
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
    assets
  };
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
