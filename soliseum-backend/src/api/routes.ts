/**
 * Soliseum Phase 3 - REST API Routes
 * Fast, cached endpoints for the frontend.
 */

import { Request, Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  agents,
  arenas,
  stakes,
  users,
  agentBattleHistory,
} from "../db/schema";

// Simple in-memory cache (use Redis in production)
const cache = new Map<string, { data: unknown; expires: number }>();

/** Batch-resolve agent names from the agents table by pubkey. */
async function resolveAgentNames(pubkeys: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (pubkeys.length === 0) return result;
  const rows = await db
    .select({ pubkey: agents.pubkey, name: agents.name })
    .from(agents);
  for (const r of rows) {
    if (pubkeys.includes(r.pubkey)) result.set(r.pubkey, r.name);
  }
  return result;
}
const CACHE_TTL_MS = 15_000; // 15 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs = CACHE_TTL_MS): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

export function invalidateArenaCaches(): void {
  cache.delete("arena:active");
  cache.delete("arena:settled");
}

function handleDbError(err: unknown, res: Response, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[API] ${context}:`, message);
  if (!res.headersSent) {
    res.status(500).json({
      error: "Database unavailable",
      details: process.env.NODE_ENV === "development" ? message : undefined,
    });
  }
}

/** GET /api/stats/global - Global platform stats for social proof */
export async function getGlobalStats(_req: Request, res: Response): Promise<void> {
  const cacheKey = "stats:global";
  const cached = getCached<object>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const [settledCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(arenas)
      .where(eq(arenas.status, "Settled"));

    const [stakersCount] = await db
      .select({ count: sql<number>`count(distinct ${stakes.userAddress})::int` })
      .from(stakes);

    const wonStakes = await db
      .select({
        amount: stakes.amount,
        side: stakes.side,
        winnerSide: arenas.winnerSide,
      })
      .from(stakes)
      .innerJoin(arenas, eq(stakes.arenaId, arenas.id))
      .where(eq(stakes.claimed, true));

    // Use BigInt accumulation to preserve full lamport precision, convert to SOL at the end
    const totalLamportsWon = wonStakes
      .filter((s) => s.winnerSide !== null && s.side === s.winnerSide)
      .reduce((sum, s) => sum + BigInt(s.amount), 0n);

    const data = {
      totalSolWon: Number(totalLamportsWon) / 1e9, // lamports to SOL
      battlesSettled: settledCount?.count ?? 0,
      totalStakers: stakersCount?.count ?? 0,
    };

    setCache(cacheKey, data, 30_000);
    res.json(data);
  } catch (err) {
    handleDbError(err, res, "getGlobalStats");
  }
}

/** GET /api/arena/active - Live battles with pool sizes */
export async function getActiveArenas(_req: Request, res: Response): Promise<void> {
  const cacheKey = "arena:active";
  const cached = getCached<object[]>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
  const rows = await db
    .select({
      id: arenas.id,
      arenaAddress: arenas.arenaAddress,
      status: arenas.status,
      totalPool: arenas.totalPool,
      agentAPool: arenas.agentAPool,
      agentBPool: arenas.agentBPool,
      agentAPubkey: arenas.agentAPubkey,
      agentBPubkey: arenas.agentBPubkey,
      startTime: arenas.startTime,
    })
    .from(arenas)
    .where(eq(arenas.status, "Live"))
    .orderBy(desc(arenas.createdAt));

  // Resolve agent names from DB
  const agentPubkeys = new Set<string>();
  for (const r of rows) {
    if (r.agentAPubkey) agentPubkeys.add(r.agentAPubkey);
    if (r.agentBPubkey) agentPubkeys.add(r.agentBPubkey);
  }
  const agentNames = await resolveAgentNames(Array.from(agentPubkeys));

  const data = rows.map((r) => ({
    ...r,
    totalPool: Number(r.totalPool),
    agentAPool: Number(r.agentAPool),
    agentBPool: Number(r.agentBPool),
    agentAName: r.agentAPubkey ? agentNames.get(r.agentAPubkey) ?? null : null,
    agentBName: r.agentBPubkey ? agentNames.get(r.agentBPubkey) ?? null : null,
  }));

  setCache(cacheKey, data);
  res.json(data);
  } catch (err) {
    handleDbError(err, res, "getActiveArenas");
  }
}

/** GET /api/arena/settled - Settled arenas for concluded battles section */
export async function getSettledArenas(_req: Request, res: Response): Promise<void> {
  const cacheKey = "arena:settled";
  const cached = getCached<object[]>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const rows = await db
      .select({
        id: arenas.id,
        arenaAddress: arenas.arenaAddress,
        status: arenas.status,
        totalPool: arenas.totalPool,
        agentAPool: arenas.agentAPool,
        agentBPool: arenas.agentBPool,
        agentAPubkey: arenas.agentAPubkey,
        agentBPubkey: arenas.agentBPubkey,
        startTime: arenas.startTime,
        winnerSide: arenas.winnerSide,
        updatedAt: arenas.updatedAt,
      })
      .from(arenas)
      .where(eq(arenas.status, "Settled"))
      .orderBy(desc(arenas.updatedAt));

    // Resolve agent names from DB
    const settledPubkeys = new Set<string>();
    for (const r of rows) {
      if (r.agentAPubkey) settledPubkeys.add(r.agentAPubkey);
      if (r.agentBPubkey) settledPubkeys.add(r.agentBPubkey);
    }
    const settledAgentNames = await resolveAgentNames(Array.from(settledPubkeys));

    const data = rows.map((r) => ({
      ...r,
      totalPool: Number(r.totalPool),
      agentAPool: Number(r.agentAPool),
      agentBPool: Number(r.agentBPool),
      agentAName: r.agentAPubkey ? settledAgentNames.get(r.agentAPubkey) ?? null : null,
      agentBName: r.agentBPubkey ? settledAgentNames.get(r.agentBPubkey) ?? null : null,
    }));

    setCache(cacheKey, data, 10_000);
    res.json(data);
  } catch (err) {
    handleDbError(err, res, "getSettledArenas");
  }
}

/** GET /api/arena/:address - Single arena by address (Live or Settled) */
export async function getArenaByAddress(req: Request, res: Response): Promise<void> {
  const address = req.params?.address as string;
  if (!address || address.length < 32) {
    res.status(400).json({ error: "Invalid arena address" });
    return;
  }

  try {
    const [row] = await db
      .select({
        id: arenas.id,
        arenaAddress: arenas.arenaAddress,
        status: arenas.status,
        totalPool: arenas.totalPool,
        agentAPool: arenas.agentAPool,
        agentBPool: arenas.agentBPool,
        agentAPubkey: arenas.agentAPubkey,
        agentBPubkey: arenas.agentBPubkey,
        startTime: arenas.startTime,
        winnerSide: arenas.winnerSide,
      })
      .from(arenas)
      .where(eq(arenas.arenaAddress, address))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Arena not found" });
      return;
    }

    // Resolve agent names
    const addrPubkeys: string[] = [];
    if (row.agentAPubkey) addrPubkeys.push(row.agentAPubkey);
    if (row.agentBPubkey) addrPubkeys.push(row.agentBPubkey);
    const addrAgentNames = await resolveAgentNames(addrPubkeys);

    res.json({
      ...row,
      totalPool: Number(row.totalPool),
      agentAPool: Number(row.agentAPool),
      agentBPool: Number(row.agentBPool),
      agentAName: row.agentAPubkey ? addrAgentNames.get(row.agentAPubkey) ?? null : null,
      agentBName: row.agentBPubkey ? addrAgentNames.get(row.agentBPubkey) ?? null : null,
    });
  } catch (err) {
    handleDbError(err, res, "getArenaByAddress");
  }
}

/** GET /api/leaderboard - Top agents by credibility and win rate */
export async function getLeaderboard(_req: Request, res: Response): Promise<void> {
  const cacheKey = "leaderboard";
  const cached = getCached<object[]>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
  const limit = Math.min(
    parseInt(String(_req.query?.limit ?? 50), 10) || 50,
    100
  );

  const rows = await db
    .select({
      pubkey: agents.pubkey,
      name: agents.name,
      description: agents.description,
      category: agents.category,
      metadataUrl: agents.metadataUrl,
      totalWins: agents.totalWins,
      credibilityScore: agents.credibilityScore,
    })
    .from(agents)
    .orderBy(
      desc(agents.credibilityScore),
      desc(agents.totalWins)
    )
    .limit(limit);

  const data = rows.map((r) => ({
    ...r,
    winRate: r.totalWins > 0 ? r.totalWins / (r.totalWins + 1) : 0, // Approximate
  }));

  setCache(cacheKey, data);
  res.json(data);
  } catch (err) {
    handleDbError(err, res, "getLeaderboard");
  }
}

/** GET /api/user/:address/history - User stakes and winnings */
export async function getUserHistory(req: Request, res: Response): Promise<void> {
  const address = req.params.address;
  if (!address) {
    res.status(400).json({ error: "Missing address" });
    return;
  }

  try {
  const cacheKey = `user:history:${address}`;
  const cached = getCached<object[]>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const rows = await db
    .select({
      stakeId: stakes.id,
      amount: stakes.amount,
      side: stakes.side,
      claimed: stakes.claimed,
      arenaAddress: arenas.arenaAddress,
      arenaStatus: arenas.status,
      winnerSide: arenas.winnerSide,
      totalPool: arenas.totalPool,
      createdAt: stakes.createdAt,
    })
    .from(stakes)
    .innerJoin(arenas, eq(stakes.arenaId, arenas.id))
    .where(eq(stakes.userAddress, address))
    .orderBy(desc(stakes.createdAt))
    .limit(100);

  const data = rows.map((r) => ({
    stakeId: r.stakeId,
    amount: Number(r.amount),
    side: r.side,
    claimed: r.claimed,
    arenaAddress: r.arenaAddress,
    arenaStatus: r.arenaStatus,
    won: r.arenaStatus === "Settled" && r.winnerSide !== null && r.winnerSide === r.side,
    totalPool: Number(r.totalPool),
    createdAt: r.createdAt,
  }));

  setCache(cacheKey, data, 10_000);
  res.json(data);
  } catch (err) {
    handleDbError(err, res, "getUserHistory");
  }
}

// ─── Agent Registration ──────────────────────────────────────────────────────

const AGENT_HEALTH_TIMEOUT_MS = 10_000;

/**
 * Ping an agent's API URL to verify it is reachable and returns a valid response.
 * Returns true if the endpoint responds with 2xx within the timeout.
 */
async function verifyAgentApiHealth(apiUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGENT_HEALTH_TIMEOUT_MS);
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: { gameMode: "TRADING_BLITZ", ohlcv: [], horizonMinutes: 5 } }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, error: `Agent API returned HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("AbortError") || msg.includes("abort")) {
      return { ok: false, error: `Agent API timed out after ${AGENT_HEALTH_TIMEOUT_MS}ms` };
    }
    return { ok: false, error: `Agent API unreachable: ${msg}` };
  }
}

