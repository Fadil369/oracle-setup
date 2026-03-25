<#
.SYNOPSIS
  COMPLIANCELINC — Deploy oracle-scanner v2.1 and run BAT-2026-NB-00004295-OT pipeline.
  Copy this file to INMARCMREJ3 and run from: C:\Users\rcmrejection3\oracle-scanner\

.DESCRIPTION
  1. Backs up existing oracle-scanner.mjs → oracle-scanner.v1.bak.mjs
  2. Copies all v2 scripts into the correct locations
  3. Runs dry-run validation on the new payload
  4. Prints the go/no-go summary

.NOTES
  Prerequisites on INMARCMREJ3:
    - Node.js 18+ (check: node --version)
    - Playwright installed (check: npx playwright --version)
    - nphies_normalized_bat4295.json already present in oracle-scanner dir
    - Cloudflare tunnel running (portals.elfadil.com / oracle.elfadil.com active)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$OracleDir = "C:\Users\rcmrejection3\oracle-scanner"
$ScriptsDir = Join-Path $OracleDir "scripts"
$AdaptersDir = Join-Path $OracleDir "adapters"

Write-Host "`n╔══════════════════════════════════════════════════════╗"
Write-Host "║  COMPLIANCELINC — oracle-scanner v2.1 Deploy        ║"
Write-Host "║  BAT-2026-NB-00004295-OT Pipeline Setup             ║"
Write-Host "╚══════════════════════════════════════════════════════╝`n"

# ─── 1. Verify working directory ─────────────────────────────────────────────
if (-not (Test-Path $OracleDir)) {
  Write-Error "oracle-scanner directory not found at $OracleDir"
  exit 1
}
Set-Location $OracleDir
Write-Host "✓  Working directory: $OracleDir"

# ─── 2. Backup existing oracle-scanner.mjs ───────────────────────────────────
$scannerFile = Join-Path $OracleDir "oracle-scanner.mjs"
$backupFile  = Join-Path $OracleDir "oracle-scanner.v1.bak.mjs"
if (Test-Path $scannerFile) {
  if (-not (Test-Path $backupFile)) {
    Copy-Item $scannerFile $backupFile
    Write-Host "✓  Backed up: oracle-scanner.mjs → oracle-scanner.v1.bak.mjs"
  } else {
    Write-Host "  Backup already exists, skipping."
  }
}

# ─── 3. Create scripts directory ─────────────────────────────────────────────
if (-not (Test-Path $ScriptsDir))   { New-Item -ItemType Directory $ScriptsDir   | Out-Null }
if (-not (Test-Path $AdaptersDir))  { New-Item -ItemType Directory $AdaptersDir  | Out-Null }
Write-Host "✓  Directories verified"

# ─── 4. File locations (relative to this installer's own location) ────────────
#    Assumes the v2 files are in a subfolder "oracle-scanner-v2\" next to this script,
#    OR that the files were downloaded/copied to $OracleDir directly.

$v2Files = @{
  "oracle-scanner.mjs"                     = Join-Path $OracleDir "oracle-scanner.mjs"
  "scripts\dry-run-nphies-checklist.mjs"   = Join-Path $ScriptsDir "dry-run-nphies-checklist.mjs"
  "scripts\select-go-for-submission.ps1"   = Join-Path $ScriptsDir "select-go-for-submission.ps1"
  "scripts\nphies-assisted-submit.mjs"     = Join-Path $ScriptsDir "nphies-assisted-submit.mjs"
  "scripts\normalize-bat4295-payload.mjs"  = Join-Path $ScriptsDir "normalize-bat4295-payload.mjs"
  "scripts\generate-appeal-letters.mjs"    = Join-Path $ScriptsDir "generate-appeal-letters.mjs"
}

Write-Host "`n  Checking for v2 files..."
$allPresent = $true
foreach ($key in $v2Files.Keys) {
  $dest = $v2Files[$key]
  if (Test-Path $dest) {
    Write-Host "  ✓  $key"
  } else {
    Write-Host "  ✗  MISSING: $key → $dest"
    $allPresent = $false
  }
}

