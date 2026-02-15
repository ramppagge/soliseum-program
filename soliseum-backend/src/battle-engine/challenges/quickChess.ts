/**
 * Quick Chess - generates mid-game FEN positions for best-move challenges.
 */

import { Chess } from "chess.js";
import type { QuickChessChallenge } from "../types";

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

/** Play random legal moves from start to reach a mid-game position. */
function randomMidgame(seed: number): { fen: string; sideToMove: "w" | "b" } {
  const chess = new Chess();
  const numMoves = 12 + Math.floor(seededRandom(seed) * 16); // 12-27 moves

  for (let i = 0; i < numMoves; i++) {
    const moves = chess.moves();
    if (moves.length === 0) break;
    const idx = Math.floor(seededRandom(seed + i * 31) * moves.length) % moves.length;
    chess.move(moves[idx]!);
  }

  return {
    fen: chess.fen(),
    sideToMove: chess.turn() as "w" | "b",
  };
}

export function generateQuickChessChallenge(seed?: number): {
  challenge: QuickChessChallenge;
} {
  const s = seed ?? Date.now();
  const { fen, sideToMove } = randomMidgame(s);
  return {
    challenge: {
      gameMode: "QUICK_CHESS",
      fen,
      sideToMove,
    },
  };
}
