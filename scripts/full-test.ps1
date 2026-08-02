<#
.SYNOPSIS
    SiYuan MCP Server - Full Automated Test Suite
.DESCRIPTION
    Builds the project, starts MCP server in SSE mode, connects to SiYuan API,
    runs all 24 tool tests, and generates TEST_REPORT.md.
.PARAMETER SkipBuild
    Skip the build step (use existing dist/ output).
.PARAMETER Port
    MCP server SSE port (default: 3999).
.PARAMETER KeepServer
    Keep MCP server running after tests (for debugging).
.EXAMPLE
    .\scripts\full-test.ps1
.EXAMPLE
    .\scripts\full-test.ps1 -SkipBuild -Port 4000
#>

param(
    [switch]$SkipBuild,
    [int]$Port = 3999,
    [switch]$KeepServer
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectRoot ".env"
$ReportFile = Join-Path $ProjectRoot "TEST_REPORT.md"

# ─── Helpers ──────────────────────────────────────────────────────

function Write-Step($msg) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  [WARN] $msg" -ForegroundColor Yellow
}

function Write-Err($msg) {
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
}

function Write-Info($msg) {
    Write-Host "  $msg" -ForegroundColor Gray
}

# ─── Load .env ────────────────────────────────────────────────────

Write-Step "Loading .env"

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $idx = $line.IndexOf("=")
            if ($idx -gt 0) {
                $key = $line.Substring(0, $idx).Trim()
                $val = $line.Substring($idx + 1).Trim()
                Set-Item -Path "Env:$key" -Value $val
                Write-Info "$key = $(if ($key -match 'token|password|secret') { '***' } else { $val })"
            }
        }
    }
    Write-Ok ".env loaded"
} else {
    Write-Warn ".env not found, using defaults"
    if (-not $env:SIYUAN_URL) { $env:SIYUAN_URL = "http://127.0.0.1:6806" }
}

# Override transport and port for testing
$env:TRANSPORT = "sse"
$env:PORT = $Port.ToString()
$env:MCP_PORT = $Port.ToString()

Write-Info "TRANSPORT = $env:TRANSPORT"
Write-Info "PORT = $env:PORT"
Write-Info "SIYUAN_URL = $env:SIYUAN_URL"

# ─── Step 1: Build ────────────────────────────────────────────────

if (-not $SkipBuild) {
    Write-Step "Step 1: Build Project"

    Push-Location $ProjectRoot
    try {
        # Try pnpm first, fall back to npx
        $pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
        if ($pnpmCmd) {
            Write-Info "Running: pnpm build"
            & pnpm build 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        } else {
            Write-Info "pnpm not found, using npx"
            & npx pnpm@9 build 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Err "Build failed (exit code: $LASTEXITCODE)"
            exit 1
        }
        Write-Ok "Build successful"
    } finally {
        Pop-Location
    }
} else {
    Write-Step "Step 1: Build (SKIPPED)"
    Write-Info "Using existing dist/ output"
}

# Verify dist files exist
$sdkDist = Join-Path $ProjectRoot "packages\siyuan-sdk\dist\index.js"
$mcpDist = Join-Path $ProjectRoot "packages\siyuan-mcp\dist\index.js"
if (-not (Test-Path $sdkDist) -or -not (Test-Path $mcpDist)) {
    Write-Err "dist files not found. Run without -SkipBuild."
    exit 1
}
Write-Ok "dist files verified"

# ─── Step 2: Start MCP Server ─────────────────────────────────────

Write-Step "Step 2: Start MCP Server (SSE mode, port $Port)"

$serverProcess = Start-Process -FilePath "node" `
    -ArgumentList "packages/siyuan-mcp/dist/index.js" `
    -WorkingDirectory $ProjectRoot `
    -PassThru `
    -NoNewWindow `
    -RedirectStandardOutput "$ProjectRoot\scripts\mcp-server.log" `
    -RedirectStandardError "$ProjectRoot\scripts\mcp-server.err"

Write-Info "MCP server PID: $($serverProcess.Id)"
Write-Info "Waiting for server to start..."

# Wait for health check (max 15 seconds)
$serverReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$Port/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
        if ($response.status -eq "healthy" -or $response.status -eq "degraded") {
            $serverReady = $true
            Write-Ok "MCP server is ready (status: $($response.status))"
            Write-Info "SiYuan connected: $($response.siyuanConnected)"
            break
        }
    } catch {
        # Server not ready yet
    }
}

if (-not $serverReady) {
    Write-Err "MCP server failed to start within 15 seconds"
    Write-Info "Server log:"
    if (Test-Path "$ProjectRoot\scripts\mcp-server.log") {
        Get-Content "$ProjectRoot\scripts\mcp-server.log" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
    }
    Write-Info "Error log:"
    if (Test-Path "$ProjectRoot\scripts\mcp-server.err") {
        Get-Content "$ProjectRoot\scripts\mcp-server.err" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
    }
    if (-not $KeepServer) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

# ─── Step 3: Run Tool Tests ───────────────────────────────────────

Write-Step "Step 3: Run Tool Tests ($Port)"

Push-Location $ProjectRoot
try {
    Write-Info "Running: node scripts/tool-tests.mjs"
    Write-Host ""

    & node scripts/tool-tests.mjs 2>&1
    $testExitCode = $LASTEXITCODE

    Write-Host ""
    if ($testExitCode -eq 0) {
        Write-Ok "All tests passed!"
    } else {
        Write-Warn "Some tests failed (exit code: $testExitCode)"
    }
} finally {
    Pop-Location
}

# ─── Step 4: Stop MCP Server ──────────────────────────────────────

if (-not $KeepServer) {
    Write-Step "Step 4: Stop MCP Server"
    try {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Ok "MCP server stopped"
    } catch {
        Write-Warn "Failed to stop MCP server gracefully"
    }
} else {
    Write-Step "Step 4: MCP Server kept running (PID: $($serverProcess.Id))"
    Write-Info "Server log: $ProjectRoot\scripts\mcp-server.log"
}

# ─── Summary ──────────────────────────────────────────────────────

Write-Step "Test Summary"

if (Test-Path $ReportFile) {
    Write-Ok "Report generated: $ReportFile"

    # Extract key metrics from report
    $reportContent = Get-Content $ReportFile -Raw
    if ($reportContent -match "\*\*通过率\*\*:\s*([\d.]+)%") {
        $passRate = $Matches[1]
        Write-Info "Pass rate: $passRate%"
    }
    if ($reportContent -match "\*\*测试结果\*\*:\s*(\d+)\s*通过\s*/\s*(\d+)\s*失败\s*/\s*(\d+)\s*跳过") {
        $p = $Matches[1]; $f = $Matches[2]; $s = $Matches[3]
        Write-Info "Passed: $p | Failed: $f | Skipped: $s"
    }

    Write-Host ""
    Write-Host "Full report: $ReportFile" -ForegroundColor Cyan
} else {
    Write-Err "Report was not generated"
}

# Cleanup temp files
Remove-Item "$ProjectRoot\scripts\mcp-server.log" -ErrorAction SilentlyContinue
Remove-Item "$ProjectRoot\scripts\mcp-server.err" -ErrorAction SilentlyContinue

Write-Host ""
if ($testExitCode -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ALL TESTS PASSED" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  SOME TESTS FAILED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

exit $testExitCode
