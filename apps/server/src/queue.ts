import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./env.js";

export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const queue = new Queue("photo-grade", { connection });

export async function enqueueImport(batchId: string): Promise<void> {
  await queue.add("import", { batchId }, { attempts: 2, backoff: { type: "exponential", delay: 5000 } });
}

export async function enqueueSheetSync(scoreIds: string[]): Promise<void> {
  await queue.add("sheet-sync", { scoreIds }, { attempts: 3, backoff: { type: "exponential", delay: 3000 } });
}
