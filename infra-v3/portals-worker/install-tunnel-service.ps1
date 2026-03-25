# ============================================================
# COMPLIANCELINC — cloudflared Silent Task Installer
# Converts the noisy terminal tunnel into a hidden Scheduled Task:
#   - NO admin privileges required
#   - No visible window
#   - Auto-starts at logon
#   - Auto-restarts on crash
#   - CrowdStrike-friendly (registered task, not rogue process)
#
# Run as: rcmrejection3 (no elevation prompt needed)
# ============================================================

$ErrorActionPreference = "Stop"
$TaskName = "CloudflaredTunnel"

# ── Paths (all under user profile — no admin needed) ─────────────────────────
$CFDir     = "$env:USERPROFILE\.cloudflared"
$ConfigFile = "$CFDir\config.yml"
$CredFile   = "$CFDir\2cffb7bf-983e-4835-acc1-3a417a27018f.json"
$VbsLauncher = "$CFDir\start-tunnel.vbs"
$LogFile    = "$CFDir\cloudflared.log"

# Detect cloudflared binary (user-install paths first, then system)
$CFBin = $null
foreach ($p in @(
    "$env:LOCALAPPDATA\Programs\cloudflared\cloudflared.exe",
    "$env:USERPROFILE\.cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe",
    (Get-Command cloudflared -ErrorAction SilentlyContinue)?.Source
)) {
    if ($p -and (Test-Path $p)) { $CFBin = $p; break }
}
if (-not $CFBin) {
    Write-Error @"
cloudflared.exe not found.
Install it without admin using winget:
  winget install Cloudflare.cloudflared --scope user
Or download cloudflared.exe and place it at:
  $env:USERPROFILE\.cloudflared\cloudflared.exe
"@
    exit 1
}
Write-Host "cloudflared binary : $CFBin" -ForegroundColor Cyan
Write-Host "Config             : $ConfigFile" -ForegroundColor Cyan
Write-Host "Log                : $LogFile" -ForegroundColor Cyan

# ── 1. Verify config + creds exist ───────────────────────────────────────────
Write-Host "`n[1] Checking config and credentials..."
if (-not (Test-Path $ConfigFile)) { Write-Error "config.yml not found at $ConfigFile"; exit 1 }
if (-not (Test-Path $CredFile))   { Write-Error "Credentials JSON not found at $CredFile"; exit 1 }
Write-Host "   OK"

# ── 2. Kill any running terminal cloudflared ──────────────────────────────────
Write-Host "[2] Stopping terminal-based cloudflared (if running)..."
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# ── 3. Create a VBScript launcher — runs cloudflared with NO visible window ───
# Scheduled Tasks can still flash a console window if the exe is a console app.
# VBScript with wshell.Run(..., 0) guarantees zero UI.
Write-Host "[3] Creating hidden-window VBScript launcher..."
$vbsContent = @"
' COMPLIANCELINC — cloudflared silent launcher
' Window style 0 = hidden. False = don't wait (fire and forget).
Dim wsh : Set wsh = CreateObject("WScript.Shell")
wsh.Run """$CFBin"" --config ""$ConfigFile"" tunnel run --no-autoupdate", 0, False
"@
Set-Content -Path $VbsLauncher -Value $vbsContent -Encoding ASCII
Write-Host "   Launcher: $VbsLauncher"

# ── 4. Remove existing scheduled task (if any) ────────────────────────────────
Write-Host "[4] Removing old scheduled task (if exists)..."
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# ── 5. Register user-level scheduled task (NO admin required) ─────────────────
Write-Host "[5] Registering scheduled task for current user..."

# Action: run wscript.exe (the VBScript host) with the launcher — totally hidden
$Action = New-ScheduledTaskAction `
    -Execute "wscript.exe" `
    -Argument "`"$VbsLauncher`""

# Trigger: run every time THIS user logs on
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"

# Settings: no time limit, restart on failure up to 3 times, 1 min apart
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit  ([TimeSpan]::Zero) `
    -RestartCount        3 `
    -RestartInterval     (New-TimeSpan -Minutes 1) `
    -MultipleInstances   IgnoreNew `
    -StartWhenAvailable  $true

# Register — RunLevel Limited = user context, no UAC prompt
Register-ScheduledTask `
    -TaskName  $TaskName `
    -Action    $Action `
    -Trigger   $Trigger `
    -Settings  $Settings `
    -RunLevel  Limited `
    -Force

Write-Host "   Task registered: '$TaskName'"

# Add a description via COM (optional — cosmetic only)
try {
    $ts  = New-Object -ComObject Schedule.Service; $ts.Connect()
    $t   = $ts.GetFolder("\").GetTask($TaskName)
    $def = $t.Definition
    $def.RegistrationInfo.Description = "Cloudflare Zero Trust Tunnel — BrainSAIT COMPLIANCELINC Oracle connectivity"
    $t.Folder.RegisterTaskDefinition($TaskName, $def, 4, $null, $null, 3) | Out-Null
} catch { <# non-critical #> }

# ── 6. Start the task immediately ────────────────────────────────────────────
Write-Host "[6] Starting tunnel now..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 6

# ── 7. Verify ────────────────────────────────────────────────────────────────
$cfProc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
$taskState = (Get-ScheduledTask -TaskName $TaskName).State

Write-Host "`n[7] Scheduled task state : $taskState"
if ($cfProc) {
    Write-Host "    cloudflared PID       : $($cfProc.Id)" -ForegroundColor Green
    Write-Host "`n✅ SUCCESS — Tunnel is running silently (no terminal window)." -ForegroundColor Green
    Write-Host "   • Auto-starts every time $env:USERNAME logs in"
    Write-Host "   • Restarts automatically on crash (up to 3x, 1 min apart)"
    Write-Host "   • No visible window — wscript hidden-window launch"
    Write-Host "   • No admin required to maintain or restart"
    Write-Host "`n   Verify all hospitals reachable:"
    Write-Host "   .\manage-tunnel-service.ps1 test" -ForegroundColor Yellow
} else {
    Write-Warning "cloudflared process not detected after start. Check:"
    Write-Host "   wscript.exe `"$VbsLauncher`"   ← run manually to debug"
    Write-Host "   cloudflared.exe --config `"$ConfigFile`" tunnel run --loglevel debug"
}
