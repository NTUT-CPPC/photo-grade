import fs from "node:fs/promises";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";
import { publicGoogleDriveDownloadUrl } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { assertInsideDataDir, dataDirs, safeFileName } from "../storage.js";
import { env } from "../env.js";

export async function processMediaForWork(workId: string, code: string, sourceUrl: string): Promise<void> {
  const downloaded = await downloadPublicFile(sourceUrl, code);
  await upsertAsset(workId, "original", downloaded.path, downloaded.mime, downloaded.size);

  const metadataPath = assertInsideDataDir(path.join(dataDirs.metadata, `${safeFileName(code)}.json`));
  try {
    const metadata = await exiftool.read(downloaded.path);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
    await upsertAsset(workId, "metadata", metadataPath, "application/json", Buffer.byteLength(JSON.stringify(metadata)));
  } catch (err) {
    await fs.writeFile(metadataPath, JSON.stringify({ error: String(err) }, null, 2), "utf8");
    await upsertAsset(workId, "metadata", metadataPath, "application/json", 0);
  }

  await createDerivative(workId, code, downloaded.path, "preview", dataDirs.previews, 2160, 85);
  await createDerivative(workId, code, downloaded.path, "thumbnail", dataDirs.thumbnails, 900, 78);
}

async function downloadPublicFile(sourceUrl: string, code: string): Promise<{ path: string; mime: string; size: number }> {
  const direct = publicGoogleDriveDownloadUrl(sourceUrl) ?? sourceUrl;
  const response = await fetch(direct, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed ${response.status} ${response.statusText}`);
  const mime = response.headers.get("content-type") ?? "application/octet-stream";
  const maxBytes = env.MAX_MEDIA_FILE_MB * 1024 * 1024;
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) throw new Error(`Media file exceeds ${env.MAX_MEDIA_FILE_MB}MB`);
  const ext = extensionFromMime(mime) ?? ".bin";
  const filePath = assertInsideDataDir(path.join(dataDirs.originals, `${safeFileName(code)}${ext}`));
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
  return { path: filePath, mime, size: arrayBuffer.byteLength };
}

async function createDerivative(
  workId: string,
  code: string,
  originalPath: string,
  kind: "preview" | "thumbnail",
  dir: string,
  max: number,
  quality: number
): Promise<void> {
  const output = assertInsideDataDir(path.join(dir, `${safeFileName(code)}.jpg`));
  await sharp(originalPath)
    .rotate()
    .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .withMetadata()
    .toFile(output);
  const stat = await fs.stat(output);
  await upsertAsset(workId, kind, output, "image/jpeg", stat.size);
}

async function upsertAsset(workId: string, kind: string, assetPath: string, mime: string | null, size: number): Promise<void> {
  await prisma.asset.upsert({
    where: { workId_kind: { workId, kind } },
    update: { path: assetPath, mime, size },
    create: { workId, kind, path: assetPath, mime, size }
  });
}

function extensionFromMime(mime: string): string | null {
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("heic")) return ".heic";
  if (mime.includes("tiff")) return ".tif";
  return null;
}
