# Soliseum Oracle Multisig Migration Guide

## Overview

This guide covers the migration from single-oracle to **2-of-3 threshold multisig** settlement, eliminating the single point of failure in the settlement process.

## Architecture Changes

### Before (Single Oracle)
```
┌──────────────┐
│ Single Oracle │  ──►  On-chain Settlement
│   (1 key)    │
└──────────────┘
```

### After (2-of-3 Multisig)
```
┌──────────┐   ┌──────────┐   ┌──────────┐
│ Oracle 0 │   │ Oracle 1 │   │ Oracle 2 │
│ (Node A) │   │ (Node B) │   │ (Node C) │
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     └──────────────┼──────────────┘
                    │ (Any 2 can settle)
                    ▼
            ┌──────────────┐
            │ On-chain     │
            │ Settlement   │
            └──────────────┘
```

## Pre-Migration Checklist

- [ ] Generate 3 new oracle keypairs
- [ ] Deploy new program version with multisig support
- [ ] Configure 3 oracle nodes with environment variables
- [ ] Test on devnet with small stakes
- [ ] Update frontend to support new arena initialization
- [ ] Schedule migration window (minimal downtime)

## Migration Steps

### Step 1: Generate Oracle Keypairs

```bash
# Run for each oracle node (0, 1, 2)
npx ts-node scripts/generate-oracle-key.ts

# Output:
# Oracle 0 Public Key: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
# Secret Key: [34, 12, ...] (save securely)
```

### Step 2: Deploy Updated Program

```bash
# Build the updated program
anchor build

# Deploy to devnet for testing
anchor deploy --provider.cluster devnet

# Verify deployment
solana confirm <signature>
```

### Step 3: Configure Oracle Nodes

Each oracle node needs these environment variables:

```bash
# .env for Oracle Node 0
USE_MULTISIG_ORACLE=true
ORACLE_NODE_INDEX=0
ORACLE_0_KEY=<base58-or-json-secret-key>
ORACLE_0_PUBKEY=<public-key>
ORACLE_0_ENDPOINT=https://oracle0.soliseum.io
ORACLE_1_PUBKEY=<oracle-1-public-key>
ORACLE_2_PUBKEY=<oracle-2-public-key>
ORACLE_1_ENDPOINT=https://oracle1.soliseum.io
ORACLE_2_ENDPOINT=https://oracle2.soliseum.io
SOLANA_RPC_URL=https://api.devnet.solana.com
```

### Step 4: Initialize New Arenas with Multisig

When creating a new arena, provide 3 oracle pubkeys:

```typescript
import { PublicKey } from "@solana/web3.js";

const oraclePubkeys = [
  new PublicKey("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"), // Oracle 0
  new PublicKey("8yLYuh3DX98uaUYJTEqcE6kClhVrU94TZSkpHtogBtV"),  // Oracle 1
  new PublicKey("9zMZvi4EY09vbVZKUF95VZTmpIWuihuiCtWcZCtC"),   // Oracle 2
];

await program.methods
  .initializeArena(
    500, // 5% fee in bps
    oraclePubkeys
  )
  .accounts({
    creator: creatorKeypair.publicKey,
    // ... other accounts
  })
  .rpc();
```

### Step 5: Settlement Flow

When a battle completes, any oracle can initiate settlement:

1. **Oracle Node 0** receives battle result
2. Creates settlement signature: `sign("soliseum:settle:" + arena + winner + nonce)`
3. Requests signature from Oracle Node 1 via `POST /api/oracle/sign`
4. Aggregates both signatures
5. Submits `settle_game` transaction with both signatures
6. On-chain program verifies:
   - Both signatures from different oracles in committee
   - Nonce matches current arena nonce
   - Arena is in Active state

### Step 6: Update Existing Arenas (Optional)

For existing arenas using single oracle, you can:

1. **Leave as-is**: Single oracle continues to work
2. **Migrate via update_oracles**: Requires creator signature

```typescript
// Update existing arena to use multisig
await program.methods
  .updateOracles(
    newOraclePubkeys, // [oracle0, oracle1, oracle2]
    null // No signatures needed (creator only)
  )
  .accounts({
    arena: arenaPubkey,
    authority: creatorKeypair.publicKey, // Must be creator
  })
  .signers([creatorKeypair])
  .rpc();
```

## Security Considerations

### Key Management

- **Never** commit oracle private keys to git
- Use hardware security modules (HSMs) in production
- Rotate keys quarterly via `update_oracles`
- Store keys in separate geographical locations

### Network Security

- Oracle nodes should communicate over HTTPS only
- Implement IP allowlisting between oracle nodes
- Use mutual TLS (mTLS) for oracle-to-oracle communication
- Monitor for unusual signing patterns

### Replay Protection

The `settlement_nonce` in each arena prevents replay attacks:
- Increments on every settlement/reset
- Part of the signed message
- Old signatures are automatically invalid

## Rollback Plan

If issues occur:

1. Set `USE_MULTISIG_ORACLE=false` on all nodes to revert to single oracle
2. Single oracle can settle/reset using legacy flow
3. Fix issues and redeploy

## Monitoring

Track these metrics:

```typescript
// Oracle health check
GET /api/oracle/status

// Response
{
  "ok": true,
  "oracle_index": 0,
  "public_key": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "endpoint": "https://oracle0.soliseum.io"
}
```

### Key Metrics

- `oracle_settlement_latency_ms`: Time to collect signatures and settle
- `oracle_signature_failures`: Failed signature requests
- `multisig_threshold_reaches`: Successful 2-of-3 settlements

## Troubleshooting

### "Insufficient signatures" Error

- Check that requesting oracle is in the committee
- Verify `ORACLE_NODE_INDEX` matches the keypair
- Ensure all 3 oracle nodes are online

### "Nonce mismatch" Error

- Arena was settled/reset by another oracle
- Fetch current state and retry with updated nonce

### "Invalid signature" Error

- Oracle keypair doesn't match on-chain oracle pubkey
- Wrong message format (check encoding)

## API Reference

### Internal Oracle Endpoints

```typescript
// Request settlement signature
POST /api/oracle/sign
{
  "arenaAddress": "...",
  "winner": 0,
  "nonce": "123",
  "requester": "<oracle-pubkey>"
}

// Response
{
  "ok": true,
  "oracle_index": 1,
  "signature": "base58-signature"
}

// Request reset signature
POST /api/oracle/sign-reset
{
  "arenaAddress": "...",
  "nonce": "123"
}
```

## Verification

Verify multisig is working:

```bash
# Check service status
curl https://oracle0.soliseum.io/

# Expected:
{
  "service": "Soliseum Oracle",
  "version": "4.0.0",
  "oracle_mode": "multisig-2-of-3",
  "oracle_node": 0
}
```

## Support

For migration assistance:
- Check logs: `tail -f /var/log/soliseum-oracle.log`
- Health check: `GET /health`
- Emergency contact: `#soliseum-dev` on Discord
