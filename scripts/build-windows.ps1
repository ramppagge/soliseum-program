# Build script for Windows (PowerShell)
# This ensures proper setup and handles the build correctly

$ErrorActionPreference = "Stop"

Write-Host "=== Soliseum Build Script for Windows ===" -ForegroundColor Cyan
Write-Host ""

# Set project directory
$ProjectDir = $PSScriptRoot + "\.."
Set-Location $ProjectDir

# Ensure build directories exist
Write-Host "Creating build directories..." -ForegroundColor Cyan
$buildDir = "target\sbf-solana-solana\release"
$deployDir = "target\deploy"

if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
    Write-Host "  Created: $buildDir" -ForegroundColor Green
} else {
    Write-Host "  Already exists: $buildDir" -ForegroundColor Yellow
}

if (-not (Test-Path $deployDir)) {
    New-Item -ItemType Directory -Path $deployDir -Force | Out-Null
    Write-Host "  Created: $deployDir" -ForegroundColor Green
} else {
    Write-Host "  Already exists: $deployDir" -ForegroundColor Yellow
}

# Check for Anchor
Write-Host ""
Write-Host "Checking Anchor installation..." -ForegroundColor Cyan
$anchorNpm = Get-Command anchor -ErrorAction SilentlyContinue
$anchorCargo = Test-Path "$env:USERPROFILE\.cargo\bin\anchor.exe"

if ($anchorNpm) {
    Write-Host "  WARNING: Anchor found via npm (does not work properly for Solana builds)" -ForegroundColor Yellow
    Write-Host "  Please install Anchor via cargo instead" -ForegroundColor Yellow
}

if ($anchorCargo) {
    $anchorPath = "$env:USERPROFILE\.cargo\bin\anchor.exe"
    Write-Host "  Found Anchor at: $anchorPath" -ForegroundColor Green
    & $anchorPath --version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        & $anchorPath --version
    }
} else {
    Write-Host "  ERROR: Anchor not found in PATH or cargo bin" -ForegroundColor Red
    Write-Host "  Install with: cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force" -ForegroundColor Yellow
    exit 1
}

# Check for Solana CLI
Write-Host ""
Write-Host "Checking Solana CLI..." -ForegroundColor Cyan
$solana = Get-Command solana -ErrorAction SilentlyContinue
if ($solana) {
    Write-Host "  Found Solana at: $($solana.Source)" -ForegroundColor Green
    $solanaVersion = & solana --version 2>&1
    Write-Host "  Version: $solanaVersion" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Solana CLI not found in PATH" -ForegroundColor Red
    Write-Host "  Install from: https://docs.solana.com/cli/install-solana-cli-tools" -ForegroundColor Yellow
    exit 1
}

# Clean previous build artifacts
Write-Host ""
Write-Host "Cleaning previous build artifacts..." -ForegroundColor Cyan
if (Test-Path "$buildDir") {
    Get-ChildItem -Path $buildDir -Filter "*.so" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleaned .so files" -ForegroundColor Green
}

# Clean constant_time_eq 0.4.2 from registry cache
Write-Host ""
Write-Host "Cleaning incompatible constant_time_eq from registry cache..." -ForegroundColor Cyan
$cargoRegistry = "$env:USERPROFILE\.cargo\registry\src"
if (Test-Path $cargoRegistry) {
    $constantTimeEqDirs = Get-ChildItem -Path $cargoRegistry -Recurse -Directory -Filter "constant_time_eq-0.4.2" -ErrorAction SilentlyContinue
    foreach ($dir in $constantTimeEqDirs) {
        Remove-Item -Path $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed: $($dir.FullName)" -ForegroundColor Green
    }
    if ($constantTimeEqDirs.Count -eq 0) {
        Write-Host "  No constant_time_eq 0.4.2 found in cache" -ForegroundColor Yellow
    }
}

# CRITICAL: Ensure Cargo.lock is version 3 (Solana's cargo build-sbf doesn't support version 4)
Write-Host ""
Write-Host "Ensuring Cargo.lock is compatible with Solana's Cargo..." -ForegroundColor Cyan
$lockFile = "Cargo.lock"
if (Test-Path $lockFile) {
    $lockContent = Get-Content $lockFile -Raw
    if ($lockContent -match "version = 4") {
        Write-Host "  WARNING: Cargo.lock is version 4, fixing to version 3..." -ForegroundColor Yellow
        $lockContent = $lockContent -replace "version = 4", "version = 3"
        Set-Content -Path $lockFile -Value $lockContent -NoNewline
        Write-Host "  Fixed lock file version to 3" -ForegroundColor Green
    } else {
        Write-Host "  Lock file version is compatible" -ForegroundColor Green
    }
} else {
    Write-Host "  WARNING: Cargo.lock not found" -ForegroundColor Yellow
}

# Ensure constant_time_eq uses 0.3.1 from git (not 0.4.2)
Write-Host ""
Write-Host "Ensuring constant_time_eq uses compatible version..." -ForegroundColor Cyan
if (Test-Path $lockFile) {
    $lockContent = Get-Content $lockFile -Raw
    
    # Check if 0.4.2 entry exists
    if ($lockContent -match 'name = "constant_time_eq"[\s\S]*?version = "0\.4\.2"') {
        Write-Host "  Removing constant_time_eq 0.4.2 entry..." -ForegroundColor Yellow
        
        # Remove the entire [[package]] block for constant_time_eq 0.4.2
        $pattern = '\[\[package\]\]\s+name = "constant_time_eq"\s+version = "0\.4\.2"[\s\S]*?(?=\[\[package\]\]|$)'
        $lockContent = $lockContent -replace $pattern, ''
        
        # Clean up double newlines
        $lockContent = $lockContent -replace "(\r?\n){3,}", "`r`n`r`n"
        
        Set-Content -Path $lockFile -Value $lockContent -NoNewline
        Write-Host "  Removed constant_time_eq 0.4.2 entry" -ForegroundColor Green
    }
    
    # Verify 0.3.1 exists
    if ($lockContent -match 'name = "constant_time_eq"[\s\S]*?version = "0\.3\.1"') {
        Write-Host "  Verified constant_time_eq 0.3.1 (git) is present" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: constant_time_eq 0.3.1 not found in lock file" -ForegroundColor Yellow
        Write-Host "  You may need to run: cargo update -p constant_time_eq" -ForegroundColor Yellow
    }
}

# Build (run cargo build-sbf first to surface real errors; anchor build will then copy artifacts)
Write-Host ""
Write-Host "Building Soliseum program (SBF)..." -ForegroundColor Cyan
$cargoBuildSbf = Get-Command cargo-build-sbf -ErrorAction SilentlyContinue
if (-not $cargoBuildSbf) {
    Write-Host "  ERROR: cargo-build-sbf not found in PATH" -ForegroundColor Red
    Write-Host "  Make sure Solana CLI is installed and in PATH" -ForegroundColor Yellow
    exit 1
}

& cargo build-sbf
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: cargo build-sbf failed. Fix the errors above, then run anchor build again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Running anchor build (IDL + deploy copy)..." -ForegroundColor Cyan
& "$env:USERPROFILE\.cargo\bin\anchor.exe" build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: anchor build failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green
$soFile = "target\deploy\soliseum.so"
if (Test-Path $soFile) {
    Write-Host "[OK] Build successful! Output: $soFile" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Build may have failed - soliseum.so not found in target/deploy/" -ForegroundColor Red
    exit 1
}