/** POST /api/agents/register - Register a new AI agent (auth required). */
export async function registerAgent(req: Request, res: Response): Promise<void> {
  const ownerAddress = (req as any).walletAddress as string | undefined;
  if (!ownerAddress) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { pubkey, name, description, category, apiUrl, metadataUrl } = req.body as {
    pubkey: string;
    name: string;
    description?: string;
    category: "Trading" | "Chess" | "Coding";
    apiUrl?: string;
    metadataUrl?: string;
  };

  try {
    // Check if pubkey already exists
    const [existing] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.pubkey, pubkey))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Agent with this pubkey already registered" });
      return;
    }

    // If apiUrl provided, verify it is reachable
    if (apiUrl) {
      const health = await verifyAgentApiHealth(apiUrl);
      if (!health.ok) {
        res.status(422).json({
          error: "Agent API health check failed",
          details: health.error,
          hint: "Ensure your API accepts POST { challenge } and responds with { response }. It must be publicly reachable.",
        });
        return;
      }
    }

    const [inserted] = await db
      .insert(agents)
      .values({
        pubkey,
        name,
        description: description ?? null,
        category,
        apiUrl: apiUrl ?? null,
        metadataUrl: metadataUrl ?? null,
        ownerAddress,
        agentStatus: "active",
      })
      .returning({
        id: agents.id,
        pubkey: agents.pubkey,
        name: agents.name,
        category: agents.category,
        apiUrl: agents.apiUrl,
        agentStatus: agents.agentStatus,
        createdAt: agents.createdAt,
      });

    // Invalidate leaderboard cache
    cache.delete("leaderboard");

    res.status(201).json({ ok: true, agent: inserted });
  } catch (err) {
    handleDbError(err, res, "registerAgent");
  }
}

