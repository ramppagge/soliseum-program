# Fix Everything - Setup Local PostgreSQL and Update Config
Write-Host "=== Fixing Database Connection ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if Docker is available
$dockerAvailable = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)

if (-not $dockerAvailable) {
    Write-Host "❌ Docker not found. Please install:" -ForegroundColor Red
    Write-Host "https://www.docker.com/products/docker-desktop" -ForegroundColor White
    exit 1
}

# Step 2: Start PostgreSQL container
Write-Host "Step 1: Starting PostgreSQL container..." -ForegroundColor Yellow
$containerRunning = docker ps --filter "name=soliseum-db" --filter "status=running" --format "{{.Names}}" 2>$null

if ($containerRunning -eq "soliseum-db") {
    Write-Host "Container already running" -ForegroundColor Green
} else {
    $containerExists = docker ps -a --filter "name=soliseum-db" --format "{{.Names}}" 2>$null
    
    if ($containerExists -eq "soliseum-db") {
        Write-Host "Starting existing container..." -ForegroundColor Yellow
        docker start soliseum-db
    } else {
        Write-Host "Creating new PostgreSQL container..." -ForegroundColor Yellow
        docker run --name soliseum-db `
            -e POSTGRES_USER=postgres `
            -e POSTGRES_PASSWORD=postgres `
            -e POSTGRES_DB=postgres `
            -p 5432:5432 `
            -d postgres:15-alpine
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start PostgreSQL" -ForegroundColor Red
    exit 1
}

Write-Host "✅ PostgreSQL is running on localhost:5432" -ForegroundColor Green
Write-Host ""

# Step 3: Update .env file
Write-Host "Step 2: Updating .env file..." -ForegroundColor Yellow
$envPath = "soliseum-backend/.env"

if (-not (Test-Path $envPath)) {
    Write-Host "Creating new .env file..." -ForegroundColor Yellow
    @"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
PORT=4000
"@ | Set-Content $envPath
} else {
    $content = Get-Content $envPath -Raw
    
    # Backup old Supabase URL if exists
    if ($content -match 'DATABASE_URL=.+supabase.+') {
        $content = $content -replace 'DATABASE_URL=(.+supabase.+)', "# Old Supabase URL (backup):`n# DATABASE_URL=`$1`nDATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres"
    } else {
        $content = $content -replace 'DATABASE_URL=.+', 'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres'
    }
    
    Set-Content $envPath $content
}

Write-Host "✅ .env updated to use localhost" -ForegroundColor Green
Write-Host ""

# Step 4: Wait for PostgreSQL to be ready
Write-Host "Step 3: Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
$ready = $false
$attempts = 0
while (-not $ready -and $attempts -lt 10) {
    Start-Sleep -Seconds 1
    $attempts++
    $result = docker exec soliseum-db pg_isready -U postgres 2>$null
    if ($result -match "accepting connections") {
        $ready = $true
    }
    Write-Host "  Attempt $attempts/10..." -ForegroundColor Gray
}

if (-not $ready) {
    Write-Host "❌ PostgreSQL didn't start in time" -ForegroundColor Red
    exit 1
}

Write-Host "✅ PostgreSQL is ready" -ForegroundColor Green
Write-Host ""

# Step 5: Run migrations
Write-Host "Step 4: Running database migrations..." -ForegroundColor Yellow
cd soliseum-backend

# Create migration runner if needed
$migrationRunner = @"
import { db } from "./src/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

async function runMigrations() {
  console.log("Running migrations...\n");
  
  const migrationsDir = "./src/db/migrations";
  const files = fs.readdirSync(migrationsDir).sort();
  
  for (const file of files) {
    if (file.endsWith('.sql')) {
      console.log(`Running: ${file}`);
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await db.execute(sql.raw(content));
        console.log(`  ✓ Done`);
      } catch (e) {
        console.log(`  ⚠ Skipped (may already exist)`);
      }
    }
  }
  
  console.log('\n✅ Migrations complete');
  process.exit(0);
}

runMigrations().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
"@

Set-Content "run-migrations.ts" $migrationRunner

# Run migrations
npx tsx run-migrations.ts 2>&1 | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Your database is ready:" -ForegroundColor Cyan
Write-Host "  URL: postgresql://postgres:postgres@localhost:5432/postgres" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start backend: cd soliseum-backend; npm run dev" -ForegroundColor White
Write-Host "2. Start frontend: cd soliseum-arena; npm run dev" -ForegroundColor White
Write-Host "3. Open: http://localhost:8080/agents" -ForegroundColor White
Write-Host ""
Write-Host "To stop PostgreSQL:" -ForegroundColor Gray
Write-Host "  docker stop soliseum-db" -ForegroundColor Gray
