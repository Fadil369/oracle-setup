<#
.SYNOPSIS
  COMPLIANCELINC — Select top N Gate=GO claims for NPHIES pilot submission.

.DESCRIPTION
  Reads the submission_gate.json from a run directory (defaults to latest),
  selects unique-MRN GO claims sorted by priority, writes a selection file.

.PARAMETER Count
  Number of claims to select (default 5).

.PARAMETER RunDir
  Specific run directory. If omitted, uses the latest run-* directory.

.PARAMETER PriorityOrder
  Comma-separated priority order. Default: CRITICAL,HIGH,NORMAL

.EXAMPLE
  # Select top 5 from latest run
  .\scripts\select-go-for-submission.ps1 -Count 5

  # Select 3 from a specific run
  .\scripts\select-go-for-submission.ps1 -Count 3 -RunDir .\artifacts\oracle-portal\run-2026-03-24T10-00-00-000Z
#>

param(
  [int]    $Count         = 5,
  [string] $RunDir        = "",
  [string] $PriorityOrder = "CRITICAL,HIGH,NORMAL"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Resolve run directory ────────────────────────────────────────────────────
if (-not $RunDir) {
  $artifactsBase = Join-Path $PSScriptRoot "..\artifacts\oracle-portal"
  if (-not (Test-Path $artifactsBase)) {
    Write-Error "No artifacts directory found at $artifactsBase. Run oracle-scanner.mjs first."
    exit 1
  }
  $runs = Get-ChildItem -Path $artifactsBase -Directory -Filter "run-*" |
    Sort-Object Name -Descending
  if (-not $runs) {
    Write-Error "No run directories found. Run oracle-scanner.mjs first."
    exit 1
  }
  $RunDir = $runs[0].FullName
}

Write-Host "`nSelecting from: $RunDir"

# ─── Load gate file ───────────────────────────────────────────────────────────
$gateFile = Join-Path $RunDir "submission_gate.json"
if (-not (Test-Path $gateFile)) {
  Write-Error "submission_gate.json not found in $RunDir"
  exit 1
}

$gate = Get-Content $gateFile -Raw | ConvertFrom-Json
$goClaims = $gate.go

if ($goClaims.Count -eq 0) {
  Write-Host "⚠  No Gate=GO claims in this run. Check validation_queue.json for missing attachments."
  exit 0
}

# ─── Load processing report for priority data ─────────────────────────────────
$reportFile = Join-Path $RunDir "claims_processing_report.json"
$priorityMap = @{}
if (Test-Path $reportFile) {
  $report = Get-Content $reportFile -Raw | ConvertFrom-Json
  foreach ($r in $report.results) {
    $priorityMap[$r.bundleId] = $r.priority
  }
}

# ─── Sort by priority ────────────────────────────────────────────────────────
$priorityRank = @{}
$rank = 0
foreach ($p in $PriorityOrder.Split(",")) {
  $priorityRank[$p.Trim()] = $rank++
}
$priorityRank["NORMAL"] = $priorityRank.Count  # lowest rank

$sorted = $goClaims | Sort-Object {
  $p = $priorityMap[$_.bundleId]
  if ($p -and $priorityRank.ContainsKey($p)) { $priorityRank[$p] } else { 99 }
}

# ─── Select unique MRNs up to Count ──────────────────────────────────────────
$seenMRNs   = @{}
$selected   = @()
$skipped    = @()

foreach ($claim in $sorted) {
  if ($selected.Count -ge $Count) { $skipped += $claim; continue }
  if (-not $seenMRNs.ContainsKey($claim.mrn)) {
    $seenMRNs[$claim.mrn] = $true
    $priority = if ($priorityMap.ContainsKey($claim.bundleId)) { $priorityMap[$claim.bundleId] } else { "NORMAL" }
    $selected += [PSCustomObject]@{
      bundleId   = $claim.bundleId
      mrn        = $claim.mrn
      patient    = $claim.patient
      priority   = $priority
    }
  } else {
    $skipped += $claim
  }
}

# ─── Write selection file ─────────────────────────────────────────────────────
$outFile = Join-Path $RunDir "go_for_submission.top$Count.json"
$output  = @{
  generatedAt   = (Get-Date -Format "o")
  runDir        = $RunDir
  count         = $selected.Count
  selection     = $selected
  skipped       = $skipped
}

$output | ConvertTo-Json -Depth 5 | Set-Content -Path $outFile -Encoding UTF8

Write-Host ""
Write-Host "✅  Selected $($selected.Count) claims → $outFile"
Write-Host ""
Write-Host "  Priority | Patient                               | Bundle"
Write-Host "  " + ("-" * 70)
foreach ($s in $selected) {
  $shortBundle = $s.bundleId.Substring(0, 8)
  $name = $s.patient.PadRight(38).Substring(0,38)
  Write-Host "  $($s.priority.PadRight(8)) | $name | $shortBundle"
}

Write-Host ""
Write-Host "Next: .\scripts\build-nphies-submit-sheet.ps1 -Selection `"$outFile`""
