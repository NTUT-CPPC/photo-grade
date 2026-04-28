import fs from "node:fs/promises";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import heicConvert from "heic-convert";
import sharp from "sharp";
import { extractGoogleDriveFileId } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { assertInsideDataDir, dataDirs, safeFileName } from "../storage.js";
import { env } from "../env.js";

export async function processMediaForWork(workId: string, code: string, sourceUrl: string): Promise<void> {
  console.log(`[media] ${code} download start url=${sourceUrl}`);
  const t0 = Date.now();
  let downloaded = await downloadPublicFile(sourceUrl, code);
  console.log(`[media] ${code} downloaded ${(downloaded.size / 1024).toFixed(0)}KB mime=${downloaded.mime} in ${Date.now() - t0}ms`);

  let rawExif: Record<string, unknown> | null = null;
  try {
    rawExif = (await exiftool.read(downloaded.path)) as unknown as Record<string, unknown>;
  } catch (err) {
    console.warn(`[media] ${code} exiftool failed: ${(err as Error).message}`);
  }

  if (isHeicAsset(downloaded.path, downloaded.mime)) {
    console.log(`[media] ${code} converting HEIC -> JPEG`);
    downloaded = await convertHeicToJpeg(downloaded.path, code);
  }

  await upsertAsset(workId, "original", downloaded.path, downloaded.mime, downloaded.size);

  const work = await prisma.work.findUnique({ where: { id: workId } });
  const sidecar = buildSidecarJson(work, rawExif);
  const sidecarPath = assertInsideDataDir(path.join(dataDirs.originals, `${safeFileName(code)}.json`));
  const sidecarPayload = JSON.stringify(sidecar, null, 2);
  await fs.writeFile(sidecarPath, sidecarPayload, "utf8");
  await upsertAsset(workId, "metadata", sidecarPath, "application/json", Buffer.byteLength(sidecarPayload));

  await createDerivative(workId, code, downloaded.path, "preview", dataDirs.previews, 2160, 85);
  await createDerivative(workId, code, downloaded.path, "thumbnail", dataDirs.thumbnails, 900, 78);
  console.log(`[media] ${code} done in ${Date.now() - t0}ms`);
}

export async function regenerateSidecarMetadata(): Promise<{ updated: number; skipped: number }> {
  const works = await prisma.work.findMany({ include: { assets: true } });
  let updated = 0;
  let skipped = 0;
  for (const work of works) {
    const original = work.assets.find((a) => a.kind === "original");
    if (!original) {
      skipped += 1;
      continue;
    }
    let rawExif: Record<string, unknown> | null = null;
    try {
      rawExif = (await exiftool.read(original.path)) as unknown as Record<string, unknown>;
    } catch (err) {
      console.warn(`[media] regen ${work.code} exiftool failed: ${(err as Error).message}`);
    }
    const sidecar = buildSidecarJson(work, rawExif);
    const sidecarPath = assertInsideDataDir(path.join(dataDirs.originals, `${safeFileName(work.code)}.json`));
    const payload = JSON.stringify(sidecar, null, 2);
    await fs.writeFile(sidecarPath, payload, "utf8");
    await upsertAsset(work.id, "metadata", sidecarPath, "application/json", Buffer.byteLength(payload));
    updated += 1;
  }
  console.log(`[media] regen sidecar metadata done updated=${updated} skipped=${skipped}`);
  return { updated, skipped };
}

type WorkRecord = Awaited<ReturnType<typeof prisma.work.findUnique>>;

function buildSidecarJson(work: WorkRecord, exif: Record<string, unknown> | null) {
  const info = deriveExifInfo(exif);
  const concept = {
    title: work?.title ?? null,
    description: work?.description ?? null
  };
  const priv = {
    timestamp: work?.createdAt?.toISOString() ?? null,
    school: work?.school ?? null,
    department: work?.department ?? null,
    ID: work?.studentId ?? null,
    author: work?.author ?? null,
    email: work?.email ?? null
  };
  return { private: priv, concept, info };
}

function deriveExifInfo(exif: Record<string, unknown> | null) {
  if (!exif) {
    return {
      shutter: null,
      aparture: null,
      ISO: null,
      megapixel: null,
      camera: null,
      lens: null,
      focal_length: null
    };
  }
  return {
    shutter: formatShutter(exif.ExposureTime ?? exif.ShutterSpeed ?? exif.ShutterSpeedValue),
    aparture: formatAperture(exif.FNumber ?? exif.ApertureValue),
    ISO: stringOrNull(exif.ISO ?? exif.ISOSpeedRatings),
    megapixel: computeMegapixel(exif),
    camera: mergeCameraName(stringOrNull(exif.Make ?? exif.CameraMake), stringOrNull(exif.Model)),
    lens: stringOrNull(exif.LensModel ?? exif.Lens ?? exif.LensID),
    focal_length: formatFocalLength(exif.FocalLength)
  };
}

export function mergeCameraName(make: string | null | undefined, model: string | null | undefined): string | null {
  const trimmedMake = typeof make === "string" ? make.trim() : "";
  const trimmedModel = typeof model === "string" ? model.trim() : "";
  if (!trimmedModel) return trimmedMake || null;
  if (!trimmedMake) return trimmedModel;
  const lowerModel = trimmedModel.toLowerCase();
  const lowerMake = trimmedMake.toLowerCase();
  if (lowerModel === lowerMake || lowerModel.startsWith(`${lowerMake} `)) {
    return trimmedModel;
  }
  return `${trimmedMake} ${trimmedModel}`;
}

