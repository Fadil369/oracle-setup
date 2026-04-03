# COMPLIANCELINC — BAT-2026-NB-00004295-OT
# Oracle Scanner Run Playbook for INMARCMREJ3
# ===========================================
# Run this from: C:\Users\rcmrejection3\oracle-scanner\
# Deadline: 06 April 2026 (15 days from settlement)

# ─── STEP 0: Copy new pipeline files ─────────────────────────────────────────
# Copy normalize-bat4295-payload.mjs and generate-appeal-letters.mjs
# to C:\Users\rcmrejection3\oracle-scanner\scripts\

# ─── STEP 1: Generate normalized payload ─────────────────────────────────────

node .\scripts\normalize-bat4295-payload.mjs `
  --output .\nphies_normalized_bat4295.json

# Expected output:
#   ✅  BAT-2026-NB-00004295-OT normalized payload written → nphies_normalized_bat4295.json
#   Total submissions: ~65 bundles across 44 patients
#   BLOCKER (recode): ~10 bundles with 96092-ERR

# ─── STEP 2: HANDLE BLOCKERS FIRST ───────────────────────────────────────────
# Open the portal and manually look up EACH 96092-ERR patient:
# Patients requiring recode (96092-ERR / BE-1-3):
#   - OMAR MAHMOUD DEEB A          (2337228015) Bundle: 976d0320  Date: 2026-02-28
#   - MALAK SAEED NAJI MUSLEH      (4683112595) Bundle: 9c155a7d  Date: 2026-02-17
#   - MOHAMED MOSAD ABDELGAWAD     (2453464410) Bundle: 478c8637  Date: 2026-02-21
#   - AHMED REDA MOHAMED DAKOUS    (2482876261) Bundle: df8a2d79  Date: 2026-02-22
#   - REEMA MASRI                  (2119714265) Bundle: 8d1d7c07  Date: 2026-02-17
#   - BAYAN ALI DAKHEEL ALDAKHEEL  (1218562476) Bundle: 909bae41  Date: 2026-02-22
#   - LAMYAA GAMAL                 (4434848810) Bundle: c00cdc57  Date: 2026-02-10
#   - OMAR AHMED ABDELSAMIE        (2516448889) Bundle: 3cf11564  Date: 2026-02-14
#   - MOHAMMED HATM JUMAH          (2158888228) Bundle: 6a716e93  Date: 2026-02-23
#   - MOHAMED ELMARADNY            (2557695737) Bundle: 320ab145  Date: 2026-02-22
# After identifying correct codes → update nphies_normalized_bat4295.json

# ─── STEP 3: Run oracle scanner (non-blocker bundles first) ──────────────────

node .\oracle-scanner.mjs `
  --payload .\nphies_normalized_bat4295.json `
  --headless true `
  --max-docs 2 `
  --skip-codes BE-1-3

# This will process all non-blocker submissions first.
# Resume on timeout: re-run same command (checkpoint system handles it)

# ─── STEP 4: Dry run validation ───────────────────────────────────────────────

node .\scripts\dry-run-nphies-checklist.mjs `
  --payload .\nphies_normalized_bat4295.json `
  --processing-report-xlsx ".\BAT-2026-NB-00004295-OT_processing.xlsx" `
  --output-json .\dry_run_bat4295.json `
  --output-csv .\dry_run_bat4295.csv

# ─── STEP 5: Select GO claims for pilot submission ────────────────────────────

.\scripts\select-go-for-submission.ps1 -Count 5 `
  -RunDir .\artifacts\oracle-portal\run-<latest-timestamp>

# Prefer CRITICAL + HIGH priority with clean attachment sets
# Priority order: Hayat Darwish → Sara Taleb (Humira) → Jehad Dabla → Hattan Hassan

# ─── STEP 6: Generate all appeal letters ─────────────────────────────────────

node .\scripts\generate-appeal-letters.mjs `
  --payload .\nphies_normalized_bat4295.json `
  --output-dir .\appeal-letters\bat4295

# Output: one .txt bilingual appeal letter per bundle + _APPEAL_INDEX.csv

# ─── STEP 7: Build NPHIES submit sheet ────────────────────────────────────────

.\scripts\build-nphies-submit-sheet.ps1 `
  -Selection .\artifacts\oracle-portal\run-<timestamp>\go_for_submission.top5.json

# ─── STEP 8: Assisted NPHIES resubmission (via communication channel) ─────────
# Per Al Rajhi notice: USE COMMUNICATION OPTION, not new claim
# Open NPHIES → go to batch BAT-2026-NB-00004295-OT → Communication

node .\scripts\nphies-assisted-submit.mjs `
  --selection .\artifacts\oracle-portal\run-<timestamp>\go_for_submission.top5.json `
  --submit-url "<NPHIES communication URL for batch BAT-2026-NB-00004295-OT>"

# ─── PRIORITY ORDER FOR MANUAL SUBMISSION ─────────────────────────────────────
# 1. CRITICAL — Hayat Darwish (Entresto+Empamac+cardiac meds)    2022893586
# 2. CRITICAL — سوده خالد (Dacarbazine+Doxorubicin+Bleomycin)   2538864592
# 3. CRITICAL — Sara Taleb (Humira adalimumab)                    2292379555
# 4. HIGH     — Jehad Dabla (9-item diabetic panel)              2228511180
# 5. HIGH     — Hattan Hassan (6-item respiratory BE-1-4)        2583501974
# 6. HIGH     — Abeer Mousa (11-item bundle)                     2064090885
# 7. HIGH     — Tahseenbanu Momin (5 medications)                2331857637
# 8. HIGH     — Wardah Ali (Ebetaxel chemo)                      2217205463

# ─── CONSTANT SOLUTION FOR ALL FUTURE RAJHI BATCHES ──────────────────────────
# See: FUTURE_RAJHI_PIPELINE.md
# Key: normalize-bat4295-payload.mjs is now the TEMPLATE
# For each new batch:
#   1. Update BATCH_ID, PERIOD, PATIENTS array
#   2. Run normalize → oracle-scanner → appeal-letters → submit
# The ATTACHMENT_MATRIX and letter templates are reusable as-is.
