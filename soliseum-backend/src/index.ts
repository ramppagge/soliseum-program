/**
 * Soliseum Simulation Engine & Oracle Service (Phase 2 + Phase 3)
 * - REST + Socket.io trigger for battles
 * - SimulationEngine runs deterministic battle
 * - SocketManager streams logs to Battle Station (battle:start, battle:log, battle:end)
 * - SolanaService settles winner on-chain
 * - Zod validation, rate limiting, wallet auth
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { SimulationEngine } from "./SimulationEngine";
import { SocketManager } from "./SocketManager";
import { SolanaService } from "./SolanaService";
import type { StartBattlePayload } from "./types";
import { handleSolanaWebhook } from "./webhooks/solanaWebhook";
import {
  getActiveArenas,
  getLeaderboard,
  getUserHistory,
  getAgentByPubkey,
} from "./api/routes";
import {
  validate,
  startBattleBody,
  testBattleBody,
  activeArenasQuery,
  leaderboardQuery,
  userHistoryParams,
  agentPubkeyParams,
  authNonceBody,
  authVerifyBody,
  apiLimiter,
  battleLimiter,
  authLimiter,
  webhookLimiter,
  issueNonce,
  verifySignature,
  requireAuth,
} from "./middleware";
import { BattleEngine, HttpAgentClient, MockAgent } from "./battle-engine";
import type { AgentConfig } from "./battle-engine";

const PORT = parseInt(process.env.PORT ?? "4000", 10);
/** Use same port for Socket.io when SOCKET_PORT unset (e.g. Render/Railway single-port deployment) */
const SOCKET_PORT = process.env.SOCKET_PORT
  ? parseInt(process.env.SOCKET_PORT, 10)
  : PORT;
const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "1mb" }));

// Log every request (helps debug)
app.use((req, _res, next) => {
  const u = req.url ?? req.path ?? "";
  const path = u.split("?")[0];
  console.log("[API]", req.method, path || "(empty)", "→ url:", JSON.stringify(u));
  next();
});

// Normalize root path so router matches: "/ ", "//", "" → "/"
app.use((req, _res, next) => {
  if (req.method !== "GET") return next();
  const parts = (req.url || "/").split("?");
  const pathPart = (parts[0] || "").trim() || "/";
  if (pathPart === "/" || pathPart === "" || pathPart === "//" || pathPart === "/ ") {
    req.url = parts[1] ? "/?" + parts[1] : "/";
  }
  next();
});

const simulationEngine = new SimulationEngine();
const socketManager = new SocketManager();
const solanaService = new SolanaService();

// Socket.io: same server as Express when SOCKET_PORT === PORT (deployment); else separate server (local dev)
const socketHttpServer = SOCKET_PORT === PORT ? httpServer : createServer();
socketManager.attach(socketHttpServer);

/** Run one full battle: simulate, stream logs, settle on-chain. */
async function runBattle(payload: StartBattlePayload): Promise<{ winner: number; txSignature?: string }> {
  const { battleId, arenaAddress, agentA, agentB, gameMode, winProbabilityA } = payload;

  const { enrichArenaFromBattle } = await import("./webhooks/indexerService");
  enrichArenaFromBattle(
    arenaAddress,
    agentA.id,
    agentB.id,
    agentA.name,
    agentB.name
  ).catch((e) => console.warn("[runBattle] enrichArenaFromBattle:", (e as Error).message));

  const result = simulationEngine.run(agentA, agentB, gameMode, winProbabilityA);

  const ctx = {
    battleId,
    arenaAddress,
    payload,
    result,
  };

  await socketManager.streamBattleLogs(ctx);

  let txSignature: string | undefined;
  try {
    txSignature = await solanaService.settleGameOnChain(arenaAddress, result.winner);
  } catch (e) {
    console.error("[runBattle] Oracle settle failed:", e);
    throw e;
  }

  return { winner: result.winner, txSignature };
}

// ─── Auth endpoints (public, rate-limited) ───────────────────────────────────
app.post(
  "/api/auth/nonce",
  authLimiter,
  validate({ body: authNonceBody }),
  issueNonce
);

app.post(
  "/api/auth/verify",
  authLimiter,
  validate({ body: authVerifyBody }),
  verifySignature
);

