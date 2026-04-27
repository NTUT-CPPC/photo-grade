import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./env.js";

export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
connection.on("error", (err) => console.error("[queue] redis connection error:", err.message));
connection.on("connect", () => console.log("[queue] redis connected:", env.REDIS_URL));

export const queue = new Queue("photo-grade", { connection });

export async function enqueueImport(batchId: string): Promise<void> {
  console.log(`[queue] enqueueImport batchId=${batchId}`);
  const job = await queue.add(
    "import",
    { batchId },
    { jobId: `import-${batchId}`, attempts: 2, backoff: { type: "exponential", delay: 5000 } }
  );
  console.log(`[queue] import job added id=${job.id} name=${job.name}`);
}

export async function enqueueSheetSync(scoreIds: string[]): Promise<void> {
  console.log(`[queue] enqueueSheetSync count=${scoreIds.length}`);
  await queue.add("sheet-sync", { scoreIds }, { attempts: 3, backoff: { type: "exponential", delay: 3000 } });
}

export async function logQueueSnapshot(label: string): Promise<void> {
  try {
    const counts = await queue.getJobCounts("wait", "active", "delayed", "completed", "failed", "paused");
    const workers = await queue.getWorkers();
    console.log(`[queue:${label}] counts=`, counts, `workers=${workers.length}`);
  } catch (err) {
    console.error(`[queue:${label}] snapshot error:`, err);
  }
}
