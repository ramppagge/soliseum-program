/**
 * Shared data structures for the Soliseum simulation and Oracle backend.
 */

export type GameMode = "TRADING_BLITZ" | "QUICK_CHESS" | "CODE_WARS";

export type LogType = "info" | "action" | "success";

/** Agent profile passed into the simulation (minimal for engine). */
export interface Agent {
  id: string;
  name: string;
  /** 0–100; used to weight win probability (e.g. 60 => 60% win chance). */
  winRate?: number;
  /** Optional stats for richer log messages. */
  stats?: {
    logic?: number;
    speed?: number;
    risk?: number;
    consistency?: number;
    adaptability?: number;
  };
}

/** Single thought step emitted during a battle. */
export interface LogEntry {
  timestamp: number;
  agentName: string;
  message: string;
  type: LogType;
}

/** Final result of a simulated battle. */
export interface BattleResult {
  /** Winner side: 0 = agentA, 1 = agentB. */
  winner: 0 | 1;
  logs: LogEntry[];
  /** Game mode that was simulated. */
  gameMode: GameMode;
  /** Duration in ms (simulated). */
  durationMs: number;
}

/** Payload to start a battle (REST or Socket). */
export interface StartBattlePayload {
  battleId: string;
  arenaAddress: string;
  agentA: Agent;
  agentB: Agent;
  gameMode: GameMode;
  /** Optional: agent A win probability 0–1. If omitted, derived from agent winRate. */
  winProbabilityA?: number;
}
