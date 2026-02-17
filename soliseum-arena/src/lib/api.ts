/**
 * Soliseum API client - fetches from backend REST API.
 */

import { API_URL } from "@/config/soliseum";

// ─── API response types (match backend) ──────────────────────────────────────

export interface ArenaActive {
  id: number;
  arenaAddress: string;
  status: string;
  totalPool: number;
  winnerSide?: number | null;
  agentAPool: number;
  agentBPool: number;
  agentAPubkey: string | null;
  agentBPubkey: string | null;
  agentAName: string | null;
  agentBName: string | null;
  startTime: string | null;
}

// ─── Enhanced Leaderboard Types (Optimized API) ──────────────────────────────

export interface LeaderboardEntry {
  id: number;
  pubkey: string;
  name: string;
  category: "Trading" | "Chess" | "Coding";
  description: string | null;
  total_wins: number;
  total_battles: number;
  win_rate: number;
  credibility_score: number;
  agent_status: string;
  rank: number;
  recent_battles: Array<{
    won: boolean;
    played_at: string;
    arena_id: number;
  }>;
  win_streak: number;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardResponse {
  ok: boolean;
  entries: LeaderboardEntry[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
  category: string;
}

export interface CategoryStats {
  category: string;
  total_agents: number;
  avg_credibility: number;
  top_agent: {
    name: string;
    pubkey: string;
    credibility_score: number;
  };
}

// Legacy type for backward compatibility
export interface LeaderboardAgent {
  pubkey: string;
  name: string;
  description: string | null;
  category: string | null;
  metadataUrl: string | null;
  totalWins: number;
  credibilityScore: number;
  winRate: number;
}

export interface UserStakeHistory {
  stakeId: number;
  amount: number;
  side: number;
  claimed: boolean;
  arenaAddress: string;
  arenaStatus: string;
  won: boolean;
  totalPool: number;
  createdAt: string;
}

export interface AgentProfile {
  pubkey: string;
  name: string;
  description: string | null;
  category: string | null;
  metadataUrl: string | null;
  totalWins: number;
  credibilityScore: number;
  battleHistory: {
    sparkline: number[];
    last7DaysPerformance: number;
    recentBattles: Array<{ won: boolean; playedAt: string }>;
  };
}

export interface AuthNonceResponse {
  ok: boolean;
  nonce: string;
}

export interface AuthVerifyResponse {
  ok: boolean;
  token?: string;
  expiresIn?: number;
  error?: string;
}

export interface BattleStartResponse {
  ok: boolean;
  winner?: number;
  txSignature?: string;
  error?: string;
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchApi<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const { token, ...init } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** GET /api/arena/active */
export async function fetchActiveArenas(): Promise<ArenaActive[]> {
  return fetchApi<ArenaActive[]>("/api/arena/active");
}

/** GET /api/arena/settled - Settled arenas for concluded section */
export async function fetchSettledArenas(): Promise<ArenaActive[]> {
  return fetchApi<ArenaActive[]>("/api/arena/settled");
}

/** GET /api/arena/:address - Single arena (Live or Settled) */
export async function fetchArenaByAddress(address: string): Promise<ArenaActive | null> {
  try {
    return await fetchApi<ArenaActive>(`/api/arena/${encodeURIComponent(address)}`);
  } catch {
    return null;
  }
}

export interface GlobalStats {
  totalSolWon: number;
  battlesSettled: number;
  totalStakers: number;
}

/** GET /api/stats/global */
export async function fetchGlobalStats(): Promise<GlobalStats> {
  return fetchApi<GlobalStats>("/api/stats/global");
}

/** GET /api/leaderboard - Optimized with materialized views */
export async function fetchLeaderboard(
  options: {
    category?: "Trading" | "Chess" | "Coding";
    limit?: number;
    offset?: number;
    minBattles?: number;
    search?: string;
  } = {}
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams();
  if (options.category) params.append("category", options.category);
  if (options.limit) params.append("limit", String(options.limit));
  if (options.offset) params.append("offset", String(options.offset));
  if (options.minBattles) params.append("minBattles", String(options.minBattles));
  if (options.search) params.append("search", options.search);
  
  return fetchApi<LeaderboardResponse>(`/api/leaderboard?${params}`);
}

/** GET /api/leaderboard/hot - Agents with 70%+ win rate */
export async function fetchHotAgents(limit = 10): Promise<LeaderboardEntry[]> {
  const res = await fetchApi<{ ok: boolean; agents: LeaderboardEntry[] }>(`/api/leaderboard/hot?limit=${limit}`);
  return res.agents;
}

/** GET /api/leaderboard/rising - Agents on win streaks */
export async function fetchRisingStars(limit = 10): Promise<LeaderboardEntry[]> {
  const res = await fetchApi<{ ok: boolean; agents: LeaderboardEntry[] }>(`/api/leaderboard/rising?limit=${limit}`);
  return res.agents;
}

/** GET /api/leaderboard/stats - Category statistics */
export async function fetchCategoryStats(): Promise<CategoryStats[]> {
  const res = await fetchApi<{ ok: boolean; stats: CategoryStats[] }>("/api/leaderboard/stats");
  return res.stats;
}

/** GET /api/user/:address/history */
export async function fetchUserHistory(address: string): Promise<UserStakeHistory[]> {
  return fetchApi<UserStakeHistory[]>(`/api/user/${encodeURIComponent(address)}/history`);
}

/** GET /api/agents/:pubkey */
export async function fetchAgentByPubkey(pubkey: string): Promise<AgentProfile> {
  return fetchApi<AgentProfile>(`/api/agents/${encodeURIComponent(pubkey)}`);
}

/** POST /api/auth/nonce */
export async function fetchAuthNonce(walletAddress: string): Promise<AuthNonceResponse> {
  return fetchApi<AuthNonceResponse>("/api/auth/nonce", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });
}

/** POST /api/auth/verify */
export async function fetchAuthVerify(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<AuthVerifyResponse> {
  return fetchApi<AuthVerifyResponse>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ walletAddress, signature, nonce }),
  });
}

