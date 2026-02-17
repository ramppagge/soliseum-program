/**
 * Generate Oracle Keypair Script
 * 
 * Usage:
 *   npx ts-node scripts/generate-oracle-key.ts
 * 
 * Output:
 *   - Public key (base58)
 *   - Secret key (JSON array format)
 */

import { Keypair } from "@solana/web3.js";

// Simple base58 encode (avoids bs58 type issues)
function base58Encode(buffer: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt(0);
  for (let i = 0; i < buffer.length; i++) {
    num = num * BigInt(256) + BigInt(buffer[i]);
  }
  
  let result = '';
  while (num > BigInt(0)) {
    const remainder = Number(num % BigInt(58));
    result = alphabet[remainder] + result;
    num = num / BigInt(58);
  }
  
  // Add leading '1's for each leading zero byte
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = '1' + result;
  }
  
  return result;
}

function generateOracleKey() {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const secretKeyBytes = keypair.secretKey;
  const secretKeyJson = JSON.stringify(Array.from(secretKeyBytes));

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║          Soliseum Oracle Keypair Generated               ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║ Public Key:  ${publicKey.padEnd(44)} ║`);
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║ Secret Key (JSON array):                                 ║");
  console.log(`║ ${secretKeyJson.slice(0, 56).padEnd(56)} ║`);
  if (secretKeyJson.length > 56) {
    console.log(`║ ${secretKeyJson.slice(56, 112).padEnd(56)} ║`);
    console.log(`║ ${secretKeyJson.slice(112).padEnd(56)} ║`);
  }
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  console.log("Environment Variable Format:");
  console.log("────────────────────────────────────────────────────────────");
  console.log(`ORACLE_X_KEY=${secretKeyJson}`);
  console.log(`ORACLE_X_PUBKEY=${publicKey}`);
  console.log("────────────────────────────────────────────────────────────\n");

  console.log("⚠️  IMPORTANT SECURITY WARNINGS:");
  console.log("   • NEVER commit these keys to git");
  console.log("   • Store in secure environment variables or HSM");
  console.log("   • Backup keys in encrypted storage");
  console.log("   • Use different keys for devnet/mainnet\n");
}

// Generate keys
const count = parseInt(process.argv[2] || "1", 10);

console.log(`\nGenerating ${count} oracle keypair(s)...\n`);

for (let i = 0; i < count; i++) {
  if (count > 1) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`                    Oracle ${i}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }
  generateOracleKey();
}

if (count === 3) {
  console.log("\n✅ All 3 oracle keys generated!");
  console.log("Next steps:");
  console.log("  1. Copy ORACLE_0_KEY, ORACLE_1_KEY, ORACLE_2_KEY");
  console.log("  2. Distribute to respective oracle nodes");
  console.log("  3. Update ORACLE_X_PUBKEY in all node configurations");
  console.log("  4. Deploy updated program\n");
}
