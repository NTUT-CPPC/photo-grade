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
import { attachRealtime } from "./realtime.js";
import { authRoutes } from "./routes/auth-routes.js";
import { scoreRoutes } from "./routes/score-routes.js";
import { stateRoutes } from "./routes/state-routes.js";
import { prisma } from "./prisma.js";
import { createImportBatch } from "./services/import-service.js";
import { importTemplateCsvBuffer, importTemplateXlsxBuffer } from "./services/import-template-service.js";
import { addJudge, deleteJudge, listJudges, replaceJudges } from "./services/judge-service.js";
import { listWorks, metadataForWork } from "./services/work-service.js";
import { processSheetSync } from "./services/sheet-service.js";
import { assertInsideDataDir, dataDirs, ensureDataDirs } from "./storage.js";

await ensureDataDirs();
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(serverDir, "../../..");

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

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/runtime-config", (_req, res) =>
  res.json({
    entryBaseUrl: normalizeBaseUrl(env.PUBLIC_ENTRY_URL || env.APP_BASE_URL || `http://localhost:${env.PORT}`),
    authMode: env.AUTH_MODE
  })
);

app.use("/media/:kind/:file", (req, res) => {
  const kind = req.params.kind;
  if (!["originals", "previews", "thumbnails"].includes(kind)) return res.status(404).send("Not found");
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
      items: works.map((work) => ({
        base: work.code,
        imageUrl: work.assets.preview ?? work.assets.original,
        thumbnailUrl: work.assets.thumbnail,
        high: work.assets.preview ?? work.assets.original,
        mini: work.assets.thumbnail,
        concept: { title: work.title, description: work.description }
      }))
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
    await enqueueImport(importId);
    await prisma.importBatch.update({
      where: { id: importId },
      data: { status: "QUEUED", error: null, processedCount: 0 }
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
      batch.status === "COMPLETED" ? total : batch.status === "PROCESSING" ? batch.processedCount : 0;
    let workerOnline: boolean | undefined;
    let message = batch.error ?? `${batch.status} ${done}/${total}`;
    let status: "complete" | "error" | "running" =
      batch.status === "COMPLETED" ? "complete" : batch.status === "FAILED" ? "error" : "running";
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

app.post("/api/sheet-sync/drain", requireAuth(), async (_req, res, next) => {
  try {
    await processSheetSync();
    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use("/host", requireAuth(), staticWeb());
app.use("/score", requireAuth(), staticWeb());
app.use("/admin", requireAuth(), staticWeb());
app.use("/view", staticWeb());
app.use("/", staticWeb());

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(/not found/i.test(message) ? 404 : 400).json({ error: message });
});

const server = http.createServer(app);
attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(`photo-grade server listening on ${env.PORT}`);
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

function toDryRunResponse(id: string, dryRun: { totalRows: number; works: Array<{ code: string; title: string }>; issues: Array<{ row: number; field: string; message: string }> }) {
  return {
    id,
    importId: id,
    total: dryRun.totalRows,
    valid: dryRun.works.length,
    warnings: [] as string[],
    errors: dryRun.issues.map((issue) => `Row ${issue.row} ${issue.field}: ${issue.message}`),
    items: dryRun.works.map((work) => ({ base: work.code, name: work.title, status: "ready" }))
  };
}

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstString(value[0]);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
