import fs from "node:fs/promises";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";
import { extractGoogleDriveFileId } from "@photo-grade/shared";
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
