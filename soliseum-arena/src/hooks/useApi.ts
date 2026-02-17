/**
 * React Query hooks for Soliseum API.
 */

import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveArenas,
  fetchSettledArenas,
  fetchLeaderboard,
  fetchHotAgents,
  fetchRisingStars,
  fetchCategoryStats,
  fetchUserHistory,
  fetchAgentByPubkey,
  fetchGlobalStats,
} from "@/lib/api";

const QUERY_KEYS = {
  arenaActive: ["arena", "active"] as const,
  arenaSettled: ["arena", "settled"] as const,
  leaderboard: (opts?: object) => ["leaderboard", opts ?? {}] as const,
  hotAgents: ["leaderboard", "hot"] as const,
  risingStars: ["leaderboard", "rising"] as const,
  categoryStats: ["leaderboard", "stats"] as const,
  userHistory: (address: string) => ["user", "history", address] as const,
  agent: (pubkey: string) => ["agent", pubkey] as const,
  globalStats: ["stats", "global"] as const,
  matchmakingStatus: (pubkey: string) => ["matchmaking", "status", pubkey] as const,
  activeBattles: ["matchmaking", "battles"] as const,
};

/** Fetch live arenas - refetch every 15s */
export function useActiveArenas() {
  return useQuery({
    queryKey: QUERY_KEYS.arenaActive,
    queryFn: fetchActiveArenas,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/** Fetch settled arenas - refetch every 15s */
export function useSettledArenas() {
  return useQuery({
    queryKey: QUERY_KEYS.arenaSettled,
    queryFn: fetchSettledArenas,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/** Fetch leaderboard with filtering, pagination */
export function useLeaderboard(options: {
  category?: "Trading" | "Chess" | "Coding";
  limit?: number;
  offset?: number;
  minBattles?: number;
  search?: string;
} = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.leaderboard(options),
    queryFn: () => fetchLeaderboard(options),
    staleTime: 15_000,
  });
}

/** Fetch hot agents (70%+ win rate) */
export function useHotAgents(limit = 10) {
  return useQuery({
    queryKey: [...QUERY_KEYS.hotAgents, limit],
    queryFn: () => fetchHotAgents(limit),
    staleTime: 30_000,
  });
}

/** Fetch rising stars (win streaks) */
export function useRisingStars(limit = 10) {
  return useQuery({
    queryKey: [...QUERY_KEYS.risingStars, limit],
    queryFn: () => fetchRisingStars(limit),
    staleTime: 30_000,
  });
}

/** Fetch category statistics */
export function useCategoryStats() {
  return useQuery({
    queryKey: QUERY_KEYS.categoryStats,
    queryFn: fetchCategoryStats,
    staleTime: 60_000,
  });
}

// ─── Matchmaking Hooks ───────────────────────────────────────────────────────

import {
  fetchMatchmakingStatus,
  fetchActiveBattles,
  enterMatchmaking,
  leaveMatchmaking,
} from "@/lib/api";

/** Fetch matchmaking status for an agent */
export function useMatchmakingStatus(pubkey: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.matchmakingStatus(pubkey ?? ""),
    queryFn: () => fetchMatchmakingStatus(pubkey!),
    enabled: !!pubkey,
    refetchInterval: 3000, // Poll every 3 seconds
    staleTime: 0,
  });
}

/** Fetch active battles */
export function useActiveBattles() {
  return useQuery({
    queryKey: QUERY_KEYS.activeBattles,
    queryFn: fetchActiveBattles,
    refetchInterval: 5000,
    staleTime: 0,
  });
}

/** Fetch user stake history - only when address is provided */
export function useUserHistory(address: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.userHistory(address ?? ""),
    queryFn: () => fetchUserHistory(address!),
    enabled: !!address && address.length >= 32,
    staleTime: 10_000,
  });
}

/** Fetch agent profile by pubkey */
export function useAgentByPubkey(pubkey: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.agent(pubkey ?? ""),
    queryFn: () => fetchAgentByPubkey(pubkey!),
    enabled: !!pubkey && pubkey.length >= 32,
    staleTime: 15_000,
  });
}

/** Fetch global platform stats */
export function useGlobalStats() {
  return useQuery({
    queryKey: QUERY_KEYS.globalStats,
    queryFn: fetchGlobalStats,
    staleTime: 30_000,
  });
}
