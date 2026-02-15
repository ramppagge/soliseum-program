/**
 * React Query hooks for Soliseum API.
 */

import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveArenas,
  fetchSettledArenas,
  fetchLeaderboard,
  fetchUserHistory,
  fetchAgentByPubkey,
  fetchGlobalStats,
} from "@/lib/api";

const QUERY_KEYS = {
  arenaActive: ["arena", "active"] as const,
  arenaSettled: ["arena", "settled"] as const,
  leaderboard: ["leaderboard"] as const,
  userHistory: (address: string) => ["user", "history", address] as const,
  agent: (pubkey: string) => ["agent", pubkey] as const,
  globalStats: ["stats", "global"] as const,
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

/** Fetch leaderboard */
export function useLeaderboard(limit = 50) {
  return useQuery({
    queryKey: [...QUERY_KEYS.leaderboard, limit],
    queryFn: () => fetchLeaderboard(limit),
    staleTime: 15_000,
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
