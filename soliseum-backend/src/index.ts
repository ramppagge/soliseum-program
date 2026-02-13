/**
 * Soliseum Simulation Engine & Oracle Service (Phase 2)
 * - REST + Socket.io trigger for battles
 * - SimulationEngine runs deterministic battle
 * - SocketManager streams logs to Battle Station (battle:start, battle:log, battle:end)
 * - SolanaService settles winner on-chain
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

const PORT = parseInt(process.env.PORT ?? "4000", 10);
const SOCKET_PORT = parseInt(process.env.SOCKET_PORT ?? "4001", 10);
const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());

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

// Socket.io on its own server (port 4001). Browsers: do NOT open 4001 in a tab — it's for socket.io client only and may hang.
const socketHttpServer = createServer();
socketManager.attach(socketHttpServer);

/** Validate and normalize payload from body or socket. */
function normalizePayload(body: unknown): StartBattlePayload {
  const b = body as Record<string, unknown>;
  if (!b || typeof b.battleId !== "string" || typeof b.arenaAddress !== "string") {
    throw new Error("Missing or invalid battleId / arenaAddress");
  }
  if (!b.agentA || typeof (b.agentA as any).name !== "string") {
    throw new Error("Invalid agentA");
  }
  if (!b.agentB || typeof (b.agentB as any).name !== "string") {
    throw new Error("Invalid agentB");
  }
  const gameMode = (b.gameMode as StartBattlePayload["gameMode"]) ?? "TRADING_BLITZ";
  const validModes: StartBattlePayload["gameMode"][] = ["TRADING_BLITZ", "QUICK_CHESS", "CODE_WARS"];
  const mode = validModes.includes(gameMode) ? gameMode : "TRADING_BLITZ";

  return {
    battleId: b.battleId as string,
    arenaAddress: b.arenaAddress as string,
    agentA: b.agentA as StartBattlePayload["agentA"],
    agentB: b.agentB as StartBattlePayload["agentB"],
    gameMode: mode,
    winProbabilityA: typeof b.winProbabilityA === "number" ? b.winProbabilityA : undefined,
  };
}

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

// Phase 3: Webhook & Data API
app.post("/api/webhooks/solana", (req, res) => handleSolanaWebhook(req, res));

app.get("/api/arena/active", (req, res) => getActiveArenas(req, res));
app.get("/api/leaderboard", (req, res) => getLeaderboard(req, res));
app.get("/api/user/:address/history", (req, res) => getUserHistory(req, res));
app.get("/api/agents/:pubkey", (req, res) => getAgentByPubkey(req, res));

// REST: start a battle
app.post("/battle/start", async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const out = await runBattle(payload);
    res.json({ ok: true, winner: out.winner, txSignature: out.txSignature });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /battle/start]", message);
    res.status(400).json({ ok: false, error: message });
  }
});

// Root — match both "/" and "" so browser always gets 200 (same pattern as /health)
app.get(["/", ""], (_req, res) => {
  res.status(200).json({
    service: "Soliseum Oracle",
    status: "ok",
    endpoints: {
      "GET /": "this info",
      "GET /health": "health check",
      "POST /battle/start": "start battle (body: battleId, arenaAddress, agentA, agentB, gameMode)",
      "POST /api/webhooks/solana": "Helius/Shyft webhook (header: x-helius-webhook-secret)",
      "GET /api/arena/active": "live battles with pool sizes",
      "GET /api/leaderboard": "top agents by credibility",
      "GET /api/user/:address/history": "user stakes and winnings",
      "GET /api/agents/:pubkey": "agent profile + battle sparkline",
    },
    socket: `Use socket.io client at http://localhost:${SOCKET_PORT} (do not open 4001 in browser).`,
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "soliseum-oracle" });
});

// Favicon so browser doesn't request it and get 404
app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

// Socket: optional trigger for starting a battle from the Battle Station
const io = socketManager.getIO();
if (io) {
  io.on("connection", (socket) => {
    socket.on("battle:request", async (body: unknown, ack?: (arg: unknown) => void) => {
      try {
        const payload = normalizePayload(body);
        const out = await runBattle(payload);
        ack?.({ ok: true, winner: out.winner, txSignature: out.txSignature });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        ack?.({ ok: false, error: message });
      }
    });
  });
}

// 404 for unknown routes (always send valid HTTP)
app.use((_req, res) => {
  res.status(404).json({ error: "Not found", path: _req.path });
});

// Global error handler so we never leave the client with an invalid response
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Express error]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

socketHttpServer.on("error", (err) => {
  console.error("[Socket server error]", err);
});

httpServer.on("error", (err) => {
  console.error("[API server error]", err);
});

socketHttpServer.listen(SOCKET_PORT, "0.0.0.0", () => {
  console.log(`Socket.io listening on http://localhost:${SOCKET_PORT}`);
});

httpServer.listen(PORT, "0.0.0.0", () => {
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : PORT;
  console.log(`Soliseum Oracle (API) listening on http://localhost:${port}`);
  console.log("  Open in browser: http://localhost:" + port + "/");
  console.log("  GET  /health   — health check");
  console.log("  POST /battle/start — start battle");
  console.log(`  Socket.io: port ${SOCKET_PORT} (use socket.io client only; do not open in browser)`);
});
