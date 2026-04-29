import type { OrderingStatePayload } from "@photo-grade/shared";
import { io, type Socket } from "socket.io-client";
import type { ImportProgress, Mode, ScoreNotification, SyncState } from "../types";

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL || undefined, {
      transports: ["websocket", "polling"],
      autoConnect: true
    });
  }
  return socket;
}

export function emitIdx(idx: number, base?: string) {
  const s = getSocket();
  const payload = { idx, index: idx, base };
  s.emit("sync:set_idx", payload);
  s.emit("host:navigate", payload);
}

export function emitMode(mode: Mode) {
  const s = getSocket();
  s.emit("sync:set_mode", { mode });
  s.emit("host:mode", { mode });
}

export function emitScore(notification: ScoreNotification) {
  const s = getSocket();
  s.emit("score:submitted", notification);
  s.emit("score:notification", notification);
}

export function onSyncState(callback: (state: SyncState) => void) {
  const s = getSocket();
  const handlers = [
    ["sync:state", callback],
    ["host:state", callback],
    ["state", callback],
    ["photo:index", (payload: SyncState | number) => callback(typeof payload === "number" ? { idx: payload } : payload)],
    ["sync:idx", (payload: SyncState | number) => callback(typeof payload === "number" ? { idx: payload } : payload)],
    ["mode:changed", (payload: SyncState | Mode) => callback(typeof payload === "string" ? { mode: payload } : payload)],
    ["sync:mode", (payload: SyncState | Mode) => callback(typeof payload === "string" ? { mode: payload } : payload)]
  ] as const;

  handlers.forEach(([event, handler]) => s.on(event, handler));
  return () => handlers.forEach(([event, handler]) => s.off(event, handler));
}

export function onScoreNotification(callback: (notification: ScoreNotification) => void) {
  const s = getSocket();
  const events = ["score:submitted", "score:notification", "score"];
  events.forEach((event) => s.on(event, callback));
  return () => events.forEach((event) => s.off(event, callback));
}

export function onImportProgress(callback: (progress: ImportProgress) => void) {
  const s = getSocket();
  const events = ["import:progress", "admin:import:progress"];
  events.forEach((event) => s.on(event, callback));
  return () => events.forEach((event) => s.off(event, callback));
}

export function onOrderingChanged(callback: (state: OrderingStatePayload) => void) {
  const s = getSocket();
  s.on("ordering:changed", callback);
  return () => {
    s.off("ordering:changed", callback);
  };
}