/** PUT /api/agents/:pubkey - Update agent (owner only). */
export async function updateAgent(req: Request, res: Response): Promise<void> {
  const ownerAddress = (req as any).walletAddress as string | undefined;
  if (!ownerAddress) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const pubkey = req.params.pubkey;
  if (!pubkey) {
    res.status(400).json({ error: "Missing pubkey" });
    return;
  }

  try {
    // Verify ownership
    const [agent] = await db
      .select({ id: agents.id, ownerAddress: agents.ownerAddress })
      .from(agents)
      .where(eq(agents.pubkey, pubkey))
      .limit(1);

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (agent.ownerAddress && agent.ownerAddress !== ownerAddress) {
      res.status(403).json({ error: "Only the agent owner can update this agent" });
      return;
    }

    const { name, description, category, apiUrl, metadataUrl, agentStatus } = req.body as {
      name?: string;
      description?: string;
      category?: "Trading" | "Chess" | "Coding";
      apiUrl?: string | null;
      metadataUrl?: string | null;
      agentStatus?: "active" | "inactive";
    };

    // If updating apiUrl, verify the new endpoint
    if (apiUrl) {
      const health = await verifyAgentApiHealth(apiUrl);
      if (!health.ok) {
        res.status(422).json({
          error: "Agent API health check failed",
          details: health.error,
        });
        return;
      }
    }

    // Build update set — only include provided fields
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateSet.name = name;
    if (description !== undefined) updateSet.description = description;
    if (category !== undefined) updateSet.category = category;
    if (apiUrl !== undefined) updateSet.apiUrl = apiUrl;
    if (metadataUrl !== undefined) updateSet.metadataUrl = metadataUrl;
    if (agentStatus !== undefined) updateSet.agentStatus = agentStatus;

    // Claim ownership if agent has no owner (e.g. auto-created from battle)
    if (!agent.ownerAddress) {
      updateSet.ownerAddress = ownerAddress;
    }

    await db
      .update(agents)
      .set(updateSet)
      .where(eq(agents.pubkey, pubkey));

    // Invalidate caches
    cache.delete("leaderboard");
    cache.delete(`agent:${pubkey}`);

    const [updated] = await db
      .select()
      .from(agents)
      .where(eq(agents.pubkey, pubkey))
      .limit(1);

    res.json({ ok: true, agent: updated });
  } catch (err) {
    handleDbError(err, res, "updateAgent");
  }
}

