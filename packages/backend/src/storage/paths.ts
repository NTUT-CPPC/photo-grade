import fs from "node:fs/promises";
import path from "node:path";
import type { BackendConfig } from "../config/env.js";

export type StorageDirectoryKey = keyof BackendConfig["storage"];

export async function ensureStorageLayout(config: Pick<BackendConfig, "dataDir" | "storage">): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });

  for (const directory of Object.values(config.storage)) {
    assertInsideDataDir(config.dataDir, directory);
    await fs.mkdir(directory, { recursive: true });
  }
}

export function dataPath(config: Pick<BackendConfig, "dataDir">, ...segments: string[]): string {
  const resolved = path.resolve(config.dataDir, ...segments);
  assertInsideDataDir(config.dataDir, resolved);
  return resolved;
}

export function storagePath(
  config: Pick<BackendConfig, "dataDir" | "storage">,
  directory: StorageDirectoryKey,
  ...segments: string[]
): string {
  const base = config.storage[directory];
  const resolved = path.resolve(base, ...segments);
  assertInsideDataDir(config.dataDir, resolved);
  return resolved;
}

export function assertInsideDataDir(dataDir: string, targetPath: string): void {
  const root = path.resolve(dataDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }

  throw new Error(`Refusing to access path outside DATA_DIR: ${target}`);
}

export function sanitizeStorageName(value: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "unnamed";
}
