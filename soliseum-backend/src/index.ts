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
import crypto from "crypto";
import { createServer } from "http";
import { runSimulationWithDefaults } from "./SimulationEngine";
import { SocketManager } from "./SocketManager";
import { SolanaService } from "./SolanaService";
import { MultisigOracleService } from "./MultisigOracleService";
import { OracleCoordinationAPI } from "./api/oracleRoutes";
import type { StartBattlePayload } from "./types";
import { handleSolanaWebhook } from "./webhooks/solanaWebhook";
import {
  getActiveArenas,
  getArenaByAddress,
  getSettledArenas,
  invalidateArenaCaches,
  getLeaderboard,
  getHotAgents,
  getRisingStars,
  getLeaderboardStats,
  refreshLeaderboard,
  getUserHistory,
  getAgentByPubkey,
  getGlobalStats,
  registerAgent,
  updateAgent,
  listAgents,
} from "./api/routes";
import { leaderboardService } from "./services/LeaderboardService";
import { matchmakingService } from "./services/MatchmakingService";
import {
  enterQueue,
  leaveQueue,
  getQueueStatus,
  getActiveBattles,
  getBattle,
  placeStake,
  triggerBattleDebug,
  resetAllBattles,
} from "./api/matchmakingRoutes";
import {
  validate,
  startBattleBody,
  testBattleBody,
  resetArenaBody,
  syncArenaBody,
  activeArenasQuery,
  leaderboardQuery,
  userHistoryParams,
  agentPubkeyParams,
  authNonceBody,
  authVerifyBody,
  registerAgentBody,
  updateAgentBody,
  listAgentsQuery,
  apiLimiter,
  battleLimiter,
  authLimiter,
  webhookLimiter,
  issueNonce,
  verifySignature,
  requireAuth,
  validateSession,
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

// Request ID middleware — attach unique ID for tracing across logs
app.use((req, res, next) => {
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  (req as any).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

// Structured request logging
app.use((req, _res, next) => {
  const u = req.url ?? req.path ?? "";
  const path = u.split("?")[0];
  const requestId = (req as any).requestId ?? "-";
  console.log(JSON.stringify({
    level: "info",
    msg: "request",
    method: req.method,
    path: path || "/",
    requestId,
    ip: req.ip,
    ts: new Date().toISOString(),
  }));
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

const socketManager = new SocketManager();

// Oracle Multisig Configuration
const USE_MULTISIG = process.env.USE_MULTISIG_ORACLE === "true";
const ORACLE_NODE_INDEX = parseInt(process.env.ORACLE_NODE_INDEX ?? "0", 10);

// Initialize either multisig or legacy single-oracle service
let solanaService: SolanaService;
let multisigService: MultisigOracleService | null = null;
let oracleCoordination: OracleCoordinationAPI | null = null;

if (USE_MULTISIG) {
  console.log(`[Oracle] Multisig mode enabled (node ${ORACLE_NODE_INDEX})`);
  multisigService = new MultisigOracleService(
    process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    ORACLE_NODE_INDEX
  );
  oracleCoordination = new OracleCoordinationAPI(multisigService);
  
  // Wrap multisig for legacy compatibility
  solanaService = {
    settleGameOnChain: (arena: string, winner: number) => 
      multisigService!.settleGame(arena, winner),
    resetArenaOnChain: (arena: string) => 
      multisigService!.resetArena(arena, { isCreator: false }),
    getArenaStatus: (arena: string) => 
      multisigService!.getArenaMultisigState(arena).then(s => s.status),
    getArenaOnChainState: (arena: string) => 
      multisigService!.getArenaMultisigState(arena).then(s => ({ 
        status: s.status, 
        winner: s.status === 2 ? 0 : null // Simplified - should fetch actual winner
      })),
  } as SolanaService;
} else {
  console.log("[Oracle] Legacy single-oracle mode");
  solanaService = new SolanaService();
}

// Wire session validation into SocketManager for WebSocket auth
socketManager.setSessionValidator(validateSession);

// Socket.io: same server as Express when SOCKET_PORT === PORT (deployment); else separate server (local dev)
const socketHttpServer = SOCKET_PORT === PORT ? httpServer : createServer();
socketManager.attach(socketHttpServer);

// Pass SocketManager to MatchmakingService for countdown emissions
matchmakingService.setSocketManager(socketManager);

// ─── Concurrency limiter for on-chain settlements ────────────────────────────
const MAX_CONCURRENT_BATTLES = parseInt(process.env.MAX_CONCURRENT_BATTLES ?? "3", 10);
let activeBattles = 0;
const battleQueue: Array<{ resolve: () => void }> = [];

async function acquireBattleSlot(): Promise<void> {
  if (activeBattles < MAX_CONCURRENT_BATTLES) {
    activeBattles++;
    return;
  }
  // Wait for a slot to free up
  await new Promise<void>((resolve) => {
    battleQueue.push({ resolve });
  });
}

function releaseBattleSlot(): void {
  const next = battleQueue.shift();
  if (next) {
    next.resolve(); // Hand the slot to the next waiter
  } else {
    activeBattles--;
  }
}

/** Run one full battle: simulate, stream logs, settle on-chain. Rate-limited to MAX_CONCURRENT_BATTLES. */
async function runBattle(payload: StartBattlePayload): Promise<{ winner: number; txSignature?: string }> {
  await acquireBattleSlot();
  try {
    return await runBattleInner(payload);
  } finally {
    releaseBattleSlot();
  }
}

async function runBattleInner(payload: StartBattlePayload): Promise<{ winner: number; txSignature?: string }> {
  const { battleId, arenaAddress, agentA, agentB, gameMode, winProbabilityA } = payload;

  const { enrichArenaFromBattle } = await import("./webhooks/indexerService");
  enrichArenaFromBattle(
    arenaAddress,
    agentA.id,
    agentB.id,
    agentA.name,
    agentB.name
  ).catch((e) => console.warn("[runBattle] enrichArenaFromBattle:", (e as Error).message));

  const result = runSimulationWithDefaults(agentA, agentB, gameMode, winProbabilityA);

  const ctx = {
    battleId,
    arenaAddress,
    payload,
    result,
  };

  // Stream battle logs (this includes delays between logs)
  await socketManager.streamBattleLogs(ctx);

  // Ensure minimum battle duration for better UX (wait if simulation was too fast)
  const MIN_BATTLE_DURATION_MS = 5000; // 5 seconds minimum
  if (result.durationMs < MIN_BATTLE_DURATION_MS) {
    const waitTime = MIN_BATTLE_DURATION_MS - result.durationMs;
    console.log(`[runBattle] Battle completed too quickly (${result.durationMs}ms), waiting ${waitTime}ms for better UX`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  let txSignature: string | undefined;
  try {
    txSignature = await solanaService.settleGameOnChain(arenaAddress, result.winner);
  } catch (e) {
    console.error("[runBattle] Oracle settle failed:", e);
    throw e;
  }

  // Update DB immediately so arena moves to Concluded (for testing; webhook also does this)
  const { applySettleGame } = await import("./webhooks/indexerService");
  try {
    await applySettleGame(arenaAddress, result.winner);
    console.log(`[runBattle] Arena ${arenaAddress} marked as Settled`);
  } catch (e) {
    console.error("[runBattle] applySettleGame failed:", e);
    // Don't throw - battle is still completed, just DB update failed
  }
  
  // Invalidate caches to ensure frontend sees updated status
  invalidateArenaCaches();
  console.log(`[runBattle] Caches invalidated for arena ${arenaAddress}`);

  return { winner: result.winner, txSignature };
}

// ─── Oracle Coordination (internal, rate-limited) ────────────────────────────
if (oracleCoordination) {
  app.post(
    "/api/oracle/sign",
    apiLimiter,
    (req, res) => oracleCoordination!.handleSignRequest(req, res)
  );
  
  app.post(
    "/api/oracle/sign-reset",
    apiLimiter,
    (req, res) => oracleCoordination!.handleSignResetRequest(req, res)
  );
  
  app.get(
    "/api/oracle/status",
    (req, res) => oracleCoordination!.handleStatusRequest(req, res)
  );
  
  console.log("[Oracle] Coordination endpoints registered");
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
  "/api/stats/global",
  apiLimiter,
  (req, res) => getGlobalStats(req, res)
);

app.get(
  "/api/arena/active",
  apiLimiter,
  validate({ query: activeArenasQuery }),
  (req, res) => getActiveArenas(req, res)
);

app.get(
  "/api/arena/settled",
  apiLimiter,
  (req, res) => getSettledArenas(req, res)
);

app.get(
  "/api/arena/:address",
  apiLimiter,
  (req, res) => getArenaByAddress(req, res)
);

app.post(
  "/api/arena/sync",
  apiLimiter,
  validate({ body: syncArenaBody }),
  async (req, res) => {
    try {
      const { arenaAddress } = req.body as { arenaAddress: string };
      const { status, winner } = await solanaService.getArenaOnChainState(arenaAddress);
      const { syncArenaFromChain } = await import("./webhooks/indexerService");
      await syncArenaFromChain(arenaAddress, status, winner);
      invalidateArenaCaches();
      res.json({ ok: true, status: status === 1 ? "Live" : status === 2 ? "Settled" : "Unknown", winner });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[POST /api/arena/sync]", message);
      res.status(400).json({ ok: false, error: message });
    }
  }
);

app.post(
  "/api/arena/reset",
  apiLimiter,
  requireAuth,
  validate({ body: resetArenaBody }),
  async (req, res) => {
    try {
      const { arenaAddress } = req.body as { arenaAddress: string };
      const onChainStatus = await solanaService.getArenaStatus(arenaAddress);
      const { applyResetArena } = await import("./webhooks/indexerService");
      let txSignature: string | undefined;

      if (onChainStatus === 1) {
        // Already Active on-chain (e.g. was reset before but DB stayed Settled). Sync DB only.
        await applyResetArena(arenaAddress).catch((e) =>
          console.warn("[POST /api/arena/reset] DB sync:", (e as Error).message)
        );
        invalidateArenaCaches();
        return res.json({ ok: true, txSignature: undefined, alreadyActive: true });
      }

      if (onChainStatus !== 2) {
        return res.status(400).json({
          ok: false,
          error: `Arena must be Settled to reset (current status: ${onChainStatus}). Only settled arenas can be reset.`,
        });
      }

      try {
        txSignature = await solanaService.resetArenaOnChain(arenaAddress);
      } catch (resetErr) {
        const errMsg = resetErr instanceof Error ? resetErr.message : String(resetErr);
        if (errMsg.includes("0x1773") || errMsg.includes("6003") || errMsg.includes("InvalidArenaState")) {
          const nowStatus = await solanaService.getArenaStatus(arenaAddress);
          if (nowStatus === 1) {
            await applyResetArena(arenaAddress).catch((e) =>
              console.warn("[POST /api/arena/reset] DB sync:", (e as Error).message)
            );
            invalidateArenaCaches();
            return res.json({ ok: true, txSignature: undefined, alreadyActive: true });
          }
        }
        throw resetErr;
      }
      await applyResetArena(arenaAddress).catch((e) =>
        console.warn("[POST /api/arena/reset] DB update:", (e as Error).message)
      );
      invalidateArenaCaches();
      res.json({ ok: true, txSignature });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[POST /api/arena/reset]", message);
      res.status(400).json({ ok: false, error: message });
    }
  }
);

// ─── Leaderboard Routes (Optimized with Materialized Views) ──────────────────
app.get(
  "/api/leaderboard",
  apiLimiter,
  validate({ query: leaderboardQuery }),
  (req, res) => getLeaderboard(req, res)
);

app.get(
  "/api/leaderboard/hot",
  apiLimiter,
  (req, res) => getHotAgents(req, res)
);

app.get(
  "/api/leaderboard/rising",
  apiLimiter,
  (req, res) => getRisingStars(req, res)
);

app.get(
  "/api/leaderboard/stats",
  apiLimiter,
  (req, res) => getLeaderboardStats(req, res)
);

// ─── Matchmaking Routes (Auto Elo Matchmaking) ───────────────────────────────
app.post(
  "/api/matchmaking/enter",
  apiLimiter,
  requireAuth,
  (req, res) => enterQueue(req, res)
);

app.post(
  "/api/matchmaking/leave",
  apiLimiter,
  requireAuth,
  (req, res) => leaveQueue(req, res)
);

app.get(
  "/api/matchmaking/status/:pubkey",
  apiLimiter,
  (req, res) => getQueueStatus(req, res)
);

app.get(
  "/api/matchmaking/battles",
  apiLimiter,
  (req, res) => getActiveBattles(req, res)
);

app.get(
  "/api/matchmaking/battle/:id",
  apiLimiter,
  (req, res) => getBattle(req, res)
);

app.post(
  "/api/matchmaking/stake",
  apiLimiter,
  requireAuth,
  (req, res) => placeStake(req, res)
);

// Debug endpoint to manually trigger battle
app.post(
  "/api/matchmaking/trigger-battle/:id",
  apiLimiter,
  requireAuth,
  (req, res) => triggerBattleDebug(req, res)
);

// Debug endpoint to reset all battles
app.post(
  "/api/matchmaking/reset-all",
  apiLimiter,
  (req, res) => resetAllBattles(req, res)
);

app.get(
  "/api/user/:address/history",
  apiLimiter,
  validate({ params: userHistoryParams }),
  (req, res) => getUserHistory(req, res)
);

// ─── Agent Registration (authenticated) ──────────────────────────────────────

// Helpful message for GET requests (browser visits)
app.get("/api/agents/register", (_req, res) => {
  res.status(405).json({
    ok: false,
    error: "Method not allowed",
    message: "This endpoint requires POST with a JSON body",
    usage: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer <your_jwt_token>"
      },
      body: {
        pubkey: "<agent_pubkey_base58>",
        name: "Agent Name",
        category: "Trading | Chess | Coding",
        description: "Optional description",
        apiUrl: "Optional agent API URL"
      }
    }
  });
});

app.post(
  "/api/agents/register",
  apiLimiter,
  requireAuth,
  validate({ body: registerAgentBody }),
  (req, res) => registerAgent(req, res)
);

app.put(
  "/api/agents/:pubkey",
  apiLimiter,
  requireAuth,
  validate({ params: agentPubkeyParams, body: updateAgentBody }),
  (req, res) => updateAgent(req, res)
);

app.get(
  "/api/agents",
  apiLimiter,
  validate({ query: listAgentsQuery }),
  (req, res) => listAgents(req, res)
);

app.get(
  "/api/agents/:pubkey",
  apiLimiter,
  validate({ params: agentPubkeyParams }),
  (req, res) => getAgentByPubkey(req, res)
);

// ─── Test Battle (Battle Engine - registered agents or MockAgent fallback) ────
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

      // Resolve agents: if apiUrl not provided inline, look up from DB by pubkey
      const { db: appDb } = await import("./db");
      const { agents: agentsTable } = await import("./db/schema");
      const { eq: eqOp } = await import("drizzle-orm");

      async function resolveApiUrl(id: string, inlineUrl?: string | null): Promise<string | null> {
        if (inlineUrl) return inlineUrl;
        const [row] = await appDb
          .select({ apiUrl: agentsTable.apiUrl, agentStatus: agentsTable.agentStatus })
          .from(agentsTable)
          .where(eqOp(agentsTable.pubkey, id))
          .limit(1);
        if (row?.apiUrl && row.agentStatus === "active") return row.apiUrl;
        return null;
      }

      const resolvedUrlA = await resolveApiUrl(a.id, a.apiUrl);
      const resolvedUrlB = await resolveApiUrl(b.id, b.apiUrl);

      const configA: AgentConfig = { id: a.id, name: a.name, apiUrl: resolvedUrlA };
      const configB: AgentConfig = { id: b.id, name: b.name, apiUrl: resolvedUrlB };

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
    version: "4.0.0",
    oracle_mode: USE_MULTISIG ? "multisig-2-of-3" : "single",
    oracle_node: USE_MULTISIG ? ORACLE_NODE_INDEX : null,
    endpoints: {
      "GET /": "this info",
      "GET /health": "health check",
      "POST /api/auth/nonce": "get auth nonce (body: walletAddress)",
      "POST /api/auth/verify": "verify signature (body: walletAddress, signature, nonce)",
      "POST /battle/start": "start battle [auth required] (body: battleId, arenaAddress, agentA, agentB, gameMode)",
      "POST /api/arena/reset": "reset settled arena to Active [auth required] (body: arenaAddress) - vault must be empty",
      "POST /api/webhooks/solana": "Helius/Shyft webhook (header: x-helius-webhook-secret)",
      "GET /api/arena/active": "live battles with pool sizes",
      "GET /api/leaderboard": "top agents by credibility",
      "GET /api/user/:address/history": "user stakes and winnings",
      "POST /api/agents/register": "register new AI agent [auth required] (body: pubkey, name, category, apiUrl?, description?)",
      "PUT /api/agents/:pubkey": "update agent [auth required, owner only] (body: name?, apiUrl?, agentStatus?)",
      "GET /api/agents": "list registered agents (query: category?, status?, limit?)",
      "GET /api/agents/:pubkey": "agent profile + battle sparkline",
      "POST /api/test-battle": "Battle Engine test (agentA, agentB, gameMode) - streams via Socket.io",
      ...(oracleCoordination ? {
        "POST /api/oracle/sign": "Request settlement signature from this oracle node [multisig only]",
        "POST /api/oracle/sign-reset": "Request reset signature from this oracle node [multisig only]",
        "GET /api/oracle/status": "Get this oracle node's configuration",
      } : {}),
    },
    socket: SOCKET_PORT === PORT
      ? `Socket.io on same URL (single-port mode)`
      : `Use socket.io client at port ${SOCKET_PORT}`,
  });
});

app.get("/health", async (_req, res) => {
  const checks: Record<string, "ok" | "degraded" | "down"> = {
    service: "ok",
    database: "down",
    solanaRpc: "down",
    oracle: USE_MULTISIG ? "ok" : "degraded",
  };

  // Check database connectivity
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }

  // Check Solana RPC connectivity
  try {
    const { Connection } = await import("@solana/web3.js");
    const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    const conn = new Connection(rpcUrl);
    await conn.getLatestBlockhash({ commitment: "confirmed" });
    checks.solanaRpc = "ok";
  } catch {
    checks.solanaRpc = "down";
  }

  const overallStatus =
    checks.database === "ok" && checks.solanaRpc === "ok"
      ? "ok"
      : checks.database === "ok" || checks.solanaRpc === "ok"
        ? "degraded"
        : "down";

  const httpStatus = overallStatus === "ok" ? 200 : overallStatus === "degraded" ? 200 : 503;

  res.status(httpStatus).json({
    status: overallStatus,
    service: "soliseum-oracle",
    uptime: process.uptime(),
    checks,
    activeBattles,
    timestamp: new Date().toISOString(),
  });
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

// ─── Initialize Services ─────────────────────────────────────────────────────

// Validate database connection before starting services
async function validateDatabaseConnection(): Promise<boolean> {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    console.log("[DB] Connection validated successfully");
    return true;
  } catch (error) {
    console.error("[DB] Failed to connect to database:", error);
    console.error("");
    console.error("Make sure your DATABASE_URL is correct.");
    console.error("For Supabase free tier, use the Transaction Pooler:");
    console.error("  postgres://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres");
    return false;
  }
}

// Start services only after DB connection is validated
validateDatabaseConnection().then((connected) => {
  if (!connected) {
    console.error("\n❌ Cannot start server - database connection failed");
    process.exit(1);
  }

  // Start auto-refresh for materialized views (every 30 seconds)
  leaderboardService.startAutoRefresh();
  console.log("[LeaderboardService] Auto-refresh started (30s interval)");

  // Start matchmaking service (Elo-based auto matchmaking)
  matchmakingService.start();
  console.log("[MatchmakingService] Elo matchmaking started");
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

  // Stop services
  leaderboardService.stopAutoRefresh();
  console.log("[Shutdown] Leaderboard auto-refresh stopped");
  
  matchmakingService.stop();
  console.log("[Shutdown] Matchmaking service stopped");

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
