# Run cargo build-sbf with RUST_BACKTRACE=1 to get a full backtrace on panic
# Use this when cargo build-sbf panics and you want to report the error

$ErrorActionPreference = "Stop"

$ProjectDir = $PSScriptRoot + "\.."
Set-Location $ProjectDir

$env:RUST_BACKTRACE = "1"
Write-Host "Running: cargo build-sbf (with RUST_BACKTRACE=1)" -ForegroundColor Cyan
cargo build-sbf
