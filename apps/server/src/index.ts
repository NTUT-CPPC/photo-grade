import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import multer from "multer";
import { env } from "./env.js";
import { requireAuth } from "./auth.js";
import { closeSession, sessionMiddleware } from "./session.js";
import { enqueueImport, queue } from "./queue.js";
import { attachRealtime, emitOrderingChanged } from "./realtime.js";
import { authRoutes } from "./routes/auth-routes.js";
import { scoreRoutes } from "./routes/score-routes.js";
import { stateRoutes } from "./routes/state-routes.js";
import { prisma } from "./prisma.js";
import {
  cancelActiveImports,
  cancelImportBatch,
  createImportBatch,
  wipeAllImportData
} from "./services/import-service.js";
import { importTemplateCsvBuffer, importTemplateXlsxBuffer } from "./services/import-template-service.js";
import { addJudge, deleteJudge, listJudges, replaceJudges } from "./services/judge-service.js";
import { clearMediaData, clearScoreData, exportScoresCsv, type ScoresExportArtifact } from "./services/maintenance-service.js";
import { regenerateSidecarMetadata } from "./services/media-service.js";
import { previewMode } from "./services/mode-preview-service.js";
import { getOrderingState, regenerateShuffle, setActiveMode, setDefaultMode } from "./services/ordering-service.js";
import { setPresentationState } from "./services/presentation-service.js";
import { getRuleConfig, setRuleConfig } from "./services/rule-config-service.js";
import { recomputeAllInitialPassed } from "./services/score-service.js";
import { getSheetSyncConfig, setSheetSyncConfig } from "./services/sheet-config-service.js";
import { listWorks, metadataForWork } from "./services/work-service.js";
import { processSheetSync } from "./services/sheet-service.js";
import { assertInsideDataDir, dataDirs, ensureDataDirs } from "./storage.js";

await ensureDataDirs();
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(serverDir, "../../..");
const appVersion = process.env.PHOTO_GRADE_VERSION || "unknown";

const app = express();
const upload = multer({
  dest: dataDirs.imports,
  limits: { fileSize: env.MAX_IMPORT_FILE_MB * 1024 * 1024 }
});

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(sessionMiddleware());
app.use(authRoutes);

app.get("/health", (_req, res) => res.json({ ok: true, version: appVersion }));
app.get("/api/health", (_req, res) => res.json({ ok: true, version: appVersion }));
app.get("/api/runtime-config", (_req, res) =>
  res.json({
    entryBaseUrl: normalizeBaseUrl(env.PUBLIC_ENTRY_URL || env.APP_BASE_URL || `http://localhost:${env.PORT}`),
    authMode: env.AUTH_MODE
  })
);

