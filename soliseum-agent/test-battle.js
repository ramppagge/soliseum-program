/**
 * Run a test battle: registered AI Agent vs MockAgent.
 *
 * Usage: node test-battle.js --agent-id=PUBKEY [--game-mode=TRADING_BLITZ]
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

const agentId = process.argv.find(a => a.startsWith("--agent-id="))?.split("=")[1];
const gameMode = process.argv.find(a => a.startsWith("--game-mode="))?.split("=")[1] || "TRADING_BLITZ";

if (!agentId) {
  console.error("Usage: node test-battle.js --agent-id=PUBKEY [--game-mode=TRADING_BLITZ|CODE_WARS|QUICK_CHESS]");
  process.exit(1);
}

async function main() {
  console.log("=== Soliseum Test Battle ===");
  console.log("Agent A (real):", agentId);
  console.log("Agent B (mock): MockAgent");
  console.log("Game mode:", gameMode);
  console.log("");

  const res = await fetch(`${BACKEND_URL}/api/test-battle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentA: { id: agentId, name: "Soliseum AI Agent" },
      agentB: { id: "mock-agent-001", name: "Mock Agent" },
      gameMode,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Battle failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("Battle result:");
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