// ─── Webhook (secret-validated, separate rate limit) ─────────────────────────
app.post(
  "/api/webhooks/solana",
  webhookLimiter,
  (req, res) => handleSolanaWebhook(req, res)
);

// ─── Public data endpoints (rate-limited + validated) ────────────────────────
app.get(
  "/api/arena/active",
  apiLimiter,
  validate({ query: activeArenasQuery }),
  (req, res) => getActiveArenas(req, res)
);

app.get(
  "/api/leaderboard",
  apiLimiter,
  validate({ query: leaderboardQuery }),
  (req, res) => getLeaderboard(req, res)
);

app.get(
  "/api/user/:address/history",
  apiLimiter,
  validate({ params: userHistoryParams }),
  (req, res) => getUserHistory(req, res)
);

app.get(
  "/api/agents/:pubkey",
  apiLimiter,
  validate({ params: agentPubkeyParams }),
  (req, res) => getAgentByPubkey(req, res)
);

// ─── Test Battle (Battle Engine - MockAgent or external APIs) ─────────────────
app.post(
  "/api/test-battle",
  apiLimiter,
  validate({ body: testBattleBody }),
  async (req, res) => {
    const startTime = Date.now();
    try {
      const { agentA: a, agentB: b, gameMode: reqGameMode } = req.body as {
        agentA: { id: string; name: string; apiUrl?: string | null };
        agentB: { id: string; name: string; apiUrl?: string | null };
        gameMode?: "TRADING_BLITZ" | "QUICK_CHESS" | "CODE_WARS";
      };

      const configA: AgentConfig = { id: a.id, name: a.name, apiUrl: a.apiUrl ?? null };
      const configB: AgentConfig = { id: b.id, name: b.name, apiUrl: b.apiUrl ?? null };

      const agentAClient = configA.apiUrl ? new HttpAgentClient(configA) : new MockAgent(configA, 0);
      const agentBClient = configB.apiUrl ? new HttpAgentClient(configB) : new MockAgent(configB, 1);

      const battleId = `test-${Date.now()}`;
      const gameModes: Array<"TRADING_BLITZ" | "QUICK_CHESS" | "CODE_WARS"> = reqGameMode
        ? [reqGameMode]
        : ["TRADING_BLITZ", "CODE_WARS", "QUICK_CHESS"];

      socketManager.getIO()?.emit("battle:start", {
        battleId,
        agentA: { id: a.id, name: a.name },
        agentB: { id: b.id, name: b.name },
        gameMode: gameModes.length === 1 ? gameModes[0] : "multi",
      });

      const engine = new BattleEngine();
      let totalWinnerA = 0;
      let totalWinnerB = 0;

      for (let i = 0; i < 3; i++) {
        const mode = gameModes[i]!;
        const roundResult = await engine.run(agentAClient, agentBClient, mode, {
          onLog: (log) => socketManager.emitBattleEngineLog(battleId, log),
          onDominance: (score) => {
            socketManager.emitBattleDominance(battleId, score);
          },
          seed: Date.now() + i,
        });

        if (roundResult.winner_side === 0) totalWinnerA++;
        else totalWinnerB++;
        await new Promise((r) => setTimeout(r, 3000));
      }

      const finalWinner = totalWinnerA >= totalWinnerB ? 0 : 1;
      const durationMs = Date.now() - startTime;
      const roundCount = gameModes.length;

      socketManager.emitBattleEngineEnd(battleId, {
        winner_side: finalWinner as 0 | 1,
        gameMode: roundCount === 1 ? gameModes[0]! : "multi",
        durationMs,
        summary: `Test battle: Agent ${finalWinner === 0 ? "A" : "B"} won ${Math.max(totalWinnerA, totalWinnerB)}/${roundCount} rounds.`,
        scores: { agent_a: totalWinnerA, agent_b: totalWinnerB },
      });

      res.json({
        ok: true,
        battleId,
        winner_side: finalWinner,
        summary: `Agent ${finalWinner === 0 ? "A" : "B"} won ${Math.max(totalWinnerA, totalWinnerB)}/${roundCount} rounds.`,
        scores: { agent_a: totalWinnerA, agent_b: totalWinnerB },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[POST /api/test-battle]", message);
      res.status(500).json({ ok: false, error: message });
    }
  }
);

// ─── Battle start (authenticated + validated + strict rate limit) ────────────
app.get("/battle/start", (_req, res) => {
  res.status(405).json({
    ok: false,
    error: "Method not allowed",
    message: "Use POST to start a battle. Include Authorization: Bearer <token> and JSON body with battleId, arenaAddress, agentA, agentB, gameMode.",
  });
});

app.post(
  "/battle/start",
  battleLimiter,
  requireAuth,
  validate({ body: startBattleBody }),
  async (req, res) => {
    try {
      const payload = req.body as StartBattlePayload;
      const out = await runBattle(payload);
      res.json({ ok: true, winner: out.winner, txSignature: out.txSignature });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[POST /battle/start]", message);
      res.status(500).json({ ok: false, error: message });
    }
  }
);

// ─── Root info ───────────────────────────────────────────────────────────────
app.get(["/", ""], (_req, res) => {
  res.status(200).json({
    service: "Soliseum Oracle",
    status: "ok",
    version: "3.0.0",
    endpoints: {
      "GET /": "this info",
      "GET /health": "health check",
      "POST /api/auth/nonce": "get auth nonce (body: walletAddress)",
      "POST /api/auth/verify": "verify signature (body: walletAddress, signature, nonce)",
      "POST /battle/start": "start battle [auth required] (body: battleId, arenaAddress, agentA, agentB, gameMode)",
      "POST /api/webhooks/solana": "Helius/Shyft webhook (header: x-helius-webhook-secret)",
      "GET /api/arena/active": "live battles with pool sizes",
      "GET /api/leaderboard": "top agents by credibility",
      "GET /api/user/:address/history": "user stakes and winnings",
      "GET /api/agents/:pubkey": "agent profile + battle sparkline",
      "POST /api/test-battle": "Battle Engine test (agentA, agentB, gameMode) - streams via Socket.io",
    },
    socket: SOCKET_PORT === PORT
      ? `Socket.io on same URL (single-port mode)`
      : `Use socket.io client at port ${SOCKET_PORT}`,
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "soliseum-oracle", uptime: process.uptime() });
});

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

// ─── Socket: battle trigger from Battle Station ──────────────────────────────
const io = socketManager.getIO();
if (io) {
  io.on("connection", (socket) => {
    socket.on("battle:request", async (body: unknown, ack?: (arg: unknown) => void) => {
      try {
        // Validate via Zod for socket payloads too
        const parsed = startBattleBody.safeParse(body);
        if (!parsed.success) {
          ack?.({ ok: false, error: "Validation failed", details: parsed.error.issues });
          return;
        }
        const out = await runBattle(parsed.data);
        ack?.({ ok: true, winner: out.winner, txSignature: out.txSignature });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        ack?.({ ok: false, error: message });
      }
    });
  });
}

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found", path: _req.path });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Express error]", err);
  if (!res.headersSent) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

// ─── Server startup ──────────────────────────────────────────────────────────
httpServer.on("error", (err) => {
  console.error("[API server error]", err);
});

if (SOCKET_PORT !== PORT) {
  socketHttpServer.on("error", (err) => {
    console.error("[Socket server error]", err);
  });
  socketHttpServer.listen(SOCKET_PORT, "0.0.0.0", () => {
    console.log(`Socket.io listening on port ${SOCKET_PORT}`);
  });
}

httpServer.listen(PORT, "0.0.0.0", () => {
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : PORT;
  console.log(`Soliseum Oracle (API) listening on port ${port}`);
  console.log("  GET  /health   — health check");
  console.log("  POST /battle/start — start battle (auth required)");
  if (SOCKET_PORT === PORT) {
    console.log(`  Socket.io: same port ${port} (single-port mode for deployment)`);
  } else {
    console.log(`  Socket.io: port ${SOCKET_PORT}`);
  }
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
function gracefulShutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);

  httpServer.close(() => {
    console.log("[Shutdown] API server closed");
  });

  if (SOCKET_PORT !== PORT) {
    socketHttpServer.close(() => {
      console.log("[Shutdown] Socket server closed");
    });
  }

  // Force exit after 10 seconds if connections linger
  setTimeout(() => {
    console.error("[Shutdown] Forcing exit after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
