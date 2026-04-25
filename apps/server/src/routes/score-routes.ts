import { Router } from "express";
import { defaultFieldForRound, isScoreRound, type JudgingMode } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { normalizeScoreRequest } from "../services/score-request.js";
import { submitScores, scoresForWork } from "../services/score-service.js";
import { emitScoreChanged, emitScoreSubmitted } from "../realtime.js";

export const scoreRoutes = Router();

scoreRoutes.get("/api/scores/:workKey", async (req, res, next) => {
  try {
    const work = await findWork(req.params.workKey);
    if (!work) {
      res.status(404).json({ error: "Work not found" });
      return;
    }
    const mode = isScoreRound(String(req.query.mode ?? "")) ? (req.query.mode as JudgingMode) : "initial";
    const scores = await scoresForWork(work.id);
    const score = scores.find((entry) => entry.field === defaultFieldForRound(mode)) ?? null;
    res.json({ score: score?.value ?? null, scores });
  } catch (error) {
    next(error);
  }
});

scoreRoutes.post("/api/scores", async (req, res, next) => {
  try {
    const result = await submitScores(await normalizeScoreRequest(req.body));
    emitScoreSubmitted(result);
    emitScoreChanged(result);
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
});

scoreRoutes.post("/submit_score", async (req, res, next) => {
  try {
    const result = await submitScores(await normalizeScoreRequest(req.body));
    emitScoreSubmitted(result);
    emitScoreChanged(result);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

async function findWork(key: string) {
  return prisma.work.findFirst({ where: { OR: [{ id: key }, { code: key }] } });
}
