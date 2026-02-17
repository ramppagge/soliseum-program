# Setup Local PostgreSQL for Development
Write-Host "=== Setting Up Local PostgreSQL ===" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
$dockerInstalled = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)

if (-not $dockerInstalled) {
    Write-Host "Docker not found. Let's install PostgreSQL directly..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Download PostgreSQL from:" -ForegroundColor Cyan
    Write-Host "https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use the installer:" -ForegroundColor Yellow
    Write-Host "https://sbp.enterprisedb.com/getfile.jsp?fileid=1258892" -ForegroundColor White
    Write-Host ""
    Write-Host "After installation, create database and run:" -ForegroundColor Yellow
    Write-Host '  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres' -ForegroundColor Green
    exit 0
}

Write-Host "Docker found! Starting PostgreSQL container..." -ForegroundColor Green
Write-Host ""

# Check if container already exists
$containerExists = docker ps -a --filter "name=soliseum-db" --format "{{.Names}}" 2>$null

if ($containerExists -eq "soliseum-db") {
    Write-Host "Container already exists. Starting it..." -ForegroundColor Yellow
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

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ PostgreSQL started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Connection URL:" -ForegroundColor Cyan
    Write-Host 'postgresql://postgres:postgres@localhost:5432/postgres' -ForegroundColor White
    Write-Host ""
    Write-Host "Updating .env file..." -ForegroundColor Yellow
    
    # Update .env file
    $envPath = "soliseum-backend/.env"
    if (Test-Path $envPath) {
        $content = Get-Content $envPath -Raw
        
        # Backup old URL
        if ($content -match 'DATABASE_URL=(.+)') {
            $oldUrl = $Matches[1].Trim()
            $content = $content -replace $oldUrl, 'postgresql://postgres:postgres@localhost:5432/postgres'
            
            # Add backup comment
            if (-not ($content -match '# Supabase URL')) {
                $content = $content -replace '(DATABASE_URL=.+)', "# Supabase URL (backup):`n# $oldUrl`n`$1"
            }
        } else {
            $content += "`nDATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres`n"
        }
        
        Set-Content $envPath $content
        Write-Host "✅ .env file updated!" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "=== Next Steps ===" -ForegroundColor Cyan
    Write-Host "1. Run migrations:" -ForegroundColor Yellow
    Write-Host "   cd soliseum-backend" -ForegroundColor White
    Write-Host "   npm run db:migrate:run" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Start backend:" -ForegroundColor Yellow
    Write-Host "   npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Open frontend:" -ForegroundColor Yellow
    Write-Host "   http://localhost:8080/agents" -ForegroundColor White
    Write-Host ""
    Write-Host "To stop PostgreSQL later:" -ForegroundColor Gray
    Write-Host "   docker stop soliseum-db" -ForegroundColor Gray
    
} else {
    Write-Host "❌ Failed to start PostgreSQL container" -ForegroundColor Red
}
