/**
 * Register the Soliseum AI Agent with the backend.
 * 
 * Usage: node register.js [--api-url http://localhost:5000]
 *
 * This script:
 *  1. Gets a nonce from the backend
 *  2. Signs it with a keypair (generates one or uses AGENT_PRIVATE_KEY env)
 *  3. Verifies to get an auth token
 *  4. Registers the agent with the given apiUrl
 */

const { Keypair } = require("@solana/web3.js");
const nacl = require("tweetnacl");
const bs58 = require("bs58");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
const AGENT_API_URL = process.argv.find(a => a.startsWith("--api-url="))?.split("=")[1]
  || process.argv[process.argv.indexOf("--api-url") + 1]
  || "http://localhost:5000";

async function main() {
  // Generate or load agent keypair
  let kp;
  if (process.env.AGENT_PRIVATE_KEY) {
    const decode = typeof bs58.decode === "function" ? bs58.decode : bs58.default.decode;
    kp = Keypair.fromSecretKey(decode(process.env.AGENT_PRIVATE_KEY));
  } else {
    kp = Keypair.generate();
  }
  const encode = typeof bs58.encode === "function" ? bs58.encode : bs58.default.encode;
  const walletAddress = kp.publicKey.toBase58();
  console.log("Agent wallet:", walletAddress);
  console.log("Agent API URL:", AGENT_API_URL);

  // Step 1: Get nonce
  console.log("\n1. Getting auth nonce...");
  const nonceRes = await fetch(`${BACKEND_URL}/api/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  const nonceData = await nonceRes.json();
  if (!nonceData.nonce) {
    throw new Error("Failed to get nonce: " + JSON.stringify(nonceData));
  }
  console.log("   Nonce:", nonceData.nonce.slice(0, 50) + "...");

  // Step 2: Sign nonce
  console.log("2. Signing nonce...");
  const messageBytes = new TextEncoder().encode(nonceData.nonce);
  const signatureBytes = nacl.sign.detached(messageBytes, kp.secretKey);
  const signature = encode(signatureBytes);

  // Step 3: Verify to get token
  console.log("3. Verifying signature...");
  const verifyRes = await fetch(`${BACKEND_URL}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, signature, nonce: nonceData.nonce }),
  });
  const verifyData = await verifyRes.json();
  if (!verifyData.token) {
    throw new Error("Auth failed: " + JSON.stringify(verifyData));
  }
  console.log("   Token obtained!");

  // Step 4: Register agent
  console.log("4. Registering agent...");
  const regRes = await fetch(`${BACKEND_URL}/api/agents/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${verifyData.token}`,
    },
    body: JSON.stringify({
      pubkey: walletAddress,
      name: "Soliseum AI Agent",
      description: "A smart agent that handles Trading Blitz, Code Wars, and Quick Chess challenges",
      category: "Trading",
      apiUrl: AGENT_API_URL,
    }),
  });
  const regData = await regRes.json();

  if (regRes.ok) {
    console.log("\n=== Agent Registered Successfully ===");
    console.log("Pubkey:", walletAddress);
    console.log("Name:", regData.agent?.name || "Soliseum AI Agent");
    console.log("API URL:", AGENT_API_URL);
    console.log("\nTo run a test battle:");
    console.log(`  node test-battle.js --agent-id=${walletAddress}`);
  } else {
    console.error("\nRegistration failed:", JSON.stringify(regData, null, 2));
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
