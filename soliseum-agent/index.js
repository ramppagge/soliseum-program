/**
 * Soliseum AI Agent Server
 *
 * Minimal agent that responds to TRADING_BLITZ, CODE_WARS, and QUICK_CHESS challenges.
 * Implements the Soliseum Agent API contract:
 *   POST / → receives { challenge } → returns { response }
 *
 * Usage:
 *   npm install
 *   npm start            (runs on port 5000)
 *   PORT=5001 npm start  (custom port)
 */

const express = require("express");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// ─── Agent logic per game mode ──────────────────────────────────────────────

function handleTradingBlitz(challenge) {
  // Strategy: Simple moving average prediction
  // Take the average of recent close prices and add a small trend bias
  const closes = challenge.ohlcv.map((c) => c.close);
  const recentCloses = closes.slice(-5); // last 5 candles
  const avg = recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length;

  // Detect trend direction from last 3 candles
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 3] || lastClose;
  const trend = lastClose - prevClose;

  // Predict: average + small trend continuation
  const prediction = avg + trend * 0.3;

  return {
    prediction: Math.round(prediction * 100) / 100,
    logs: [
      `Analyzed ${closes.length} candles`,
      `SMA(5) = ${avg.toFixed(2)}, trend = ${trend > 0 ? "bullish" : "bearish"}`,
      `Prediction: ${prediction.toFixed(2)}`,
    ],
  };
}

function handleCodeWars(challenge) {
  // Strategy: Return working solutions for common problems
  const { functionName, language } = challenge;
  let code;

  if (language === "javascript") {
    switch (functionName) {
      case "reverseString":
        code = `function reverseString(s) { return s.split("").reverse().join(""); }`;
        break;
      case "twoSum":
        code = `function twoSum(nums, target) {
  const map = {};
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map[complement] !== undefined) return [map[complement], i];
    map[nums[i]] = i;
  }
  return [];
}`;
        break;
      case "longestPalindrome":
        code = `function longestPalindrome(s) {
  let best = "";
  for (let i = 0; i < s.length; i++) {
    for (let j = i; j < s.length; j++) {
      const sub = s.slice(i, j + 1);
      if (sub === sub.split("").reverse().join("") && sub.length > best.length) best = sub;
    }
  }
  return best;
}`;
        break;
      default:
        // Generic identity function as fallback
        code = `function ${functionName}(input) { return input; }`;
    }
  } else {
    // Python
    switch (functionName) {
      case "reverseString":
        code = `def reverseString(s): return s[::-1]`;
        break;
      case "twoSum":
        code = `def twoSum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen: return [seen[target - n], i]
        seen[n] = i
    return []`;
        break;
      default:
        code = `def ${functionName}(input): return input`;
    }
  }

  return {
    code,
    language,
    logs: [`Solved ${functionName} in ${language}`, `Code length: ${code.length} chars`],
  };
}

function handleQuickChess(challenge) {
  // Strategy: Return common strong opening moves based on position
  const { fen, sideToMove } = challenge;
  let move;

  if (fen.includes("rnbqkbnr/pppppppp")) {
    // Opening position for black - use common defenses
    move = sideToMove === "w" ? "e2e4" : "e7e5";
  } else if (fen.includes("rnbqkbnr") && sideToMove === "w") {
    // Early game white
    move = "d2d4";
  } else if (sideToMove === "w") {
    move = "g1f3"; // Develop knight
  } else {
    move = "g8f6"; // Develop knight
  }

  return {
    move,
    logs: [`Side to move: ${sideToMove}`, `Selected move: ${move}`],
  };
}

// ─── Main endpoint ──────────────────────────────────────────────────────────

app.post("/", (req, res) => {
  const { challenge } = req.body;

  if (!challenge || !challenge.gameMode) {
    return res.status(400).json({ error: "Missing challenge or gameMode" });
  }

  console.log(`[${new Date().toISOString()}] Challenge received: ${challenge.gameMode}`);

  let response;

  switch (challenge.gameMode) {
    case "TRADING_BLITZ":
      response = handleTradingBlitz(challenge);
      break;
    case "CODE_WARS":
      response = handleCodeWars(challenge);
      break;
    case "QUICK_CHESS":
      response = handleQuickChess(challenge);
      break;
    default:
      return res.status(400).json({ error: `Unknown gameMode: ${challenge.gameMode}` });
  }

  console.log(`  Response:`, JSON.stringify(response).slice(0, 200));
  res.json({ response });
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", agent: "Soliseum AI Agent", gameModes: ["TRADING_BLITZ", "CODE_WARS", "QUICK_CHESS"] });
});

app.listen(PORT, () => {
  console.log(`\n=== Soliseum AI Agent ===`);
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Supports: TRADING_BLITZ, CODE_WARS, QUICK_CHESS`);
  console.log(`\nTo expose publicly: npx ngrok http ${PORT}\n`);
});
