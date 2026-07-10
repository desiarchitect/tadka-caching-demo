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
    Write-Host ""
    Write-Host "  Bonus Labs (repo only - not filmed):" -ForegroundColor DarkYellow
    Write-Host "  9)  Start API - TTL lab (5s menu TTL)" -ForegroundColor White
    Write-Host "  10) TTL PROBLEM         - stale within TTL window" -ForegroundColor White
    Write-Host "  11) TTL FIX             - auto-refresh after expiry" -ForegroundColor White
    Write-Host "  12) Start API - negative cache OFF" -ForegroundColor White
    Write-Host "  13) Negative cache PROBLEM" -ForegroundColor White
    Write-Host "  14) Start API - negative cache ON" -ForegroundColor White
    Write-Host "  15) Negative cache FIX" -ForegroundColor White
    Write-Host "  16) Start API - thundering herd OFF" -ForegroundColor White
    Write-Host "  17) Thundering herd PROBLEM" -ForegroundColor White
    Write-Host "  18) Start API - thundering herd ON" -ForegroundColor White
    Write-Host "  19) Thundering herd FIX" -ForegroundColor White
    Write-Host "  20) Write pattern compare (Write-Through vs Write-Behind)" -ForegroundColor White
    Write-Host ""
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
        "9" {
            Write-Host "  Starting TTL lab server in new window..." -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run api:labs:ttl"
        }
        "10" { npm run demo:invalidation:ttl-stale }
        "11" { npm run demo:invalidation:ttl-expired }
        "12" {
            Write-Host "  Starting negative-cache OFF server in new window..." -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run api:labs:negative-off"
        }
        "13" { npm run demo:traps:negative-cache:off }
        "14" {
            Write-Host "  Starting negative-cache ON server in new window..." -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run api:labs:negative-on"
        }
        "15" { npm run demo:traps:negative-cache:on }
        "16" {
            Write-Host "  Starting thundering-herd OFF server in new window..." -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run api:labs:herd-off"
        }
        "17" { npm run demo:traps:thundering-herd:off }
        "18" {
            Write-Host "  Starting thundering-herd ON server in new window..." -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run api:labs:herd-on"
        }
        "19" { npm run demo:traps:thundering-herd:on }
        "20" { npm run demo:patterns:write-compare }
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