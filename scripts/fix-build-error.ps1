# Fix build error: Unable to get file metadata for soliseum.so
# This script helps diagnose and fix the Anchor/Solana build issue

Write-Host "=== Diagnosing Anchor/Solana Build Issue ===" -ForegroundColor Cyan

# Check if running in WSL context
$wslPath = "/mnt/c/Users/LENOVO/Desktop/SOLISEUM"
Write-Host ""
Write-Host "Error shows WSL path: $wslPath" -ForegroundColor Yellow
Write-Host "If you are running from WSL, ensure Anchor and Solana CLI are installed in WSL" -ForegroundColor Yellow

# Clean build artifacts
Write-Host ""
Write-Host "Cleaning build artifacts..." -ForegroundColor Cyan
if (Test-Path "target/sbf-solana-solana") {
    Remove-Item -Path "target/sbf-solana-solana" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleaned target/sbf-solana-solana" -ForegroundColor Green
}

# Check Anchor installation
Write-Host ""
Write-Host "Checking Anchor installation..." -ForegroundColor Cyan
$anchorNpm = Get-Command anchor -ErrorAction SilentlyContinue
$anchorCargo = Test-Path "$env:USERPROFILE\.cargo\bin\anchor.exe"

if ($anchorNpm) {
    Write-Host "  WARNING: Anchor found via npm (Windows only, does not work properly)" -ForegroundColor Yellow
}
if ($anchorCargo) {
    Write-Host "  OK: Anchor found via cargo" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Anchor NOT installed via cargo" -ForegroundColor Red
    Write-Host "    Install with: cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force" -ForegroundColor Yellow
}

# Check Solana CLI
Write-Host ""
Write-Host "Checking Solana CLI..." -ForegroundColor Cyan
$solana = Get-Command solana -ErrorAction SilentlyContinue
if ($solana) {
    Write-Host "  OK: Solana CLI found" -ForegroundColor Green
    & solana --version
} else {
    Write-Host "  ERROR: Solana CLI NOT installed" -ForegroundColor Red
    Write-Host "    Install from: https://docs.solana.com/cli/install-solana-cli-tools" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. If running from WSL, install Anchor and Solana CLI in WSL" -ForegroundColor White
Write-Host "2. See scripts/install-anchor-windows.md for detailed instructions" -ForegroundColor White
Write-Host "3. After installation, run anchor build command" -ForegroundColor White
