/**
 * Quick Chess validator - legal move check + evaluation.
 * Uses chess.js for legality. Evaluation: piece values + mobility heuristic
 * (Stockfish can be integrated later for stronger evaluation).
 */

import { Chess } from "chess.js";
import type { QuickChessResponse } from "../types";

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/** Simple centipawn evaluation: material + mobility. */
function evaluatePosition(chess: Chess): number {
  const fen = chess.fen();
  const board = chess.board();
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row]?.[col];
      if (!piece) continue;
      const val = PIECE_VALUES[piece.type] ?? 0;
      score += piece.color === "w" ? val : -val;
    }
  }

  // Mobility: more legal moves = better
  const moves = chess.moves();
  const turn = chess.turn();
  score += (turn === "w" ? 1 : -1) * moves.length * 0.1;

  return score * 100; // centipawns
}

export interface QuickChessResult {
  legal: boolean;
  evaluation: number; // centipawns, positive = white better
  error?: string;
}

/** Validate move: must be legal. Score = evaluation after move. */
export function validateQuickChess(
  response: QuickChessResponse,
  fen: string,
  sideToMove: "w" | "b"
): QuickChessResult {
  const moveStr = (response.move || "").trim().toLowerCase();
  if (!moveStr) {
    return { legal: false, evaluation: 0, error: "No move provided" };
  }

  try {
    const chess = new Chess(fen);
    if (chess.turn() !== sideToMove) {
      return { legal: false, evaluation: 0, error: "Wrong side to move" };
    }

    // Parse UCI-style (e2e4) or SAN (e4)
    let move;
    if (moveStr.length >= 4 && moveStr[0]!.match(/[a-h]/) && moveStr[1]!.match(/[1-8]/)) {
      move = chess.move({
        from: moveStr.slice(0, 2) as `${string}${number}`,
        to: moveStr.slice(2, 4) as `${string}${number}`,
        promotion: moveStr[4] as "q" | "r" | "b" | "n" | undefined,
      });
    } else {
      move = chess.move(moveStr);
    }

    if (!move) {
      return { legal: false, evaluation: 0, error: "Illegal move" };
    }

    const rawEval = evaluatePosition(chess);
    // Normalize: positive = better for side that moved
    const evaluation = sideToMove === "w" ? rawEval : -rawEval;
    return { legal: true, evaluation };
  } catch (e) {
    return {
      legal: false,
      evaluation: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
