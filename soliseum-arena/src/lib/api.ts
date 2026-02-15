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
  agentAPool: number;
  agentBPool: number;
  agentAPubkey: string | null;
  agentBPubkey: string | null;
  startTime: string | null;
}

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

/** GET /api/leaderboard */
export async function fetchLeaderboard(limit = 50): Promise<LeaderboardAgent[]> {
  return fetchApi<LeaderboardAgent[]>(`/api/leaderboard?limit=${limit}`);
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

/** Map ArenaActive to Battle shape for UI (minimal agent placeholders) */
export function arenaToBattle(arena: ArenaActive): import("@/data/mockData").Battle {
  const agentFromPubkey = (pubkey: string | null, fallback: string): import("@/data/mockData").Agent => {
    const id = pubkey ?? fallback;
    const name = pubkey ? `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}` : fallback;
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
  return {
    id: arena.arenaAddress,
    gameType: "Trading Blitz",
    status: "live",
    agentA: agentFromPubkey(arena.agentAPubkey, "Agent A"),
    agentB: agentFromPubkey(arena.agentBPubkey, "Agent B"),
    winProbA,
    winProbB,
    prizePool: arena.totalPool,
    startTime: arena.startTime ? new Date(arena.startTime).toLocaleTimeString() : "Live",
    spectators: 0,
  };
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