function formatShutter(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    if (raw >= 1) return `${Number(raw.toFixed(2))}s`;
    return `1/${Math.round(1 / raw)}`;
  }
  return String(raw).trim() || null;
}

function formatAperture(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return `f/${Number(raw.toFixed(2))}`;
  }
  const str = String(raw).trim();
  if (!str) return null;
  return /^[fF]\//.test(str) ? str : `f/${str}`;
}

function formatFocalLength(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return `${Number(raw.toFixed(2))}mm`;
  }
  const str = String(raw).trim();
  if (!str) return null;
  return /mm$/i.test(str) ? str : `${str}mm`;
}

function stringOrNull(raw: unknown): string | null {
  if (raw == null) return null;
  const str = String(raw).trim();
  return str === "" ? null : str;
}

function computeMegapixel(exif: Record<string, unknown>): number | null {
  const w = numberOrNull(exif.ImageWidth ?? exif.ExifImageWidth);
  const h = numberOrNull(exif.ImageHeight ?? exif.ExifImageHeight);
  if (w == null || h == null) return null;
  return Math.round((w * h) / 1e4) / 100;
}

function numberOrNull(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function downloadPublicFile(sourceUrl: string, code: string): Promise<{ path: string; mime: string; size: number }> {
  const response = await fetchDownloadResponse(sourceUrl);
  if (!response.ok) throw new Error(`Download failed ${response.status} ${response.statusText}`);
  const mime = response.headers.get("content-type") ?? "application/octet-stream";
  const maxBytes = env.MAX_MEDIA_FILE_MB * 1024 * 1024;
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new Error(`Media file exceeds ${env.MAX_MEDIA_FILE_MB}MB`);
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) throw new Error(`Media file exceeds ${env.MAX_MEDIA_FILE_MB}MB`);
  const ext = extensionFromHeaders(response, sourceUrl, mime);
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
  await sharp(originalPath, { failOn: "none" })
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

async function fetchDownloadResponse(sourceUrl: string): Promise<Response> {
  const parsed = parseHttpUrl(sourceUrl);
  const driveId = isGoogleDriveHost(parsed) ? extractGoogleDriveFileId(sourceUrl) : null;
  if (!driveId) {
    return fetch(sourceUrl, { redirect: "follow" });
  }

  const direct = `https://docs.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`;
  const first = await fetch(direct, { redirect: "follow" });
  const contentType = first.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return first;

  const html = await first.text();
  const token = confirmToken(first, html);
  if (!token) throw new Error("Google Drive file is not publicly downloadable.");
  const cookie = first.headers.get("set-cookie");
  return fetch(`${direct}&confirm=${encodeURIComponent(token)}`, {
    redirect: "follow",
    headers: cookie ? { cookie } : undefined
  });
}

function parseHttpUrl(sourceUrl: string): URL {
  const parsed = new URL(sourceUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Media URL must use http or https.");
  }
  return parsed;
}

function isGoogleDriveHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host.endsWith("drive.google.com") || host.endsWith("docs.google.com");
}

function confirmToken(response: Response, html: string): string | null {
  const cookie = response.headers.get("set-cookie") ?? "";
  const cookieMatch = cookie.match(/download_warning[^=]*=([^;]+)/);
  if (cookieMatch?.[1]) return cookieMatch[1];
  const htmlMatch = html.match(/[?&]confirm=([0-9A-Za-z_%-]+)/);
  return htmlMatch?.[1] ? decodeURIComponent(htmlMatch[1]) : null;
}

function extensionFromMime(mime: string): string | null {
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("heic")) return ".heic";
  if (mime.includes("tiff")) return ".tif";
  return null;
}

function extensionFromHeaders(response: Response, sourceUrl: string, mime: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const dispositionExt = path.extname(filenameFromDisposition(disposition)).toLowerCase();
  const finalUrlExt = path.extname(new URL(response.url || sourceUrl).pathname).toLowerCase();
  const sourceUrlExt = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return safeExtension(dispositionExt) ?? safeExtension(finalUrlExt) ?? safeExtension(sourceUrlExt) ?? extensionFromMime(mime) ?? ".bin";
}

function filenameFromDisposition(disposition: string): string {
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return decodeURIComponent(utf8[1].replace(/^"|"$/g, ""));
  const ascii = disposition.match(/filename="?([^";]+)"?/i);
  return ascii?.[1] ?? "";
}

function safeExtension(ext: string): string | null {
  if (!ext || ext.length > 10 || /[^a-z0-9.]/i.test(ext)) return null;
  return ext;
}

function isHeicAsset(filePath: string, mime: string): boolean {
  const m = mime.toLowerCase();
  if (m.includes("heic") || m.includes("heif")) return true;
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".heic" || ext === ".heif";
}

async function convertHeicToJpeg(originalPath: string, code: string): Promise<{ path: string; mime: string; size: number }> {
  const input = await fs.readFile(originalPath);
  let output: ArrayBuffer;
  try {
    output = await heicConvert({ buffer: input, format: "JPEG", quality: 0.9 });
  } catch (err) {
    throw new Error(`HEIC conversion failed for ${path.basename(originalPath)}: ${(err as Error).message}`);
  }
  const buffer = Buffer.from(output);
  const jpgPath = assertInsideDataDir(path.join(dataDirs.originals, `${safeFileName(code)}.jpg`));
  await fs.writeFile(jpgPath, buffer);
  if (jpgPath !== originalPath) {
    await fs.unlink(originalPath).catch(() => undefined);
  }
  return { path: jpgPath, mime: "image/jpeg", size: buffer.length };
}
