/**
 * Simulation engine for AI agent battles.
 * Generates a sequence of theatrical log entries and picks a winner.
 * Supports TRADING_BLITZ, QUICK_CHESS, CODE_WARS.
 *
 * Note: This is a cosmetic log generator for the spectator UI.
 * Real competitive logic lives in BattleEngine.ts.
 */

import type { Agent, BattleResult, GameMode, LogEntry, LogType } from "./types";
import { seededRandom } from "./utils/seededRandom";

const GAME_MODE_MESSAGES: Record<
  GameMode,
  { info: string[]; action: string[]; success: string[] }
> = {
  TRADING_BLITZ: {
    info: [
      "Analyzing order book depth...",
      "Volatility regime detected: high",
      "Calculating position size...",
      "Risk parity check passed",
    ],
    action: [
      "Placing limit order",
      "Adjusting stop-loss",
      "Scaling into position",
      "Taking profit",
    ],
    success: [
      "Trade executed +0.24%",
      "Portfolio rebalanced",
      "Drawdown contained",
    ],
  },
  QUICK_CHESS: {
    info: [
      "Evaluating board state...",
      "Searching depth 12...",
      "Opening book hit",
      "Opponent time pressure",
    ],
    action: [
      "Playing Nf3",
      "Castling kingside",
      "Sacrificing pawn for initiative",
      "Offering exchange",
    ],
    success: [
      "Advantage +0.8",
      "Checkmate sequence found",
      "Opponent resigned",
    ],
  },
  CODE_WARS: {
    info: [
      "Parsing problem constraints...",
      "Identifying optimal complexity",
      "Edge cases enumerated",
      "Test suite analyzed",
    ],
    action: [
      "Implementing solution",
      "Refactoring for clarity",
      "Submitting attempt",
      "Optimizing hot path",
    ],
    success: [
      "All tests passed",
      "Solution accepted",
      "Performance within bounds",
    ],
  },
};

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seed * arr.length) % arr.length];
}

/**
 * Generates a sequence of log entries for a battle and picks a winner.
 * Winner is chosen by weighted random (winProbabilityA).
 */
export function runSimulation(
  agentA: Agent,
  agentB: Agent,
  gameMode: GameMode,
  winProbabilityA: number
): BattleResult {
  const startTime = Date.now();
  const logs: LogEntry[] = [];
  let seed = (startTime + agentA.id.length + agentB.id.length) % 1e6;

  const agents = [agentA, agentB];
  const templates = GAME_MODE_MESSAGES[gameMode];
  const stepsPerAgent = 4;
  const types: LogType[] = ["info", "action", "success"];

  for (let step = 0; step < stepsPerAgent * 2; step++) {
    seed = seededRandom(seed + step);
    const agentIndex = step % 2;
    const agent = agents[agentIndex];
    const type = types[step % 3];
    const messages = type === "info" ? templates.info : type === "action" ? templates.action : templates.success;
    const message = pick(messages, seed);
    const timestamp = Date.now();

    logs.push({
      timestamp,
      agentName: agent.name,
      message,
      type,
    });
  }

  const roll = seededRandom(seed + 1);
  const winner: 0 | 1 = roll < winProbabilityA ? 0 : 1;
  const durationMs = Date.now() - startTime;

  return {
    winner,
    logs,
    gameMode,
    durationMs,
  };
}

/**
 * Convenience wrapper: derives winProbabilityA from agent winRates if not provided.
 */
export function runSimulationWithDefaults(
  agentA: Agent,
  agentB: Agent,
  gameMode: GameMode,
  winProbabilityA?: number
): BattleResult {
  const probA =
    winProbabilityA ??
    (agentA.winRate != null && agentB.winRate != null
      ? agentA.winRate / (agentA.winRate + agentB.winRate)
      : 0.5);
  return runSimulation(agentA, agentB, gameMode, probA);
}
