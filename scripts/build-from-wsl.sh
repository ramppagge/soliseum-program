#!/bin/bash
# Build script for WSL environment
# This ensures proper PATH setup and handles the build correctly

set -e

echo "=== Soliseum Build Script for WSL ==="
echo ""

# Check if we're in WSL
if [ -z "$WSL_DISTRO_NAME" ] && [ -z "$WSLENV" ]; then
    echo "WARNING: This script is designed for WSL. You may be running in native Windows."
fi

# Set project directory
PROJECT_DIR="/mnt/c/Users/LENOVO/Desktop/SOLISEUM"
cd "$PROJECT_DIR" || exit 1

# Ensure build directories exist
echo "Creating build directories..."
mkdir -p target/sbf-solana-solana/release
mkdir -p target/deploy

# Check for Anchor
echo ""
echo "Checking Anchor installation..."
if command -v anchor &> /dev/null; then
    ANCHOR_PATH=$(which anchor)
    echo "  Found Anchor at: $ANCHOR_PATH"
    anchor --version || echo "  WARNING: Anchor command exists but --version failed"
else
    echo "  ERROR: Anchor not found in PATH"
    echo "  Install with: cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force"
    exit 1
fi

# Check for Solana CLI
echo ""
echo "Checking Solana CLI..."
if command -v solana &> /dev/null; then
    SOLANA_PATH=$(which solana)
    echo "  Found Solana at: $SOLANA_PATH"
    SOLANA_VERSION=$(solana --version 2>/dev/null || echo "unknown")
    echo "  Version: $SOLANA_VERSION"
    
    # Check if Solana CLI is outdated (Cargo 1.75.0 is from Feb 2024)
    if echo "$SOLANA_VERSION" | grep -q "1\.1[0-7]\."; then
        echo ""
        echo "  WARNING: Solana CLI version appears outdated (may cause Rust toolchain issues)"
        echo "  Consider updating with: sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
    fi
else
    echo "  ERROR: Solana CLI not found in PATH"
    echo "  Install from: https://docs.solana.com/cli/install-solana-cli-tools"
    exit 1
fi

# Check Rust/Cargo version used by cargo build-sbf
echo ""
echo "Checking Rust toolchain (via cargo build-sbf)..."
if command -v cargo &> /dev/null && cargo --version 2>&1 | head -1; then
    CARGO_VERSION=$(cargo --version 2>&1 | head -1)
    echo "  System Cargo: $CARGO_VERSION"
    echo "  Note: cargo build-sbf uses Solana's bundled Rust toolchain, not system Rust"
fi

# Clean previous build artifacts that might cause issues
echo ""
echo "Cleaning previous build artifacts..."
if [ -d "target/sbf-solana-solana/release" ]; then
    # Remove .so files but keep directory structure
    find target/sbf-solana-solana/release -name "*.so" -delete 2>/dev/null || true
    echo "  Cleaned .so files"
fi

# Clean constant_time_eq 0.4.2 from registry cache (requires edition 2024, incompatible with Solana's Cargo)
echo ""
echo "Cleaning incompatible constant_time_eq from registry cache..."
if [ -d "$HOME/.cargo/registry/src" ]; then
    find "$HOME/.cargo/registry/src" -type d -name "constant_time_eq-0.4.2" -exec rm -rf {} + 2>/dev/null || true
    echo "  Cleaned constant_time_eq 0.4.2 from cache"
fi

# If Solana platform-tools were downloaded for wrong OS/arch (e.g. Exec format error), clear so they re-download
if [ -d "$HOME/.cache/solana" ]; then
    # Only clear if rustc exists and is not executable (wrong format) - or user can force by removing .cache/solana
    RUSTC="$HOME/.cache/solana/v1.52/platform-tools/rust/bin/rustc"
    if [ -f "$RUSTC" ] && ! "$RUSTC" --version &>/dev/null; then
        echo ""
        echo "Cleaning Solana platform-tools cache (wrong binary format - will re-download for this OS)..."
        rm -rf "$HOME/.cache/solana"
        echo "  Cleaned Solana cache"
    fi
