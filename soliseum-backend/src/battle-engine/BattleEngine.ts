/**
 * Battle Engine - Judge loop for AI Agent API battles.
 * 1. Generate Challenge
 * 2. Broadcast to both agents
 * 3. Collect responses
 * 4. Validate & Score
 * 5. Stream logs + dominance_score via callback
 */

import type { AgentClient } from "./AgentClient";
import type {
  BattleChallenge,
  BattleResponse,
  BattleLogEntry,
  BattleEngineResult,
  AgentSide,
  CodeWarsResponse,
} from "./types";
import type { GameMode } from "../types";
import { generateTradingBlitzChallenge } from "./challenges/tradingBlitz";
import { generateCodeWarsChallenge } from "./challenges/codeWars";
import { generateQuickChessChallenge } from "./challenges/quickChess";
import { validateTradingBlitz } from "./validators/tradingBlitz";
import { validateCodeWars } from "./validators/codeWars";
import { validateQuickChess } from "./validators/quickChess";

export interface BattleEngineOptions {
  /** Called for each log entry (e.g. to emit via Socket.io). */
  onLog?: (log: BattleLogEntry) => void;
  /** Called when dominance score updates (0-100, 50 = tie). */
  onDominance?: (score: number) => void;
  /** Optional seed for reproducible challenges. */
  seed?: number;
}

