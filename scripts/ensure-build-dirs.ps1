# Ensure build directories exist to prevent "file not found" errors
# This is a workaround for the cargo_build_sbf error

$buildDir = "target/sbf-solana-solana/release"
$deployDir = "target/deploy"

Write-Host "Creating build directories..." -ForegroundColor Cyan

# Create the build directory structure
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
    Write-Host "  Created: $buildDir" -ForegroundColor Green
} else {
    Write-Host "  Already exists: $buildDir" -ForegroundColor Yellow
}

# Create deploy directory
if (-not (Test-Path $deployDir)) {
    New-Item -ItemType Directory -Path $deployDir -Force | Out-Null
    Write-Host "  Created: $deployDir" -ForegroundColor Green
} else {
    Write-Host "  Already exists: $deployDir" -ForegroundColor Yellow
}

Write-Host "`nNote: This only creates directories. The actual build still requires:" -ForegroundColor Yellow
Write-Host "  - Anchor CLI installed via cargo (not npm)" -ForegroundColor White
Write-Host "  - Solana CLI installed" -ForegroundColor White
Write-Host "  - Running from WSL if using WSL paths" -ForegroundColor White
