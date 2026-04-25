import { Router } from "express";
import type { JudgingMode } from "@photo-grade/shared";
import { basicAuth } from "../auth.js";
import { getPresentationState, setPresentationState } from "../services/presentation-service.js";
import { emitStateChanged } from "../realtime.js";

export const stateRoutes = Router();

stateRoutes.get("/api/host/state", async (_req, res, next) => {
  try {
    res.json(await getPresentationState());
  } catch (error) {
    next(error);
  }
});

stateRoutes.post("/api/host/state", basicAuth("host", "admin"), async (req, res, next) => {
  try {
    const state = await setPresentationState(req.body);
    emitStateChanged(state);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

stateRoutes.get(["/api/sync/idx", "/get_idx"], async (_req, res, next) => {
  try {
    const state = await getPresentationState();
    res.json({ idx: state.idx, index: state.idx, base: state.workCode });
  } catch (error) {
    next(error);
  }
});

stateRoutes.post(["/api/sync/idx", "/set_idx"], basicAuth("host", "admin"), async (req, res, next) => {
  try {
    const state = await setPresentationState({ idx: req.body?.idx ?? req.body?.index, base: req.body?.base });
    emitStateChanged(state);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

stateRoutes.get(["/api/sync/mode", "/get_mode"], async (_req, res, next) => {
  try {
    const state = await getPresentationState();
    res.json({ mode: state.mode });
  } catch (error) {
    next(error);
  }
});

stateRoutes.post(["/api/sync/mode", "/set_mode"], basicAuth("host", "admin"), async (req, res, next) => {
  try {
    const state = await setPresentationState({ mode: req.body?.mode as JudgingMode });
    emitStateChanged(state);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