export class BattleEngine {
  /**
   * Run a full battle between two agents.
   * Returns BattleEngineResult with winner_side and summary.
   */
  async run(
    agentA: AgentClient,
    agentB: AgentClient,
    gameMode: GameMode,
    options: BattleEngineOptions = {}
  ): Promise<BattleEngineResult> {
    const startTime = Date.now();
    const logs: BattleLogEntry[] = [];
    const { onLog, onDominance, seed } = options;
    
    // Define emit outside try block so it's available in catch
    const emit = (side: AgentSide, type: BattleLogEntry["type"], message: string) => {
      const entry: BattleLogEntry = { timestamp: Date.now(), side, type, message };
      logs.push(entry);
      onLog?.(entry);
    };
    
    // Wrap entire battle in try/catch for robust error handling
    try {

    const updateDominance = (scoreA: number, scoreB: number, lowerIsBetter: boolean) => {
      const dominance = lowerIsBetter
        ? scoreB / (scoreA + scoreB + 1e-9)
        : scoreA / (scoreA + scoreB + 1e-9);
      const pct = Math.round(Math.max(0, Math.min(1, dominance)) * 100);
      onDominance?.(pct);
    };

    emit("agent_a", "info", `Battle started: ${gameMode}`);
    emit("agent_b", "info", `Battle started: ${gameMode}`);

    // 1. Generate Challenge
    let challenge: BattleChallenge;
    let groundTruth: unknown;

    if (gameMode === "TRADING_BLITZ") {
      const { challenge: c, groundTruth: gt } = generateTradingBlitzChallenge(seed);
      challenge = c;
      groundTruth = gt;
      emit("agent_a", "info", `Challenge: Predict SOL/USDC price in 5 minutes`);
      emit("agent_b", "info", `Challenge: Predict SOL/USDC price in 5 minutes`);
    } else if (gameMode === "CODE_WARS") {
      const { challenge: c, testCases } = generateCodeWarsChallenge(seed);
      challenge = c;
      groundTruth = testCases;
      emit("agent_a", "info", `Challenge: ${(c as { problem: string }).problem}`);
      emit("agent_b", "info", `Challenge: ${(c as { problem: string }).problem}`);
    } else {
      const { challenge: c } = generateQuickChessChallenge(seed);
      challenge = c;
      groundTruth = c;
      emit("agent_a", "info", `Challenge: Find best move for ${(c as { sideToMove: string }).sideToMove === "w" ? "White" : "Black"}`);
      emit("agent_b", "info", `Challenge: Find best move for ${(c as { sideToMove: string }).sideToMove === "w" ? "White" : "Black"}`);
    }

    // 2. Broadcast to both agents
    emit("agent_a", "info", "Broadcasting challenge...");
    emit("agent_b", "info", "Broadcasting challenge...");

    const [responseA, responseB] = await Promise.all([
      agentA.solve(challenge).catch((e) => {
        emit("agent_a", "error", `Agent A failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }),
      agentB.solve(challenge).catch((e) => {
        emit("agent_b", "error", `Agent B failed: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }),
    ]);

    // Stream agent thought logs
    if (responseA?.logs) {
      for (const msg of responseA.logs) {
        emit("agent_a", "info", msg);
      }
    }
    if (responseB?.logs) {
      for (const msg of responseB.logs) {
        emit("agent_b", "info", msg);
      }
    }

    // 3 & 4. Validate & Score
    let scoreA: number;
    let scoreB: number;
    let lowerIsBetter: boolean;
    let summary: string;

    if (gameMode === "TRADING_BLITZ") {
      const gt = groundTruth as number;
      const resA = responseA ? validateTradingBlitz(responseA as { prediction: number }, gt) : { mae: Infinity, passed: false };
      const resB = responseB ? validateTradingBlitz(responseB as { prediction: number }, gt) : { mae: Infinity, passed: false };
      scoreA = resA.mae;
      scoreB = resB.mae;
      lowerIsBetter = true;
      emit("agent_a", resA.passed ? "success" : "warning", `MAE: ${resA.mae.toFixed(4)} | Ground truth: $${gt}`);
      emit("agent_b", resB.passed ? "success" : "warning", `MAE: ${resB.mae.toFixed(4)} | Ground truth: $${gt}`);
      updateDominance(scoreA, scoreB, true);
      summary = resA.mae < resB.mae
        ? `Agent A won with lower MAE (${resA.mae.toFixed(4)} vs ${resB.mae.toFixed(4)}).`
        : `Agent B won with lower MAE (${resB.mae.toFixed(4)} vs ${resA.mae.toFixed(4)}).`;
    } else if (gameMode === "CODE_WARS") {
      const testCases = groundTruth as Array<{ input: unknown[]; expected: unknown }>;
      const resA = responseA
        ? await validateCodeWars(responseA as CodeWarsResponse, testCases, (challenge as { functionName: string }).functionName)
        : { passed: 0, total: testCases.length, executionTimeMs: 0 };
      const resB = responseB
        ? await validateCodeWars(responseB as CodeWarsResponse, testCases, (challenge as { functionName: string }).functionName)
        : { passed: 0, total: testCases.length, executionTimeMs: 0 };
      scoreA = resA.passed * 10000 - resA.executionTimeMs;
      scoreB = resB.passed * 10000 - resB.executionTimeMs;
      lowerIsBetter = false;
      emit("agent_a", resA.passed === resA.total ? "success" : "warning", `Passed ${resA.passed}/${resA.total} tests in ${resA.executionTimeMs}ms`);
      emit("agent_b", resB.passed === resB.total ? "success" : "warning", `Passed ${resB.passed}/${resB.total} tests in ${resB.executionTimeMs}ms`);
      updateDominance(scoreA, scoreB, false);
      if (resA.passed !== resB.passed) {
        summary = resA.passed > resB.passed
          ? `Agent A won: ${resA.passed}/${resA.total} tests passed vs ${resB.passed}/${resB.total}.`
          : `Agent B won: ${resB.passed}/${resB.total} tests passed vs ${resA.passed}/${resA.total}.`;
      } else {
        summary = resA.executionTimeMs < resB.executionTimeMs
          ? `Agent A won on tiebreak: faster (${resA.executionTimeMs}ms vs ${resB.executionTimeMs}ms).`
          : `Agent B won on tiebreak: faster (${resB.executionTimeMs}ms vs ${resA.executionTimeMs}ms).`;
      }
    } else {
      const qc = challenge as { fen: string; sideToMove: "w" | "b" };
      const resA = responseA ? validateQuickChess(responseA as { move: string }, qc.fen, qc.sideToMove) : { legal: false, evaluation: 0 };
      const resB = responseB ? validateQuickChess(responseB as { move: string }, qc.fen, qc.sideToMove) : { legal: false, evaluation: 0 };
      scoreA = resA.legal ? resA.evaluation : -10000;
      scoreB = resB.legal ? resB.evaluation : -10000;
      lowerIsBetter = false;
      emit("agent_a", resA.legal ? "success" : "error", resA.legal ? `Legal move, eval: ${resA.evaluation} cp` : `Illegal: ${resA.error || "invalid"}`);
      emit("agent_b", resB.legal ? "success" : "error", resB.legal ? `Legal move, eval: ${resB.evaluation} cp` : `Illegal: ${resB.error || "invalid"}`);
      updateDominance(scoreA, scoreB, false);
      summary = resA.legal && resB.legal
        ? (resA.evaluation > resB.evaluation
          ? `Agent A won with better evaluation (+${resA.evaluation} cp vs +${resB.evaluation} cp).`
          : `Agent B won with better evaluation (+${resB.evaluation} cp vs +${resA.evaluation} cp).`)
        : resA.legal
          ? "Agent A won: Agent B played illegal move."
          : resB.legal
            ? "Agent B won: Agent A played illegal move."
            : "Draw: both played illegal moves.";
    }

    const winner: 0 | 1 =
      lowerIsBetter
        ? (scoreA <= scoreB ? 0 : 1)
        : (scoreA >= scoreB ? 0 : 1);

    const durationMs = Date.now() - startTime;
    emit("agent_a", "info", `Battle complete in ${durationMs}ms`);
    emit("agent_b", "info", `Battle complete in ${durationMs}ms`);

    onDominance?.(winner === 0 ? 100 : 0);

    return {
      winner_side: winner,
      gameMode,
      durationMs,
      summary,
      scores: { agent_a: scoreA, agent_b: scoreB },
      logs,
    };
    } catch (error) {
      // Global error handler - ensure battle always returns a result
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      emit("agent_a", "error", `Battle engine error: ${errorMessage}`);
      emit("agent_b", "error", `Battle engine error: ${errorMessage}`);
      
      console.error(`[BattleEngine] Critical error in ${gameMode}:`, error);
      
      // Return default result - Agent A wins on error (can be randomized in future)
      return {
        winner_side: 0,
        gameMode,
        durationMs,
        summary: `Battle failed due to engine error: ${errorMessage}. Agent A wins by default.`,
        scores: { agent_a: 0, agent_b: 0 },
        logs,
      };
    }
  }
}