/** Map LeaderboardAgent to Agent shape for UI */
export function leaderboardAgentToAgent(la: LeaderboardAgent): import("@/data/mockData").Agent {
  const avatar = la.name.slice(0, 2).toUpperCase();
  const tier = la.credibilityScore >= 80 ? "diamond" : la.credibilityScore >= 60 ? "platinum" : "gold";
  return {
    id: la.pubkey,
    name: la.name,
    avatar,
    tier: tier as "diamond" | "platinum" | "gold" | "silver",
    wins: la.totalWins,
    losses: 0,
    winRate: Math.round((la.winRate ?? 0) * 100),
    stats: { logic: 50, speed: 50, risk: 50, consistency: 50, adaptability: 50 },
    recentPerformance: [],
    totalEarnings: 0,
  };
}

// ─── Matchmaking API ──────────────────────────────────────────────────────────

export interface MatchmakingStatus {
  ok: boolean;
  agent?: {
    pubkey: string;
    name: string;
    category: string;
    elo_rating: number;
    status: string;
  };
  queue?: {
    time_remaining: number;
  };
  battle?: {
    battle_id: string;
    status: string;
    seconds_until_battle: number;
  };
}

export interface ActiveBattle {
  id: number;
  battle_id: string;
  agent_a_pubkey: string;
  agent_b_pubkey: string;
  agent_a_name: string;
  agent_b_name: string;
  agent_a_elo: number;
  agent_b_elo: number;
  category: string;
  game_mode?: string; // Optional for backward compatibility
  status: string;
  seconds_until_battle: number;
  total_stake_a: string;
  total_stake_b: string;
  stake_count_a: number;
  stake_count_b: number;
  arena_address?: string | null; // Optional arena address if battle has on-chain arena
}

export interface ScheduledBattle {
  battle_id: string;
  agent_a_pubkey: string;
  agent_b_pubkey: string;
  agent_a_name: string;
  agent_b_name: string;
  game_mode: string;
  status: string;
  seconds_until_battle: number;
}

// User's registered agents
export interface UserAgent {
  pubkey: string;
  name: string;
  description: string | null;
  category: "Trading" | "Chess" | "Coding";
  apiUrl: string | null;
  metadataUrl: string | null;
  agentStatus: "active" | "inactive";
  totalWins: number;
  totalBattles: number;
  credibilityScore: number;
  createdAt: string;
}

/** GET /api/agents?owner=:address - Fetch user's registered agents */
export async function fetchUserAgents(ownerAddress: string): Promise<UserAgent[]> {
  const res = await fetchApi<{ agents: UserAgent[] }>(`/api/agents?owner=${encodeURIComponent(ownerAddress)}`);
  return res.agents || [];
}

/** POST /api/agents/register - Register a new agent */
export async function registerAgent(
  payload: {
    pubkey: string;
    name: string;
    description: string;
    category: "Trading" | "Chess" | "Coding";
    apiUrl?: string;
    metadataUrl?: string;
  },
  token: string
): Promise<{ ok: boolean; agent: UserAgent }> {
  return fetchApi("/api/agents/register", {
    method: "POST",
    body: JSON.stringify(payload),
    token,
  });
}

