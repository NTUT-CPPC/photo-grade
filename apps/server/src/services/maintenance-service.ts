import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../prisma.js";
import { assertInsideDataDir, dataDirs, wipeDirContents } from "../storage.js";

const CODE_HEADER = "作品編號";
const TITLE_HEADER = "作品名稱";
const LINK_HEADER = "作品連結";

export interface ScoresExportArtifact {
  filename: string;
  absolutePath: string;
  csv: string;
}

export async function exportScoresCsv(reason: "manual" | "clear-scores" | "clear-media"): Promise<ScoresExportArtifact> {
  const works = await prisma.work.findMany({
    include: {
      scores: { select: { field: true, value: true } }
    }
  });

  const fields = new Set<string>();
  for (const work of works) {
    for (const score of work.scores) fields.add(score.field);
  }
  const orderedFields = [...fields].sort(compareScoreField);
  const header = [CODE_HEADER, TITLE_HEADER, LINK_HEADER, ...orderedFields];

  const lines: string[][] = [header];
  for (const work of works.sort((a, b) => a.code.localeCompare(b.code, "en"))) {
    const byField = new Map(work.scores.map((score) => [score.field, String(score.value)]));
    const row = [work.code, work.title, work.sourceUrl ?? "", ...orderedFields.map((field) => byField.get(field) ?? "")];
    lines.push(row);
  }

  const csv = toCsv(lines);
  const filename = `scores-${timestampForFile()}-${reason}.csv`;
  const absolutePath = assertInsideDataDir(path.join(dataDirs.output, filename));
  await fs.writeFile(absolutePath, csv, "utf8");
  return { filename, absolutePath, csv };
}

export async function clearScoreData(): Promise<void> {
  await prisma.$transaction([
    prisma.sheetSyncOutbox.deleteMany({}),
    prisma.score.deleteMany({}),
    prisma.work.updateMany({
      data: {
        initialPassed: false,
        secondaryTotal: 0
      }
    })
  ]);
}

export async function clearMediaData(): Promise<void> {
  await prisma.asset.deleteMany({ where: { kind: { in: ["original", "preview", "thumbnail", "metadata"] } } });
  await Promise.all([
    wipeDirContents(dataDirs.originals),
    wipeDirContents(dataDirs.previews),
    wipeDirContents(dataDirs.thumbnails),
    wipeDirContents(dataDirs.metadata)
  ]);
}

function compareScoreField(a: string, b: string): number {
  const rank = (field: string): [number, number, string] => {
    if (field === "初評") return [0, 0, field];

    const secondary = field.match(/^複評(\d+)$/);
    if (secondary) return [1, Number(secondary[1]), field];

    const final = field.match(/^決評(美感|故事|創意)(\d+)$/);
    if (final) {
      const criterionOrder = final[1] === "美感" ? 0 : final[1] === "故事" ? 1 : 2;
      return [2 + criterionOrder, Number(final[2]), field];
    }

    return [9, Number.MAX_SAFE_INTEGER, field];
  };

  const ar = rank(a);
  const br = rank(b);
  if (ar[0] !== br[0]) return ar[0] - br[0];
  if (ar[1] !== br[1]) return ar[1] - br[1];
  return ar[2].localeCompare(br[2], "zh-Hant");
}

function toCsv(lines: string[][]): string {
  return `${lines.map((line) => line.map(escapeCsv).join(",")).join("\n")}\n`;
}

function escapeCsv(value: string): string {
  const normalized = String(value ?? "");
  if (/[,"\n\r]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
  return normalized;
}

function timestampForFile(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}-${h}${mi}${s}`;
}