fi

# CRITICAL: Ensure Cargo.lock is version 3 (Solana's cargo build-sbf doesn't support version 4)
# This MUST happen before any cargo commands run
echo ""
echo "Ensuring Cargo.lock is compatible with Solana's Cargo..."
LOCK_VERSION=$(grep "^version = " Cargo.lock | head -1 | awk '{print $3}')
if [ "$LOCK_VERSION" = "4" ]; then
    echo "  WARNING: Cargo.lock is version 4, fixing to version 3..."
    # Force change version to 3 using multiple methods for compatibility
    if command -v sed &> /dev/null; then
        sed -i 's/^version = 4$/version = 3/' Cargo.lock 2>/dev/null || \
        sed -i.bak 's/^version = 4$/version = 3/' Cargo.lock 2>/dev/null || \
        sed -i '' 's/^version = 4$/version = 3/' Cargo.lock 2>/dev/null
        rm -f Cargo.lock.bak 2>/dev/null || true
    fi
    # Verify it worked
    NEW_VERSION=$(grep "^version = " Cargo.lock | head -1 | awk '{print $3}')
    if [ "$NEW_VERSION" = "3" ]; then
        echo "  ✓ Fixed lock file version to 3"
    else
        echo "  ✗ ERROR: Failed to fix lock file version. Please manually change 'version = 4' to 'version = 3' in Cargo.lock"
        exit 1
    fi
else
    echo "  ✓ Lock file version is $LOCK_VERSION (compatible)"
fi

# Ensure constant_time_eq uses 0.3.1 from git (not 0.4.2 which requires edition 2024)
if grep -q 'constant_time_eq.*0\.4\.2' Cargo.lock 2>/dev/null; then
    echo "  Removing constant_time_eq 0.4.2 entry (keeping 0.3.1 from git)..."
    # Remove the 0.4.2 entry (4 lines: package name, version, source, checksum, blank line)
    sed -i.bak '/^\[\[package\]\]$/,/^$/ { /^name = "constant_time_eq"$/,/^version = "0\.4\.2"$/d; }' Cargo.lock 2>/dev/null || \
    sed -i '/^\[\[package\]\]$/,/^$/ { /^name = "constant_time_eq"$/,/^version = "0\.4\.2"$/d; }' Cargo.lock 2>/dev/null || \
    python3 -c "
import re
with open('Cargo.lock', 'r') as f:
    content = f.read()
# Remove the 0.4.2 entry
pattern = r'\[\[package\]\]\nname = \"constant_time_eq\"\nversion = \"0\.4\.2\"\n.*?\nchecksum = \".*?\"\n\n'
content = re.sub(pattern, '', content, flags=re.DOTALL)
with open('Cargo.lock', 'w') as f:
    f.write(content)
" 2>/dev/null || echo "  Warning: Could not automatically remove 0.4.2 entry, please check manually"
    rm -f Cargo.lock.bak 2>/dev/null || true
    echo "  Fixed constant_time_eq version"
fi

# Build (run cargo build-sbf first to surface real errors; anchor build will then copy artifacts)
echo ""
echo "Building Soliseum program (SBF)..."
if ! cargo build-sbf 2>&1; then
    echo ""
    echo "ERROR: cargo build-sbf failed. Fix the errors above, then run anchor build again."
    exit 1
fi
echo ""
echo "Running anchor build (IDL + deploy copy)..."
anchor build

echo ""
echo "=== Build Complete ==="
if [ -f "target/deploy/soliseum.so" ]; then
    echo "✓ Build successful! Output: target/deploy/soliseum.so"
else
    echo "✗ Build may have failed - soliseum.so not found in target/deploy/"
    exit 1
fi