/** POST /api/matchmaking/enter - Enter matchmaking queue */
export async function enterMatchmaking(
  agentPubkey: string,
  category: "Trading" | "Chess" | "Coding",
  token: string
): Promise<{ success: boolean; message: string; battle?: ScheduledBattle }> {
  return fetchApi("/api/matchmaking/enter", {
    method: "POST",
    body: JSON.stringify({ agentPubkey, category }),
    token,
  });
}

/** POST /api/matchmaking/leave - Leave matchmaking queue */
export async function leaveMatchmaking(agentPubkey: string, token: string): Promise<boolean> {
  const res = await fetchApi<{ ok: boolean }>("/api/matchmaking/leave", {
    method: "POST",
    body: JSON.stringify({ agentPubkey }),
    token,
  });
  return res.ok;
}

/** GET /api/matchmaking/status/:pubkey - Get agent matchmaking status */
export async function fetchMatchmakingStatus(pubkey: string): Promise<MatchmakingStatus> {
  return fetchApi<MatchmakingStatus>(`/api/matchmaking/status/${encodeURIComponent(pubkey)}`);
}

/** GET /api/matchmaking/battles - List active battles */
export async function fetchActiveBattles(): Promise<{ ok: boolean; battles: ActiveBattle[] }> {
  return fetchApi<{ ok: boolean; battles: ActiveBattle[] }>("/api/matchmaking/battles");
}

/** Map ArenaActive to Battle shape for UI (minimal agent placeholders) */
export function arenaToBattle(arena: ArenaActive): import("@/data/mockData").Battle {
  const agentFromPubkey = (pubkey: string | null, agentName: string | null, fallback: string): import("@/data/mockData").Agent => {
    const id = pubkey ?? fallback;
    const name = agentName ?? (pubkey ? `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}` : fallback);
    const avatar = name.slice(0, 2).toUpperCase();
    return {
      id,
      name,
      avatar,
      tier: "gold",
      wins: 0,
      losses: 0,
      winRate: 50,
      stats: { logic: 50, speed: 50, risk: 50, consistency: 50, adaptability: 50 },
      recentPerformance: [],
      totalEarnings: 0,
    };
  };
  const total = arena.agentAPool + arena.agentBPool;
  const winProbA = total > 0 ? Math.round((arena.agentAPool / total) * 100) : 50;
  const winProbB = 100 - winProbA;
  const agentA = agentFromPubkey(arena.agentAPubkey, arena.agentAName, "Agent A");
  const agentB = agentFromPubkey(arena.agentBPubkey, arena.agentBName, "Agent B");
  const isSettled = arena.status === "Settled";
  const winnerSide = arena.winnerSide;
  return {
    id: arena.arenaAddress,
    gameType: "Trading Blitz",
    status: isSettled ? "concluded" : "live",
    agentA,
    agentB,
    winProbA,
    winProbB,
    prizePool: arena.totalPool,
    startTime: arena.startTime ? new Date(arena.startTime).toLocaleTimeString() : isSettled ? "Ended" : "Live",
    spectators: 0,
    ...(isSettled && winnerSide !== undefined && winnerSide !== null && {
      result: {
        winnerId: winnerSide === 0 ? agentA.id : agentB.id,
        victoryMetric: `Winner: ${winnerSide === 0 ? agentA.name : agentB.name}`,
      },
    }),
  };
}

/** POST /api/arena/sync - Sync arena status from on-chain to DB (fixes stale Live/Settled mismatch) */
export async function fetchSyncArena(arenaAddress: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/arena/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arenaAddress }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? `Sync failed: ${res.statusText}`);
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** POST /api/arena/reset - requires auth token. Resets settled arena to Active. */
export async function fetchResetArena(
  arenaAddress: string,
  token: string
): Promise<{ ok: boolean; txSignature?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/arena/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ arenaAddress }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; txSignature?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Reset failed: ${res.statusText}`);
  }
  return data;
}

/** POST /battle/start - requires auth token */
export async function fetchBattleStart(
  payload: {
    battleId: string;
    arenaAddress: string;
    agentA: { id: string; name: string; winRate?: number };
    agentB: { id: string; name: string; winRate?: number };
    gameMode: "TRADING_BLITZ" | "QUICK_CHESS" | "CODE_WARS";
    winProbabilityA?: number;
  },
  token: string
): Promise<BattleStartResponse> {
  return fetchApi<BattleStartResponse>("/battle/start", {
    method: "POST",
    body: JSON.stringify(payload),
    token,
  });
}
