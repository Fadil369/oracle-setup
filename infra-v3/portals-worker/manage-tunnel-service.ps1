# ============================================================
# COMPLIANCELINC — Tunnel Task Management (no-admin)
# Quick commands to monitor, restart, or troubleshoot
# the cloudflared Scheduled Task without a visible terminal.
# ============================================================

param(
    [ValidateSet("status","restart","stop","start","logs","test","uninstall")]
    [string]$Action = "status"
)

$TaskName = "CloudflaredTunnel"
# API key must be stored in the CLOUDFLARED_API_KEY environment variable — never hardcode it here.
$ApiKey   = $env:CLOUDFLARED_API_KEY
if (-not $ApiKey) { throw "CLOUDFLARED_API_KEY environment variable is not set." }
$LogFile  = "$env:USERPROFILE\.cloudflared\cloudflared.log"

switch ($Action) {

    "status" {
        Write-Host "=== Cloudflare Tunnel Task ===" -ForegroundColor Cyan
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if (-not $task) { Write-Warning "Task not registered. Run install-tunnel-service.ps1 first."; exit 1 }
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        Write-Host "  Task state   : $($task.State)"
        Write-Host "  Last run     : $($info.LastRunTime)"
        Write-Host "  Last result  : $($info.LastTaskResult)  (0 = success)"
        $cfProc = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
        if ($cfProc) { Write-Host "  Process PID  : $($cfProc.Id)" -ForegroundColor Green }
        else         { Write-Host "  Process      : NOT RUNNING" -ForegroundColor Red }
        Write-Host ""
        Write-Host "=== Tunnel Health via portals API ===" -ForegroundColor Cyan
        try {
            $health = Invoke-RestMethod `
                -Uri "https://brainsait.org/api/health" `
                -Headers @{ Authorization = "Bearer $ApiKey" } `
                -TimeoutSec 15
            $health.branches | ForEach-Object {
                $icon = if ($_.status -eq "online") { "✅" } else { "❌" }
                Write-Host "  $icon $($_.name.PadRight(12)) $($_.status.PadRight(8)) $($_.latencyMs)ms"
            }
        } catch {
            Write-Warning "Could not reach portals API: $_"
        }
    }

    "restart" {
        Write-Host "Restarting cloudflared..."
        Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep 2
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep 5
        $p = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
        if ($p) { Write-Host "Running (PID $($p.Id))" -ForegroundColor Green }
        else    { Write-Warning "Process not detected after restart" }
    }

    "start" {
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep 5
        $p = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
        if ($p) { Write-Host "Running (PID $($p.Id))" -ForegroundColor Green }
        else    { Write-Warning "Process not detected" }
    }

    "stop" {
        Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
        Write-Host "cloudflared stopped."
    }

    "logs" {
        if (Test-Path $LogFile) {
            Write-Host "=== Last 50 lines of $LogFile ===" -ForegroundColor Cyan
            Get-Content $LogFile -Tail 50
        } else {
            Write-Host "=== Windows Event Log (cloudflared entries) ===" -ForegroundColor Cyan
            Get-EventLog -LogName Application -Source cloudflared -Newest 20 -ErrorAction SilentlyContinue |
                Format-Table TimeGenerated, EntryType, Message -Wrap
        }
    }

    "test" {
        Write-Host "=== Live portal health test ===" -ForegroundColor Cyan
        $branches = @(
            @{ name = "Riyadh";  url = "https://oracle-riyadh.brainsait.org/prod/faces/Login.jsf" },
            @{ name = "Madinah"; url = "https://oracle-madinah.brainsait.org/Oasis/faces/Login.jsf" },
            @{ name = "Unaizah"; url = "https://oracle-unaizah.brainsait.org/prod/faces/Login.jsf" },
            @{ name = "Khamis";  url = "https://oracle-khamis.brainsait.org/prod/faces/Login.jsf" },
            @{ name = "Jizan";   url = "https://oracle-jizan.brainsait.org/prod/faces/Login.jsf" },
            @{ name = "Abha";    url = "https://oracle-abha.brainsait.org/Oasis/faces/Home" }
        )
        foreach ($b in $branches) {
            try {
                $t = Measure-Command {
                    $r = Invoke-WebRequest -Uri $b.url -TimeoutSec 10 -UseBasicParsing `
                         -SkipCertificateCheck -Method Head -ErrorAction Stop
                }
                Write-Host "  ✅ $($b.name.PadRight(10)) $([int]$t.TotalMilliseconds)ms  HTTP $($r.StatusCode)"
            } catch {
                Write-Host "  ❌ $($b.name.PadRight(10)) FAILED: $_" -ForegroundColor Red
            }
        }
    }

    "uninstall" {
        Write-Host "Removing scheduled task..." -ForegroundColor Yellow
        Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "Task '$TaskName' removed."
    }
}
