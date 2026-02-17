/**
 * Generate Oracle Keypair Script
 * 
 * Usage:
 *   npx ts-node scripts/generate-oracle-key.ts
 * 
 * Output:
 *   - Public key (base58)
 *   - Secret key (base58 and JSON formats)
 *   - Environment variable format
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

function generateOracleKey() {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const secretKeyBytes = keypair.secretKey;
  const secretKeyBase58 = bs58.encode(secretKeyBytes);
  const secretKeyJson = JSON.stringify(Array.from(secretKeyBytes));

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║          Soliseum Oracle Keypair Generated               ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║ Public Key:  ${publicKey.padEnd(44)} ║`);
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║ Secret Key (base58):                                     ║");
  console.log(`║ ${secretKeyBase58.slice(0, 54).padEnd(54)} ║`);
  console.log(`║ ${secretKeyBase58.slice(54).padEnd(54)} ║`);
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
  console.log(`ORACLE_X_KEY=${secretKeyBase58}`);
  console.log(`ORACLE_X_PUBKEY=${publicKey}`);
  console.log("────────────────────────────────────────────────────────────\n");

  console.log("⚠️  IMPORTANT SECURITY WARNINGS:");
  console.log("   • NEVER commit these keys to git");
  console.log("   • Store in secure environment variables or HSM");
  console.log("   • Backup keys in encrypted storage");
  console.log("   • Use different keys for devnet/mainnet\n");
}

// Generate 3 keys if run directly
if (require.main === module) {
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
}

export { generateOracleKey };
