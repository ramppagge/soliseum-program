/**
 * Socket.io manager for real-time battle log streaming to the Battle Station frontend.
 * Events: battle:start, battle:log, battle:end.
 */

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import type { BattleResult, LogEntry, StartBattlePayload } from "./types";

const LOG_INTERVAL_MS = Math.min(
  1000,
  Math.max(500, parseInt(process.env.BATTLE_LOG_INTERVAL_MS ?? "700", 10) || 700)
);

export interface BattleStreamContext {
  battleId: string;
  arenaAddress: string;
  payload: StartBattlePayload;
  result: BattleResult;
}

export class SocketManager {
  private io: Server | null = null;

  attach(httpServer: HttpServer): void {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN ?? "*",
        methods: ["GET", "POST"],
      },
    });

    this.io.on("connection", (socket: Socket) => {
      console.log("[SocketManager] Client connected:", socket.id);
      socket.on("disconnect", () => {
        console.log("[SocketManager] Client disconnected:", socket.id);
      });
    });
  }

  /**
   * Emit battle:start, then stream battle:log every LOG_INTERVAL_MS, then battle:end.
   * Runs asynchronously; use await streamBattleLogs(...) to wait for completion.
   */
  async streamBattleLogs(ctx: BattleStreamContext): Promise<void> {
    if (!this.io) {
      console.warn("[SocketManager] Socket server not attached; skipping stream.");
      return;
    }

    const { battleId, result } = ctx;

    this.io.emit("battle:start", {
      battleId,
      arenaAddress: ctx.arenaAddress,
      agentA: ctx.payload.agentA,
      agentB: ctx.payload.agentB,
      gameMode: ctx.payload.gameMode,
    });

    for (let i = 0; i < result.logs.length; i++) {
      await this.delay(LOG_INTERVAL_MS);
      const log: LogEntry = result.logs[i];
      this.io.emit("battle:log", { battleId, log });
    }

    this.io.emit("battle:end", {
      battleId,
      arenaAddress: ctx.arenaAddress,
      winner: result.winner,
      logs: result.logs,
      gameMode: result.gameMode,
      durationMs: result.durationMs,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Emit to a specific room (e.g. battleId) if you add room joins later. */
  getIO(): Server | null {
    return this.io;
  }
}
