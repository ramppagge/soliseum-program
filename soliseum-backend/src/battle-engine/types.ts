/**
 * Battle Engine types - extended from core types for AI Agent API battles.
 */

import type { GameMode } from "../types";

export type LogType = "info" | "success" | "warning" | "error";
export type AgentSide = "agent_a" | "agent_b";

/** Streamed log entry with type and side for UI. */
export interface BattleLogEntry {
  timestamp: number;
  side: AgentSide;
  type: LogType;
  message: string;
}

/** Agent API configuration - external URL or mock. */
export interface AgentConfig {
  id: string;
  name: string;
  /** External API URL - if null, use MockAgent. */
  apiUrl: string | null;
  winRate?: number;
}

/** Challenge sent to agents (game-mode specific). */
export interface TradingBlitzChallenge {
  gameMode: "TRADING_BLITZ";
  ohlcv: Array<{ open: number; high: number; low: number; close: number; volume: number; timestamp: number }>;
  horizonMinutes: number;
}

export interface CodeWarsChallenge {
  gameMode: "CODE_WARS";
  problem: string;
  language: "javascript" | "python";
  functionName: string;
}

export interface QuickChessChallenge {
  gameMode: "QUICK_CHESS";
  fen: string;
  sideToMove: "w" | "b";
}

export type BattleChallenge = TradingBlitzChallenge | CodeWarsChallenge | QuickChessChallenge;

/** Agent response types (game-mode specific). */
export interface TradingBlitzResponse {
  prediction: number;
  logs?: string[];
}

export interface CodeWarsResponse {
  code: string;
  language: "javascript" | "python";
  logs?: string[];
}

export interface QuickChessResponse {
  move: string; // e.g. "e2e4", "g1f3"
  logs?: string[];
}

export type BattleResponse = TradingBlitzResponse | CodeWarsResponse | QuickChessResponse;

/** Validation result per agent. */
export interface AgentScore {
  side: AgentSide;
  passed: boolean;
  score: number; // MAE (lower=better), test passes (higher=better), eval (higher=better)
  executionTimeMs?: number;
  error?: string;
}

/** Final battle result for smart contract. */
export interface BattleEngineResult {
  winner_side: 0 | 1; // 0 = agent_a, 1 = agent_b
  gameMode: GameMode;
  durationMs: number;
  summary: string;
  scores: { agent_a: number; agent_b: number };
  logs: BattleLogEntry[];
}
