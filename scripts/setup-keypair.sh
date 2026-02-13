#!/bin/bash
set -e
cd /mnt/c/Users/LENOVO/Desktop/SOLISEUM

# Install Solana if not present
if ! command -v solana-keygen &> /dev/null; then
  sh -c "$(curl -sSfL https://release.solana.com/v2.1.0/install)"
  export PATH=$HOME/.local/share/solana/install/active_release/bin:$PATH
fi

mkdir -p target/deploy
solana-keygen new --no-bip39-passphrase -o target/deploy/soliseum-keypair.json --force
solana-keygen pubkey target/deploy/soliseum-keypair.json
