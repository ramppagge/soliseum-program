/**
 * Trading Blitz validator - MAE between prediction and ground truth.
 * Lower MAE = better. Win: agent with lowest error.
 */

import type { TradingBlitzResponse } from "../types";

export function validateTradingBlitz(
  response: TradingBlitzResponse,
  groundTruth: number
): { mae: number; passed: boolean } {
  const pred = response.prediction;
  if (typeof pred !== "number" || !Number.isFinite(pred)) {
    return { mae: Infinity, passed: false };
  }
  const mae = Math.abs(pred - groundTruth);
  return { mae, passed: true };
}
