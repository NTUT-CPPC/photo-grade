import { Worker } from "bullmq";
import { connection } from "./queue.js";
import { processImportBatch } from "./services/import-service.js";
import { processSheetSync } from "./services/sheet-service.js";
import { ensureDataDirs } from "./storage.js";

await ensureDataDirs();

const worker = new Worker(
  "photo-grade",
  async (job) => {
    if (job.name === "import") {
      await processImportBatch(job.data.batchId, (message) => job.updateProgress({ message }));
      return;
    }
    if (job.name === "sheet-sync") {
      await processSheetSync(job.data.scoreIds);
      return;
    }
    throw new Error(`Unknown job ${job.name}`);
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error("Worker job failed", job?.name, err);
});

console.log("photo-grade worker started");
