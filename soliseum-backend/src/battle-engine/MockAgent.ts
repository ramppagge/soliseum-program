/**
 * MockAgent - simulates AI Agent responses when external APIs are unavailable.
 * Used for UI testing and /api/test-battle.
 */

import { Chess } from "chess.js";
import type { AgentClient } from "./AgentClient";
import type { BattleChallenge, BattleResponse, AgentConfig } from "./types";

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

export class MockAgent implements AgentClient {
  constructor(
    private config: AgentConfig,
    private seedOffset: number = 0
  ) {}

  getConfig(): AgentConfig {
    return this.config;
  }

  async solve(challenge: BattleChallenge): Promise<BattleResponse> {
    // Simulate network delay (100-500ms)
    const delay = 100 + Math.floor(seededRandom(this.seedOffset + Date.now()) * 400);
    await new Promise((r) => setTimeout(r, delay));

    const seed = (Date.now() + this.seedOffset + this.config.id.length) % 1e6;

    switch (challenge.gameMode) {
      case "TRADING_BLITZ": {
        const lastClose = challenge.ohlcv[challenge.ohlcv.length - 1]?.close ?? 100;
        const volatility = 0.002;
        const pred = lastClose * (1 + (seededRandom(seed) - 0.5) * volatility * 2);
        return {
          prediction: Math.round(pred * 100) / 100,
          logs: [
            "[Analyzing RSI...]",
            "[Volume divergence detected]",
            `[Final Prediction: $${pred.toFixed(2)}]`,
          ],
        };
      }

      case "CODE_WARS": {
        const fn = challenge.functionName;
        const lang = challenge.language;
        const mockSolutions: Record<string, string> = {
          reverseString: `function reverseString(s) { return s.split('').reverse().join(''); }`,
          twoSum: `function twoSum(nums, target) { for (let i = 0; i < nums.length; i++) { for (let j = i + 1; j < nums.length; j++) { if (nums[i] + nums[j] === target) return [i, j]; } } return []; }`,
          longestPalindrome: `function longestPalindrome(s) { if (!s) return ""; let best = s[0]; for (let i = 0; i < s.length; i++) { for (let j = i; j < s.length; j++) { const sub = s.slice(i, j+1); if (sub === sub.split('').reverse().join('') && sub.length > best.length) best = sub; } } return best; }`,
        };
        const code = mockSolutions[fn] ?? `function ${fn}(x) { return x; }`;
        return {
          code,
          language: lang,
          logs: ["[Compiling...]", "[Test Case 1: Passed]", "[Optimizing Big O notation...]"],
        };
      }

      case "QUICK_CHESS": {
        try {
          const chess = new Chess(challenge.fen);
          const legalMoves = chess.moves({ verbose: true });
          const move =
            legalMoves.length > 0
              ? legalMoves[Math.floor(seededRandom(seed) * legalMoves.length) % legalMoves.length]
              : null;
          const moveStr = move ? `${move.from}${move.to}${move.promotion ?? ""}` : "e2e4";
          return {
            move: moveStr,
            logs: ["[Evaluating board...]", "[Scanning checkmate threats]", `[Executing: ${moveStr}]`],
          };
        } catch {
          return {
            move: "e2e4",
            logs: ["[Evaluating board...]", "[Scanning checkmate threats]", "[Executing: e2e4]"],
          };
        }
      }
    }
  }
}
