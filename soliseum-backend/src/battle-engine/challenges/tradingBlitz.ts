/**
 * Trading Blitz - generates OHLCV challenge and ground truth for SOL/USDC.
 */

import type { TradingBlitzChallenge } from "../types";
import { seededRandom } from "../../utils/seededRandom";

/** Generate 50 OHLCV data points + ground truth (price 5 min later). */
export function generateTradingBlitzChallenge(seed?: number): {
  challenge: TradingBlitzChallenge;
  groundTruth: number;
} {
  const s = seed ?? Date.now();
  const basePrice = 140 + seededRandom(s) * 20; // ~140-160 SOL/USDC
  const ohlcv: TradingBlitzChallenge["ohlcv"] = [];
  let price = basePrice;

  for (let i = 0; i < 50; i++) {
    const open = price;
    const change = (seededRandom(s + i * 7) - 0.5) * 0.02;
    price = price * (1 + change);
    const high = Math.max(open, price) * (1 + seededRandom(s + i * 11) * 0.005);
    const low = Math.min(open, price) * (1 - seededRandom(s + i * 13) * 0.005);
    const close = price;
    const volume = 1000 + Math.floor(seededRandom(s + i * 17) * 50000);

    ohlcv.push({
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
      timestamp: Date.now() - (50 - i) * 60_000,
    });
  }

  // Ground truth: price 5 minutes into the future (simulate one more step)
  const lastClose = ohlcv[ohlcv.length - 1]!.close;
  const futureChange = (seededRandom(s + 999) - 0.5) * 0.015;
  const groundTruth = Math.round(lastClose * (1 + futureChange) * 100) / 100;

  return {
    challenge: {
      gameMode: "TRADING_BLITZ",
      ohlcv,
      horizonMinutes: 5,
    },
    groundTruth,
  };
}