/** GET /api/agents - List all registered agents with optional filters. */
export async function listAgents(req: Request, res: Response): Promise<void> {
  try {
    const category = req.query?.category as string | undefined;
    const status = (req.query?.status as string | undefined) ?? "active";
    const limit = Math.min(parseInt(String(req.query?.limit ?? 50), 10) || 50, 100);

    const cacheKey = `agents:list:${category ?? "all"}:${status}:${limit}`;
    const cached = getCached<object[]>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    let query = db
      .select({
        pubkey: agents.pubkey,
        name: agents.name,
        description: agents.description,
        category: agents.category,
        apiUrl: agents.apiUrl,
        metadataUrl: agents.metadataUrl,
        agentStatus: agents.agentStatus,
        totalWins: agents.totalWins,
        totalBattles: agents.totalBattles,
        credibilityScore: agents.credibilityScore,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .orderBy(desc(agents.credibilityScore), desc(agents.totalWins))
      .limit(limit)
      .$dynamic();

    if (status) {
      query = query.where(eq(agents.agentStatus, status as "active" | "inactive" | "suspended"));
    }

    const rows = await query;

    const data = rows
      .filter((r) => !category || r.category === category)
      .map((r) => ({
        ...r,
        hasApi: !!r.apiUrl,
        winRate: r.totalBattles > 0 ? r.totalWins / r.totalBattles : 0,
      }));

    setCache(cacheKey, data, 10_000);
    res.json(data);
  } catch (err) {
    handleDbError(err, res, "listAgents");
  }
}

// ─── Agent Profile ───────────────────────────────────────────────────────────

/** GET /api/agents/:pubkey - Full agent profile + battle history sparkline */
export async function getAgentByPubkey(req: Request, res: Response): Promise<void> {
  const pubkey = req.params.pubkey;
  if (!pubkey) {
    res.status(400).json({ error: "Missing pubkey" });
    return;
  }

  try {
  const cacheKey = `agent:${pubkey}`;
  const cached = getCached<object>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.pubkey, pubkey))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const history = await db
    .select({
      won: agentBattleHistory.won,
      playedAt: agentBattleHistory.playedAt,
    })
    .from(agentBattleHistory)
    .where(eq(agentBattleHistory.agentPubkey, pubkey))
    .orderBy(desc(agentBattleHistory.playedAt))
    .limit(30);

  const sparkline = history
    .reverse()
    .map((h) => (h.won ? 1 : 0));

  const last7Days = history
    .filter((h) => {
      const d = h.playedAt ? new Date(h.playedAt) : null;
      if (!d) return false;
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    })
    .map((h) => (h.won ? 1 : 0));

  const data = {
    ...agent,
    totalWins: agent.totalWins,
    credibilityScore: agent.credibilityScore,
    battleHistory: {
      sparkline,
      last7DaysPerformance:
        last7Days.length > 0
          ? last7Days.reduce<number>((a, b) => a + b, 0) / last7Days.length
          : 0,
      recentBattles: history.slice(0, 10),
    },
  };

  setCache(cacheKey, data, 10_000);
  res.json(data);
  } catch (err) {
    handleDbError(err, res, "getAgentByPubkey");
  }
}
