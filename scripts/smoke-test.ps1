# Quick smoke test for filmed acts + bonus labs
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

function Start-Api($script) {
    Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
    $proc = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run $script" -PassThru
    for ($i = 0; $i - 30; $i++) {
        try {
            $r = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 2
            if ($r.ok) { return $proc }
        } catch {}
        Start-Sleep -Seconds 1
    }
    throw "API failed to start for $script"
}

function Run-Demo($name) {
    Write-Host "`n=== $name ===" -ForegroundColor Cyan
    npm run $name
    if ($LASTEXITCODE -ne 0) { throw "Failed: $name" }
}

npm run demo:reset | Out-Null

$p = Start-Api "api:no-cache"
Run-Demo "demo:performance:no-cache"
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$p = Start-Api "api:cache-aside"
Run-Demo "demo:performance:cache-aside"
Run-Demo "demo:invalidation:stale-cache"
Run-Demo "demo:invalidation:explicit"
Run-Demo "demo:patterns:write-compare"
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$p = Start-Api "api:labs:ttl"
Run-Demo "demo:invalidation:ttl-stale"
Run-Demo "demo:invalidation:ttl-expired"
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$p = Start-Api "api:labs:negative-off"
Run-Demo "demo:traps:negative-cache:off"
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$p = Start-Api "api:labs:negative-on"
Run-Demo "demo:traps:negative-cache:on"
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$p = Start-Api "api:labs:herd-off"
Run-Demo "demo:traps:thundering-herd:off"
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$p = Start-Api "api:labs:herd-on"
Run-Demo "demo:traps:thundering-herd:on"
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue

Write-Host "`nAll smoke tests passed." -ForegroundColor Green