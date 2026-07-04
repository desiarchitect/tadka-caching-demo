# Tadka Caching Demo Runner - Windows PowerShell
# Usage: .\run-demo.ps1

$ErrorActionPreference = "Stop"

function Write-Header {
    Write-Host ""
    Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "  Tadka Caching Demo - The Desi Architect" -ForegroundColor Cyan
    Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
}

function Start-Infra {
    Write-Host "  Starting Postgres + Redis..." -ForegroundColor Yellow
    docker compose up -d
    Write-Host "  Waiting for services to be ready..." -ForegroundColor Yellow

    $retries = 0
    $maxRetries = 30
    while ($retries -lt $maxRetries) {
        $pg = docker inspect --format='{{.State.Health.Status}}' tadka-cache-postgres 2>$null
        $redis = docker inspect --format='{{.State.Health.Status}}' tadka-cache-redis 2>$null
        if ($pg -eq "healthy" -and $redis -eq "healthy") {
            Write-Host "  Postgres and Redis are ready!" -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 2
        $retries++
        Write-Host "  Waiting... ($retries/$maxRetries)" -ForegroundColor Gray
    }
    Write-Host "  Services may not be fully ready. Proceeding anyway." -ForegroundColor Yellow
}

function Show-Menu {
    Write-Host ""
    Write-Host "  Pick a demo:" -ForegroundColor White
    Write-Host ""
    Write-Host "  1) Reset demo data (seed DB Rs 300 + flush Redis)" -ForegroundColor White
    Write-Host "  2) Start API - NO CACHE  (performance problem)" -ForegroundColor White
    Write-Host "  3) Start API - CACHE-ASIDE (performance fix / invalidation)" -ForegroundColor White
    Write-Host "  4) Performance PROBLEM  - 50 reads, no cache" -ForegroundColor White
    Write-Host "  5) Performance FIX      - 50 reads, Cache-Aside" -ForegroundColor White
    Write-Host "  6) Invalidation PROBLEM - stale price after DB update" -ForegroundColor White
    Write-Host "  7) Invalidation FIX     - explicit invalidation" -ForegroundColor White
    Write-Host "  8) Open Redis CLI (monitor keys)" -ForegroundColor White
    Write-Host "  0) Stop & cleanup" -ForegroundColor White
    Write-Host ""
}

Write-Header

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "  Docker not found. Install Docker Desktop first." -ForegroundColor Red
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Node.js not found. Install Node.js 18+ first." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    npm install
}

Start-Infra
npm run demo:reset | Out-Null

while ($true) {
    Show-Menu
    $choice = Read-Host "  Enter choice"

    switch ($choice) {
        "1" { npm run demo:reset }
        "2" {
            Write-Host "  Starting server with CACHE_ENABLED=false in new window..." -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run api:no-cache"
        }
        "3" {
            Write-Host "  Starting server with CACHE_ENABLED=true in new window..." -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run api:cache-aside"
        }
        "4" { npm run demo:performance:no-cache }
        "5" { npm run demo:performance:cache-aside }
        "6" { npm run demo:invalidation:stale-cache }
        "7" { npm run demo:invalidation:explicit }
        "8" {
            Write-Host "  Opening Redis CLI. Type KEYS tadka:* to inspect cache keys." -ForegroundColor Yellow
            docker exec -it tadka-cache-redis redis-cli
        }
        "0" {
            Write-Host "  Stopping containers..." -ForegroundColor Yellow
            docker compose down -v
            Write-Host "  Cleaned up!" -ForegroundColor Green
            exit 0
        }
        default { Write-Host "  Invalid choice" -ForegroundColor Red }
    }
}