import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ScoreChangedPayload } from "@photo-grade/shared";
import { env } from "./env.js";
import { isAuthorizedHeader } from "./auth.js";
import { getPresentationState, setPresentationState, type PresentationPatch } from "./services/presentation-service.js";
import { normalizeScoreRequest } from "./services/score-request.js";
import { submitScores } from "./services/score-service.js";

let io: Server | null = null;

export function attachRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: env.SOCKET_CORS_ORIGIN
      ? { origin: env.SOCKET_CORS_ORIGIN, credentials: true }
      : { origin: true, credentials: true }
  });

  io.on("connection", async (socket) => {
    socket.emit("state:changed", await getPresentationState());

    socket.on("host:setState", (payload: PresentationPatch, ack?: Ack) => {
      handle(ack, async () => {
        assertSocketRole(socket.handshake.headers.authorization, "host");
        const state = await setPresentationState(payload);
        emitStateChanged(state);
        return state;
      });
    });

    socket.on("sync:set_idx", (payload: PresentationPatch, ack?: Ack) => {
      handle(ack, async () => {
        assertSocketRole(socket.handshake.headers.authorization, "host");
        const state = await setPresentationState({ idx: payload.idx ?? payload.index, base: payload.base });
        emitStateChanged(state);
        return state;
      });
    });

    socket.on("host:navigate", (payload: PresentationPatch, ack?: Ack) => {
      handle(ack, async () => {
        assertSocketRole(socket.handshake.headers.authorization, "host");
        const state = await setPresentationState({ idx: payload.idx ?? payload.index, base: payload.base });
        emitStateChanged(state);
        return state;
      });
    });

    socket.on("sync:set_mode", (payload: PresentationPatch, ack?: Ack) => {
      handle(ack, async () => {
        assertSocketRole(socket.handshake.headers.authorization, "host");
        const state = await setPresentationState({ mode: payload.mode });
        emitStateChanged(state);
        return state;
      });
    });

    socket.on("host:mode", (payload: PresentationPatch, ack?: Ack) => {
      handle(ack, async () => {
        assertSocketRole(socket.handshake.headers.authorization, "host");
        const state = await setPresentationState({ mode: payload.mode });
        emitStateChanged(state);
        return state;
      });
    });

    socket.on("score:submit", (payload: unknown, ack?: Ack) => {
      handle(ack, async () => {
        assertSocketRole(socket.handshake.headers.authorization, "score");
        const result = await submitScores(await normalizeScoreRequest(payload));
        emitScoreSubmitted(result);
        emitScoreChanged(result);
        return result;
      });
    });
  });

  return io;
}

function assertSocketRole(header: string | undefined, role: "host" | "score"): void {
  if (isAuthorizedHeader(header, role) || isAuthorizedHeader(header, "admin")) return;
  throw new Error("Unauthorized socket event.");
}

export function emitStateChanged(state: Awaited<ReturnType<typeof getPresentationState>>): void {
  io?.emit("state:changed", state);
  io?.emit("host:state", state);
  io?.emit("sync:state", { idx: state.idx, mode: state.mode, base: state.workCode ?? undefined });
  io?.emit("sync:idx", { idx: state.idx, base: state.workCode ?? undefined });
  io?.emit("sync:mode", state.mode);
  io?.emit("photo:index", { idx: state.idx, base: state.workCode ?? undefined });
  io?.emit("mode:changed", state.mode);
}

export function emitScoreSubmitted(payload: ScoreChangedPayload): void {
  io?.emit("score:submitted", payload);
  io?.emit("score:notification", payload);
}

export function emitScoreChanged(payload: ScoreChangedPayload): void {
  io?.emit("score:changed", payload);
  io?.emit("score", payload);
}

type Ack = (payload: { ok: boolean; data?: unknown; error?: string }) => void;

async function handle(ack: Ack | undefined, action: () => Promise<unknown>): Promise<void> {
  try {
    const data = await action();
    ack?.({ ok: true, data });
  } catch (error) {
    ack?.({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
