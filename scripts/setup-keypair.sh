#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Install Solana if not present
if ! command -v solana-keygen &> /dev/null; then
  echo "Solana CLI not found. Install it first (e.g. from https://docs.solana.com/cli/install-solana-cli-tools)"
  exit 1
fi

# Create default wallet for anchor test (Anchor.toml uses ~/.config/solana/id.json)
DEFAULT_WALLET="$HOME/.config/solana/id.json"
if [ ! -f "$DEFAULT_WALLET" ]; then
  echo "Creating default Solana keypair at $DEFAULT_WALLET (required for anchor test)"
  mkdir -p "$(dirname "$DEFAULT_WALLET")"
  solana-keygen new --no-bip39-passphrase -o "$DEFAULT_WALLET" --force
  echo "  Created. Pubkey: $(solana-keygen pubkey "$DEFAULT_WALLET")"
else
  echo "Default wallet exists: $DEFAULT_WALLET"
fi

# Program keypair for deploy
mkdir -p target/deploy
solana-keygen new --no-bip39-passphrase -o target/deploy/soliseum-keypair.json --force
echo "Program keypair: target/deploy/soliseum-keypair.json"
solana-keygen pubkey target/deploy/soliseum-keypair.json