if (-not $allPresent) {
  Write-Host "`n  ⚠  Some files are missing. Copy them from the BrainSAIT output package first."
  Write-Host "     Expected location: $OracleDir\scripts\"
  Write-Host "     Files needed: dry-run-nphies-checklist.mjs, select-go-for-submission.ps1,"
  Write-Host "                   nphies-assisted-submit.mjs, normalize-bat4295-payload.mjs,"
  Write-Host "                   generate-appeal-letters.mjs, oracle-scanner.mjs (v2)"
  Write-Host ""
}

# ─── 5. Check Node.js ────────────────────────────────────────────────────────
Write-Host "`n  Node.js version:"
node --version

# ─── 6. Check payload ────────────────────────────────────────────────────────
$payloadFile = Join-Path $OracleDir "nphies_normalized_bat4295.json"
if (-not (Test-Path $payloadFile)) {
  Write-Host "`n  ⚠  nphies_normalized_bat4295.json not found."
  Write-Host "     Run: node scripts\normalize-bat4295-payload.mjs --output nphies_normalized_bat4295.json"
} else {
  $payload = Get-Content $payloadFile -Raw | ConvertFrom-Json
  $count = $payload.submissions.Count
  $deadline = $payload.meta.appealDeadline
  Write-Host "`n  ✓  Payload loaded: $count submissions | deadline: $deadline"
}

# ─── 7. Run dry-run validation ────────────────────────────────────────────────
Write-Host "`n─── Running dry-run validation ───`n"
$dryRunScript = Join-Path $ScriptsDir "dry-run-nphies-checklist.mjs"
if (Test-Path $dryRunScript) {
  node $dryRunScript `
    --payload nphies_normalized_bat4295.json `
    --output-json dry_run_bat4295.json `
    --output-csv  dry_run_bat4295.csv
} else {
  Write-Host "  ⚠  dry-run-nphies-checklist.mjs not found, skipping validation."
}

# ─── 8. Instructions ─────────────────────────────────────────────────────────
Write-Host @"

─── Next Steps ───────────────────────────────────────────────────

STEP 1 — Fix BLOCKERS (10 bundles with 96092-ERR):
   Open oracle.elfadil.com and look up each patient below.
   Find the original invoice, identify the actual service code,
   update the corrections in nphies_normalized_bat4295.json.

   Blockers to recode:
   [03] OMAR MAHMOUD DEEB A          (2337228015) 2026-02-28
   [12] MALAK SAEED NAJI MUSLEH      (4683112595) 2026-02-17
   [14] MOHAMED MOSAD ABDELGAWAD     (2453464410) 2026-02-21
   [18] AHMED REDA DAKOUS            (2482876261) 2026-02-22
   [24] REEMA MASRI                  (2119714265) 2026-02-17
   [31] BAYAN ALDAKHEEL              (1218562476) 2026-02-22
   [42] LAMYAA GAMAL                 (4434848810) 2026-02-10
   [53] MOHAMMED HATM JUMAH          (2158888228) 2026-02-23
   [58] OMAR AHMED ATALLAH           (2516448889) 2026-02-14
   [73] MOHAMED ELMARADNY            (2557695737) 2026-02-22

STEP 2 — Run oracle scanner (skip blockers):
   node oracle-scanner.mjs ``
     --payload nphies_normalized_bat4295.json ``
     --headless true ``
     --max-docs 2 ``
     --skip-codes BE-1-3 ``
     --batch 5

STEP 3 — Select top GO claims:
   .\scripts\select-go-for-submission.ps1 -Count 5

STEP 4 — Generate appeal letters (if not done yet):
   node scripts\generate-appeal-letters.mjs ``
     --payload nphies_normalized_bat4295.json ``
     --output-dir .\appeal-letters\bat4295

STEP 5 — Assisted NPHIES submission:
   node scripts\nphies-assisted-submit.mjs ``
     --selection .\artifacts\oracle-portal\run-<timestamp>\go_for_submission.top5.json ``
     --submit-url "<paste NPHIES batch communication URL>"

─── DEADLINE: 06 April 2026 ─────────────────────────────────────

"@
