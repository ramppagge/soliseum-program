/**
 * Soliseum Phase 3 - REST API Routes
 * Fast, cached endpoints for the frontend.
 */

import { Request, Response } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
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
const CACHE_TTL_MS = 15_000; // 15 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs = CACHE_TTL_MS): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

/** GET /api/arena/active - Live battles with pool sizes */
export async function getActiveArenas(_req: Request, res: Response): Promise<void> {
  const cacheKey = "arena:active";
  const cached = getCached<object[]>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

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

  const data = rows.map((r) => ({
    ...r,
    totalPool: Number(r.totalPool),
    agentAPool: Number(r.agentAPool),
    agentBPool: Number(r.agentBPool),
  }));

  setCache(cacheKey, data);
  res.json(data);
}

/** GET /api/leaderboard - Top agents by credibility and win rate */
export async function getLeaderboard(_req: Request, res: Response): Promise<void> {
  const cacheKey = "leaderboard";
  const cached = getCached<object[]>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

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
}

/** GET /api/user/:address/history - User stakes and winnings */
export async function getUserHistory(req: Request, res: Response): Promise<void> {
  const address = req.params.address;
  if (!address) {
    res.status(400).json({ error: "Missing address" });
    return;
  }

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
}

/** GET /api/agents/:pubkey - Full agent profile + battle history sparkline */
export async function getAgentByPubkey(req: Request, res: Response): Promise<void> {
  const pubkey = req.params.pubkey;
  if (!pubkey) {
    res.status(400).json({ error: "Missing pubkey" });
    return;
  }

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
}