const MEDIA_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp"]);
app.use("/media/:kind/:file", (req, res) => {
  const kind = req.params.kind;
  if (!["originals", "previews", "thumbnails"].includes(kind)) return res.status(404).send("Not found");
  const ext = path.extname(req.params.file).toLowerCase();
  if (!MEDIA_IMAGE_EXTENSIONS.has(ext)) return res.status(404).send("Not found");
  const dir = dataDirs[kind as "originals" | "previews" | "thumbnails"];
  const filePath = assertInsideDataDir(path.join(dir, req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  return res.sendFile(filePath);
});

app.get("/api/works", async (req, res, next) => {
  try {
    res.json(await listWorks(req.query.mode as never));
  } catch (error) {
    next(error);
  }
});

app.get("/api/items", async (req, res, next) => {
  try {
    const works = await listWorks(req.query.mode as never);
    res.json({
      items: works.map((work) => {
        const concept = (work.metadata?.concept as { title?: string; description?: string } | null) ?? null;
        const info = (work.metadata?.info as Record<string, unknown> | null) ?? null;
        return {
          base: work.code,
          imageUrl: work.assets.preview ?? work.assets.original,
          thumbnailUrl: work.assets.thumbnail,
          high: work.assets.preview ?? work.assets.original,
          mini: work.assets.thumbnail,
          concept: { title: concept?.title ?? work.title, description: concept?.description ?? work.description },
          info
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/works/:workId/metadata", async (req, res, next) => {
  try {
    res.json(await metadataForWork(req.params.workId));
  } catch (error) {
    next(error);
  }
});

app.get("/api/judges", async (_req, res, next) => {
  try {
    res.json({ judges: await listJudges() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/judges", requireAuth(), async (_req, res, next) => {
  try {
    res.json({ judges: await listJudges() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/sheet-sync/config", requireAuth(), async (_req, res, next) => {
  try {
    res.json({
      enabled: env.GOOGLE_SHEETS_ENABLED,
      ...(await getSheetSyncConfig())
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/sheet-sync/config", requireAuth(), async (req, res, next) => {
  try {
    const spreadsheet = firstString(req.body?.spreadsheet);
    if (!spreadsheet) throw new Error("spreadsheet is required.");
    const worksheetTitle = firstString(req.body?.worksheetTitle);
    const config = await setSheetSyncConfig({ spreadsheet, worksheetTitle });
    res.json({ enabled: env.GOOGLE_SHEETS_ENABLED, ...config });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/judges", requireAuth(), async (req, res, next) => {
  try {
    res.status(201).json({ judge: await addJudge(firstString(req.body?.name) ?? "") });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/judges", requireAuth(), async (req, res, next) => {
  try {
    res.json({ judges: await replaceJudges(req.body?.judges ?? []) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/judges/:id", requireAuth(), async (req, res, next) => {
  try {
    await deleteJudge(firstString(req.params.id) ?? "");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/import/template.csv", requireAuth(), (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"photo-grade-template.csv\"");
  res.send(importTemplateCsvBuffer());
});

app.post("/api/admin/maintenance/export-scores", requireAuth(), async (_req, res, next) => {
  try {
    sendCsvDownload(res, await exportScoresCsv("manual"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/maintenance/clear-scores", requireAuth(), async (_req, res, next) => {
  try {
    const artifact = await exportScoresCsv("clear-scores");
    await clearScoreData();
    sendCsvDownload(res, artifact, { "X-Photo-Grade-Maintenance": "clear-scores" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/maintenance/clear-media", requireAuth(), async (_req, res, next) => {
  try {
    const artifact = await exportScoresCsv("clear-media");
    await clearMediaData();
    sendCsvDownload(res, artifact, { "X-Photo-Grade-Maintenance": "clear-media" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/import/template.xlsx", requireAuth(), (_req, res) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=\"photo-grade-template.xlsx\"");
  res.send(importTemplateXlsxBuffer());
});

app.post(["/api/admin/import/dry-run", "/api/admin/imports/dry-run"], requireAuth(), upload.any(), async (req, res, next) => {
  try {
    const files = (req.files ?? []) as Express.Multer.File[];
    const file = files[0];
    if (!file) {
      res.status(400).json({ error: "Missing CSV/XLSX file." });
      return;
    }
    console.log(`[admin] dry-run upload originalName=${file.originalname} size=${file.size}`);
    const result = await createImportBatch(file.originalname, file.path);
    console.log(`[admin] dry-run created batchId=${result.id} works=${result.dryRun.works.length} issues=${result.dryRun.issues.length}`);
    res.json(toDryRunResponse(result.id, result.dryRun));
  } catch (error) {
    next(error);
  }
});

app.post(["/api/admin/import/confirm", "/api/admin/imports/:id/confirm"], requireAuth(), async (req, res, next) => {
  try {
    const importId = firstString(req.params.id) ?? firstString(req.body?.importId) ?? firstString(req.body?.id);
    if (!importId) throw new Error("importId is required.");
    console.log(`[admin] confirm import importId=${importId}`);
    await cancelActiveImports();
    await wipeAllImportData();
    await enqueueImport(importId);
    await prisma.importBatch.update({
      where: { id: importId },
      data: { status: "QUEUED", error: null, processedCount: 0, totalCount: 0 }
    });
    let workerOnline: boolean | undefined;
    try {
      workerOnline = (await queue.getWorkers()).length > 0;
    } catch {
      workerOnline = undefined;
    }
    res.status(202).json({
      importId,
      status: workerOnline === false ? "error" : "running",
      phase: "queued",
      done: 0,
      total: 1,
      message:
        workerOnline === false
          ? "Worker offline — no BullMQ worker is listening on the queue. Start the worker container (`docker compose up -d worker`)."
          : "Import queued.",
      workerOnline
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/api/admin/import/cancel", "/api/admin/imports/:id/cancel"], requireAuth(), async (req, res, next) => {
  try {
    const importId = firstString(req.params.id) ?? firstString(req.body?.importId) ?? firstString(req.body?.id);
    if (!importId) throw new Error("importId is required.");
    console.log(`[admin] cancel import importId=${importId}`);
    await cancelImportBatch(importId);
    res.json({ importId, status: "cancelled" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/queue/status", requireAuth(), async (_req, res, next) => {
  try {
    const counts = await queue.getJobCounts("wait", "active", "delayed", "failed", "completed", "paused");
    const workers = await queue.getWorkers();
    const active = await queue.getJobs(["active"], 0, 10);
    const wait = await queue.getJobs(["wait"], 0, 10);
    const failed = await queue.getJobs(["failed"], 0, 10);
    res.json({
      counts,
      workers: workers.map((w) => ({ id: w.id, name: w.name, addr: w.addr })),
      active: active.map((j) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        attemptsMade: j.attemptsMade,
        timestamp: j.timestamp,
        processedOn: j.processedOn
      })),
      wait: wait.map((j) => ({ id: j.id, name: j.name, data: j.data, timestamp: j.timestamp })),
      failed: failed.map((j) => ({ id: j.id, name: j.name, data: j.data, failedReason: j.failedReason }))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/imports/active", requireAuth(), async (_req, res, next) => {
  try {
    const active = await prisma.importBatch.findFirst({
      where: { status: { in: ["DRY_RUN", "QUEUED", "PROCESSING"] } },
      orderBy: { createdAt: "desc" }
    });
    if (!active) {
      res.json(null);
      return;
    }
    res.json({
      id: active.id,
      fileName: active.fileName,
      status: active.status,
      processedCount: active.processedCount,
      totalCount: active.totalCount,
      error: active.error,
      createdAt: active.createdAt,
      updatedAt: active.updatedAt,
      dryRun: toDryRunResponse(active.id, active.dryRunJson as Parameters<typeof toDryRunResponse>[1])
    });
  } catch (error) {
    next(error);
  }
});

app.get(["/api/admin/import/progress/:id", "/api/admin/imports/:id"], requireAuth(), async (req, res, next) => {
  try {
    const id = firstString(req.params.id);
    if (!id) throw new Error("importId is required.");
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id } });
    const dryRun = batch.dryRunJson as { works?: unknown[] };
    const total = batch.totalCount || dryRun.works?.length || 0;
    const done =
      batch.status === "COMPLETED"
        ? total
        : batch.status === "PROCESSING" || batch.status === "CANCELLED"
          ? batch.processedCount
          : 0;
    let workerOnline: boolean | undefined;
    let message = batch.error ?? `${batch.status} ${done}/${total}`;
    let status: "complete" | "error" | "running" | "cancelled" =
      batch.status === "COMPLETED"
        ? "complete"
        : batch.status === "FAILED"
          ? "error"
          : batch.status === "CANCELLED"
            ? "cancelled"
            : "running";
    if (batch.status === "QUEUED") {
      try {
        const workers = await queue.getWorkers();
        workerOnline = workers.length > 0;
        if (!workerOnline) {
          status = "error";
          message = "Worker offline — no BullMQ worker is listening on the queue. Start the worker container (`docker compose up -d worker`).";
        }
      } catch {
        workerOnline = undefined;
      }
    }
    res.json({
      importId: batch.id,
      status,
      phase: batch.status,
      done,
      total,
      message,
      workerOnline
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/imports", requireAuth(), async (_req, res, next) => {
  try {
    res.json(await prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 }));
  } catch (error) {
    next(error);
  }
});

app.use(scoreRoutes);
app.use(stateRoutes);

app.post("/api/admin/metadata/regenerate", requireAuth(), async (_req, res, next) => {
  try {
    const result = await regenerateSidecarMetadata();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sheet-sync/drain", requireAuth(), async (_req, res, next) => {
  try {
    await processSheetSync();
    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ordering", async (_req, res, next) => {
  try {
    res.json(await getOrderingState());
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/ordering", requireAuth(), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { defaultMode?: unknown; regenerate?: unknown };
    const defaultMode = typeof body.defaultMode === "string" ? body.defaultMode : undefined;
    const regenerate = body.regenerate === true;
    if (!defaultMode && !regenerate) {
      throw new Error("Provide defaultMode and/or regenerate=true.");
    }
    let state = await getOrderingState();
    if (defaultMode) {
      state = await setDefaultMode(defaultMode, { regenerate });
    } else if (regenerate) {
      // regenerate without changing defaultMode — keep current default but reshuffle
      state = await regenerateShuffle();
    }
    emitOrderingChanged(state);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sync/ordering", requireAuth(), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { activeMode?: unknown };
    const activeMode = typeof body.activeMode === "string" ? body.activeMode : undefined;
    if (!activeMode) throw new Error("activeMode is required.");
    const state = await setActiveMode(activeMode);
    emitOrderingChanged(state);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/rule-config", requireAuth(), async (_req, res, next) => {
  try {
    res.json(await getRuleConfig());
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/rule-config", requireAuth(), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { defaultFinalTopN?: unknown; defaultSecondaryThreshold?: unknown };
    const patch: { defaultFinalTopN?: number; defaultSecondaryThreshold?: number | null } = {};
    if (typeof body.defaultFinalTopN === "number") patch.defaultFinalTopN = body.defaultFinalTopN;
    if (body.defaultSecondaryThreshold === null) patch.defaultSecondaryThreshold = null;
    else if (typeof body.defaultSecondaryThreshold === "number")
      patch.defaultSecondaryThreshold = body.defaultSecondaryThreshold;
    const config = await setRuleConfig(patch);

    // Propagate the new defaults to live presentation state so existing host
    // overrides don't mask the new rule. Clearing presentation overrides means
    // the next preview/list will read the admin default through the fallback.
    const stateChanges: { finalCutoff?: number; secondaryThreshold?: number | null } = {};
    if (patch.defaultFinalTopN !== undefined) stateChanges.finalCutoff = config.defaultFinalTopN;
    if (patch.defaultSecondaryThreshold !== undefined) stateChanges.secondaryThreshold = null;
    if (Object.keys(stateChanges).length > 0) {
      await setPresentationState(stateChanges);
    } else if (patch.defaultSecondaryThreshold !== undefined) {
      // Even if presentation state didn't change, retroactively re-apply.
      await recomputeAllInitialPassed();
    }
    res.json(config);
  } catch (error) {
    next(error);
  }
});

app.get("/api/host/preview-mode", requireAuth(), async (req, res, next) => {
  try {
    const mode = firstString(req.query.mode);
    if (!mode) throw new Error("mode is required.");
    const topNRaw = firstString(req.query.topN);
    const topN = topNRaw !== undefined ? Number(topNRaw) : undefined;
    if (topN !== undefined && (!Number.isFinite(topN) || !Number.isInteger(topN) || topN < 1)) {
      throw new Error("topN must be a positive integer.");
    }
    const thresholdRaw = firstString(req.query.threshold);
    const threshold = thresholdRaw !== undefined ? Number(thresholdRaw) : undefined;
    if (
      threshold !== undefined &&
      (!Number.isFinite(threshold) || !Number.isInteger(threshold) || threshold < 1)
    ) {
      throw new Error("threshold must be a positive integer.");
    }
    res.json(await previewMode(mode, { topN, threshold }));
  } catch (error) {
    next(error);
  }
});

app.use("/host", requireAuth(), staticWeb());
app.use("/score", requireAuth(), staticWeb());
app.use("/admin", requireAuth(), staticWeb());
app.use("/view", staticWeb());
app.use("/", staticWeb());

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  const status = /not found/i.test(message) ? 404 : 400;
  console.error(`[error] ${req.method} ${req.originalUrl} status=${status} ${errorSummary(error)}`);
  if (error instanceof Error && error.stack) console.error(error.stack);
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause) console.error(`[error] cause ${errorSummary(cause)}`);
  res.status(status).json({ error: message });
});

const server = http.createServer(app);
attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(`photo-grade server listening on ${env.PORT} version=${appVersion}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);
  server.close();
  await Promise.allSettled([closeSession(), prisma.$disconnect()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

function staticWeb() {
  const dist = path.resolve(repoRoot, "apps/web/dist");
  const fallback = path.join(dist, "index.html");
  return [
    express.static(dist),
    (_req: express.Request, res: express.Response) => {
      if (fs.existsSync(fallback)) return res.sendFile(fallback);
      return res.status(200).send("Web build is not available. Run npm run build -w @photo-grade/web.");
    }
  ];
}

function toDryRunResponse(
  id: string,
  dryRun: {
    totalRows: number;
    works: Array<{ code: string; title: string }>;
    issues: Array<{ row: number; field: string; message: string; severity?: "warning" | "error" }>;
  }
) {
  const format = (issue: { row: number; message: string }) => `列 ${issue.row}：${issue.message}`;
  const errors = dryRun.issues.filter((i) => (i.severity ?? "error") === "error").map(format);
  const warnings = dryRun.issues.filter((i) => i.severity === "warning").map(format);
  return {
    id,
    importId: id,
    total: dryRun.totalRows,
    valid: dryRun.works.length,
    warnings,
    errors,
    items: dryRun.works.map((work) => ({ base: work.code, name: work.title, status: "ready" }))
  };
}

function sendCsvDownload(
  res: express.Response,
  artifact: ScoresExportArtifact,
  headers?: Record<string, string>
): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${artifact.filename}\"`);
  res.setHeader("X-Photo-Grade-Backup-Path", artifact.absolutePath);
  if (headers) {
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  }
  res.status(200).send(artifact.csv);
}

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstString(value[0]);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function errorSummary(error: unknown): string {
  if (!(error instanceof Error)) return `message=${JSON.stringify(String(error))}`;
  const code = (error as { code?: unknown }).code;
  const codeText = typeof code === "string" ? ` code=${code}` : "";
  return `name=${error.name}${codeText} message=${JSON.stringify(error.message)}`;
}
