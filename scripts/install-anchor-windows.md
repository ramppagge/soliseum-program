# Installing Anchor CLI on Windows

## Error: `linker 'link.exe' not found`

This error means you need **Microsoft Visual C++ Build Tools** installed. Rust on Windows requires the MSVC linker to compile code.

## Install Visual Studio Build Tools (Required)

### Option 1: Install Build Tools for Visual Studio 2022 (Recommended - Smaller Download)

1. Download **Build Tools for Visual Studio 2022**:
   - Go to: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
   - Click **"Build Tools for Visual Studio 2022"** → **Free download**

2. Run the installer (`vs_buildtools.exe`)

3. In the installer:
   - Select **"Desktop development with C++"** workload
   - This includes:
     - MSVC v143 - VS 2022 C++ x64/x86 build tools
     - Windows 10/11 SDK (latest version)
     - C++ CMake tools
   - Click **"Install"** (this will download ~3-4 GB)

4. Wait for installation to complete (15-30 minutes depending on internet speed)

5. **Restart your computer** (recommended)

### Option 2: Install Full Visual Studio Community (Alternative)

1. Download **Visual Studio Community 2022** (free):
   - Go to: https://visualstudio.microsoft.com/vs/community/
   - Click **"Free download"**

2. Run the installer

3. Select **"Desktop development with C++"** workload

4. Click **"Install"**

5. Restart your computer

## Verify Installation

After restarting, open a **new** PowerShell or Command Prompt and run:

```powershell
# Check if link.exe is available
where.exe link.exe
```

You should see a path like: `C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\...\bin\Hostx64\x64\link.exe`

## Install Anchor CLI

**Important:** You must use the **"x64 Native Tools Command Prompt"** or set up the environment variables:

### Method 1: Use Developer Command Prompt (Easiest)

1. Press **Windows key** and search for **"x64 Native Tools Command Prompt for VS 2022"**
2. Open it (this sets up all the environment variables automatically)
3. Navigate to your project:
   ```cmd
   cd C:\Users\LENOVO\Desktop\SOLISEUM
   ```
4. Install Anchor:
   ```cmd
   cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force
   ```
5. Verify:
   ```cmd
   anchor --version
   ```

### Method 2: Use Regular PowerShell (After Setup)

If you want to use regular PowerShell, you need to set up the environment first. Add this to your PowerShell profile:

```powershell
# Add to $PROFILE (run: notepad $PROFILE)
$vsPath = "C:\Program Files\Microsoft Visual Studio\2022\BuildTools"
if (Test-Path "$vsPath\VC\Auxiliary\Build\vcvars64.bat") {
    cmd /c "$vsPath\VC\Auxiliary\Build\vcvars64.bat && set" | ForEach-Object {
        if ($_ -match "^(.+?)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}
```

Then restart PowerShell and run:
```powershell
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force
```

## Install Anchor CLI

After the SDK is installed:

1. Open **"x64 Native Tools Command Prompt for VS 2022"** (search in Start menu)
2. Run:
   ```
   cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force
   ```
3. Verify:
   ```
   anchor --version
   ```

## Alternative: Use WSL (Windows Subsystem for Linux)

If you continue to have issues on Windows, use WSL2 for a clean setup:

```bash
# 1. In WSL (Ubuntu) - Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# 2. Install C compiler (required for Rust builds)
sudo apt update && sudo apt install build-essential -y

# 3. Install Solana CLI (required for anchor build)
# Use v1.18.26 (v2.x returns 404) - manual download:
cd ~ && wget https://github.com/solana-labs/solana/releases/download/v1.18.26/solana-release-x86_64-unknown-linux-gnu.tar.bz2
tar -xjf solana-release-x86_64-unknown-linux-gnu.tar.bz2
export PATH=$HOME/solana-release/bin:$PATH

# 4. Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked --force

# 5. Add Solana to PATH permanently (add to ~/.bashrc)
echo 'export PATH=$HOME/.local/share/solana/install/active_release/bin:$PATH' >> ~/.bashrc
```

## Build & Test (from WSL)

```bash
cd /mnt/c/Users/LENOVO/Desktop/SOLISEUM

# Ensure PATH includes Solana and Cargo
export PATH=$HOME/solana-release/bin:$HOME/.cargo/bin:$PATH

# Build (use full path if anchor resolves to Windows npm)
/home/$USER/.cargo/bin/anchor build
anchor test
```

### If program ID mismatch

```bash
anchor keys sync
# or manually update lib.rs and Anchor.toml to match target/deploy/soliseum-keypair.json
```
