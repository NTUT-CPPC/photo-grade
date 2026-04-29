import { Worker } from "bullmq";
import {
  SHEET_SYNC_SWEEP_JOB,
  connection,
  ensureSheetSyncSweepSchedule,
  logQueueSnapshot
} from "./queue.js";
import { processImportBatch } from "./services/import-service.js";
import { processSheetSync, reconcileSheetSync } from "./services/sheet-service.js";
import { ensureDataDirs } from "./storage.js";

await ensureDataDirs();
await ensureSheetSyncSweepSchedule();

const worker = new Worker(
  "photo-grade",
  async (job) => {
    console.log(`[worker] picked up job id=${job.id} name=${job.name} data=`, job.data);
    if (job.name === "import") {
      await processImportBatch(job.data.batchId, async (message, processedCount) => {
        await job.updateProgress({ message, processedCount });
      });
      return;
    }
    if (job.name === "sheet-sync") {
      await processSheetSync(job.data.scoreIds);
      return;
    }
    if (job.name === SHEET_SYNC_SWEEP_JOB) {
      const result = await reconcileSheetSync();
      return result;
    }
    throw new Error(`Unknown job ${job.name}`);
  },
  { connection }
);

worker.on("ready", () => console.log("[worker] ready and listening on queue 'photo-grade'"));
worker.on("active", (job) => console.log(`[worker] active job id=${job.id} name=${job.name}`));
worker.on("completed", (job) => console.log(`[worker] completed job id=${job.id} name=${job.name}`));
worker.on("failed", (job, err) => console.error(`[worker] failed job id=${job?.id} name=${job?.name}:`, err));
worker.on("stalled", (jobId) => console.warn(`[worker] stalled job id=${jobId}`));
worker.on("error", (err) => console.error("[worker] error:", err));

await logQueueSnapshot("worker-startup");
console.log("photo-grade worker started");
