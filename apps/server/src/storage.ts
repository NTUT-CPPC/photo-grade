import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env.js";

export const dataDirs = {
  root: env.DATA_DIR,
  imports: path.join(env.DATA_DIR, "imports"),
  originals: path.join(env.DATA_DIR, "originals"),
  previews: path.join(env.DATA_DIR, "previews"),
  thumbnails: path.join(env.DATA_DIR, "thumbnails"),
  metadata: path.join(env.DATA_DIR, "metadata"),
  logs: path.join(env.DATA_DIR, "logs"),
  exports: path.join(env.DATA_DIR, "exports"),
  secrets: path.join(env.DATA_DIR, "secrets")
} as const;

export async function ensureDataDirs(): Promise<void> {
  await Promise.all(Object.values(dataDirs).map((dir) => fs.mkdir(dir, { recursive: true })));
}

export function assertInsideDataDir(filePath: string): string {
  const root = path.resolve(env.DATA_DIR);
  const resolved = path.resolve(filePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to access path outside DATA_DIR: ${resolved}`);
  }
  return resolved;
}

export function safeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

export function publicAssetUrl(kind: "originals" | "previews" | "thumbnails", filename: string): string {
  return `/media/${kind}/${encodeURIComponent(filename)}`;
}
