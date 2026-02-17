/**
 * Socket.io manager for real-time battle log streaming to the Battle Station frontend.
 * Events: battle:start, battle:log, battle:end, battle:dominance.
 *
 * Security:
 *  - Optional token-based auth middleware (validates against session store).
 *  - Room cleanup after battle:end to prevent memory buildup.
 *  - maxHttpBufferSize and connectTimeout limits to prevent abuse.
 *  - Per-room connection cap to limit spectator resource usage.
 */

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import type { BattleResult, LogEntry, StartBattlePayload } from "./types";
import type { BattleLogEntry } from "./battle-engine/types";

const LOG_INTERVAL_MS = Math.min(
  1000,
  Math.max(500, parseInt(process.env.BATTLE_LOG_INTERVAL_MS ?? "700", 10) || 700)
);

const MAX_ROOM_CONNECTIONS = parseInt(process.env.MAX_ROOM_CONNECTIONS ?? "200", 10);

export interface BattleStreamContext {
  battleId: string;
  arenaAddress: string;
  payload: StartBattlePayload;
  result: BattleResult;
}

/** Optional session validator — set via setSessionValidator(). */
type SessionValidator = (token: string) => boolean;

export class SocketManager {
  private io: Server | null = null;
  private sessionValidator: SessionValidator | null = null;

  /** Inject the session validator (called from index.ts to avoid circular deps). */
  setSessionValidator(validator: SessionValidator): void {
    this.sessionValidator = validator;
  }

  attach(httpServer: HttpServer): void {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN ?? "*",
        methods: ["GET", "POST"],
      },
      maxHttpBufferSize: 1e6, // 1 MB max payload
      connectTimeout: 10_000,
      pingTimeout: 20_000,
      pingInterval: 25_000,
    });

    // Auth middleware — if a session validator is configured, require a valid token
    this.io.use((socket, next) => {
      if (!this.sessionValidator) {
        return next(); // No auth configured — allow (development mode)
      }
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token || !this.sessionValidator(token)) {
        return next(new Error("Unauthorized: invalid or missing auth token"));
      }
      next();
    });

    this.io.on("connection", (socket: Socket) => {
      console.log("[SocketManager] Client connected:", socket.id);

      socket.on("battle:subscribe", async (data: { battleId?: string }) => {
        const battleId = data?.battleId;
        if (typeof battleId !== "string" || !battleId || battleId.length > 128) {
          socket.emit("error", { message: "Invalid battleId" });
          return;
        }

        const room = `battle:${battleId}`;

        // Enforce per-room connection cap
        const roomSockets = await this.io!.in(room).fetchSockets();
        if (roomSockets.length >= MAX_ROOM_CONNECTIONS) {
          socket.emit("error", { message: "Room is full, please try again later" });
          return;
        }

        socket.join(room);
        console.log("[SocketManager] Socket", socket.id, "joined room", room);
      });

      socket.on("disconnect", () => {
        console.log("[SocketManager] Client disconnected:", socket.id);
      });
    });
  }

  /**
   * Emit battle:start, then stream battle:log every LOG_INTERVAL_MS, then battle:end.
   * Cleans up the room after streaming to release resources.
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
      this.io.to(room).emit("battle:log", { battleId, log });
    }

    this.io.to(room).emit("battle:end", {
      battleId,
      arenaAddress: ctx.arenaAddress,
      winner: result.winner,
      logs: result.logs,
      gameMode: result.gameMode,
      durationMs: result.durationMs,
    });

    // Cleanup: remove all clients from the room to free memory
    this.io.in(room).socketsLeave(room);
  }

  /**
   * Emit Battle Engine log (type, side) and dominance updates.
   * Used by /api/test-battle for real-time tug-of-war visualization.
   */
  emitBattleStart(
    battleId: string,
    data: { agentA: { id: string; name: string }; agentB: { id: string; name: string }; gameMode: string }
  ): void {
    this.io?.to(`battle:${battleId}`).emit("battle:start", { battleId, ...data });
  }

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

    // Cleanup room after battle ends
    const room = `battle:${battleId}`;
    this.io?.in(room).socketsLeave(room);
  }

  /**
   * Emit countdown tick for battles in staking phase
   */
  emitBattleCountdown(battleId: string, secondsRemaining: number): void {
    this.io?.to(`battle:${battleId}`).emit("battle:countdown", { battleId, secondsRemaining });
  }

  /**
   * Subscribe to countdown updates for a battle
   */
  subscribeToCountdown(socket: Socket, battleId: string): void {
    const room = `countdown:${battleId}`;
    socket.join(room);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getIO(): Server | null {
    return this.io;
  }
}
