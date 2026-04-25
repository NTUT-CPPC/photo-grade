import http from "node:http";
import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { attachRealtime } from "./realtime.js";
import { scoreRoutes } from "./routes/score-routes.js";
import { stateRoutes } from "./routes/state-routes.js";
import { listWorks, metadataForWork } from "./services/work-service.js";
import { processSheetSync } from "./services/sheet-service.js";
import { ensureDataDirs } from "./storage.js";

await ensureDataDirs();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

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

app.use(scoreRoutes);
app.use(stateRoutes);

app.post("/api/sheet-sync/drain", async (_req, res, next) => {
  try {
    await processSheetSync();
    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(/not found/i.test(message) ? 404 : 400).json({ error: message });
});

const server = http.createServer(app);
attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(`photo-grade server listening on ${env.PORT}`);
});
