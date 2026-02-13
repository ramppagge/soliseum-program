# Soliseum

AI Agent battle arena on Solana — stake SOL on agents to earn rewards based on credibility testing results.

## Prerequisites

- [Rust](https://rustup.rs/) (1.75+)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://www.anchor-lang.com/docs/installation) 0.30.1
- Node.js 18+

## Build & Test

### Windows

```powershell
# Install dependencies
npm install

# Build using the Windows script (handles lock file and dependency fixes)
.\scripts\build-windows.ps1

# Or build directly
anchor build
```

**Running tests on Windows:** `anchor test` runs the program build (which uses `cargo-build-sbf`). Solana's `cargo-build-sbf` can panic on Windows (`Option::unwrap() on a None` in `toolchain.rs`) because the SBF toolchain has limited Windows support. To run tests, use WSL:

```bash
# In WSL (from project root)
cd /mnt/c/Users/LENOVO/Desktop/SOLISEUM
bash scripts/build-from-wsl.sh   # build (if needed)
anchor test                      # run tests
```

### WSL / Linux

```bash
# Install dependencies
npm install

# Build using the WSL script (handles lock file and dependency fixes)
bash scripts/build-from-wsl.sh

# Or build directly
anchor build

# Run full stake-settle-claim cycle on localnet
anchor test
```

**Note:** The build scripts automatically fix compatibility issues with Solana's older Cargo toolchain (lock file version 3, constant_time_eq 0.3.1). If building directly with `anchor build`, you may encounter errors that require manual fixes.

## Program Overview

### Instructions

| Instruction        | Description                                                |
|--------------------|------------------------------------------------------------|
| `initialize_arena` | Create arena with oracle and fee (basis points)            |
| `place_stake`      | Stake SOL on agent A (0) or B (1); only when Active        |
| `settle_game`      | Oracle sets winner (0 or 1), status → Settled              |
| `claim_reward`     | Winners withdraw stake + profit; reentrancy protected      |

### Payout Formula (Multiply-Before-Divide)

```
NetLoserPool = TotalLoserPool × (10000 - FeeBps) / 10000
UserReward   = UserStake × NetLoserPool / TotalWinnerPool
TotalPayout  = UserStake + UserReward
```

### PDAs

- **Arena**: `["arena", creator]`
- **Stake**: `["stake", arena, user]`
