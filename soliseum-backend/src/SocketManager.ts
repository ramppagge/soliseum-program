/**
 * Socket.io manager for real-time battle log streaming to the Battle Station frontend.
 * Events: battle:start, battle:log, battle:end.
 * Battle Engine: battle:log (type, side), battle:dominance (0-100).
 */

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import type { BattleResult, LogEntry, StartBattlePayload } from "./types";
import type { BattleLogEntry } from "./battle-engine/types";

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
      socket.on("battle:subscribe", (data: { battleId?: string }) => {
        const battleId = data?.battleId;
        if (typeof battleId === "string" && battleId) {
          const room = `battle:${battleId}`;
          socket.join(room);
          console.log("[SocketManager] Socket", socket.id, "joined room", room);
        }
      });
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
    const room = `battle:${battleId}`;

    this.io.to(room).emit("battle:start", {
      battleId,
      arenaAddress: ctx.arenaAddress,
      agentA: ctx.payload.agentA,
      agentB: ctx.payload.agentB,
      gameMode: ctx.payload.gameMode,
    });

    for (let i = 0; i < result.logs.length; i++) {
      await this.delay(LOG_INTERVAL_MS);
      const log: LogEntry = result.logs[i];
      this.io!.to(room).emit("battle:log", { battleId, log });
    }

    this.io!.to(room).emit("battle:end", {
      battleId,
      arenaAddress: ctx.arenaAddress,
      winner: result.winner,
      logs: result.logs,
      gameMode: result.gameMode,
      durationMs: result.durationMs,
    });
  }

  /**
   * Emit Battle Engine log (type, side) and dominance updates.
   * Used by /api/test-battle for real-time tug-of-war visualization.
   */
  emitBattleEngineLog(battleId: string, log: BattleLogEntry): void {
    this.io?.to(`battle:${battleId}`).emit("battle:log", { battleId, log });
  }

  emitBattleDominance(battleId: string, dominance_score: number): void {
    this.io?.to(`battle:${battleId}`).emit("battle:dominance", { battleId, dominance_score });
  }

  emitBattleEngineEnd(
    battleId: string,
    result: { winner_side: 0 | 1; gameMode: string; durationMs: number; summary: string; scores: { agent_a: number; agent_b: number } }
  ): void {
    this.io?.to(`battle:${battleId}`).emit("battle:end", { battleId, winner: result.winner_side, ...result });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Emit to a specific room (e.g. battleId) if you add room joins later. */
  getIO(): Server | null {
    return this.io;
  }
}
