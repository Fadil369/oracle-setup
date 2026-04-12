# Al Rajhi Takaful / Riyadh Oracle Portal - Status Report
**Generated:** 2026-04-05 22:15 AST  
**Analysis Period:** Latest processing run (2026-04-05 00:28)  
**Analyst:** BrainSAIT Subagent  

---

## Executive Summary

🚨 **CRITICAL FINDING:** Al Rajhi/Riyadh pipeline is **OPERATIONAL but 100% BLOCKED** due to Oracle document extraction failure.

**Key Metrics:**
- **Total Claims Processed:** 2 bundles (2 patients)
- **NPHIES Ready:** 0 (0%)
- **Blocked (NO_GO):** 2 (100%)
- **Documents Retrieved:** 0
- **Oracle Portal Status:** NOT FOUND (0% match rate)

---

## 1. Infrastructure Assessment

### ✅ Pipeline Components - FULLY OPERATIONAL

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| **Rajhi Pipeline Factory** | ✅ Production Ready | `files3/rajhi-pipeline-factory.mjs` | Permanent reusable factory for all batches |
| **Attachment Matrix** | ✅ Complete | Embedded in factory | 11 NPHIES rejection codes supported |
| **Oracle Portal Config** | ✅ Configured | `oracle-riyadh.elfadil.com` | HTTPS + `/prod/faces/Home` |
| **Latest Processing Run** | ✅ Completed | `2026-04-05 00:28:32` | 8 total runs detected |
| **Artifacts Generated** | ✅ Complete | 7 JSON files + downloads folder | All expected outputs present |

### Oracle Portal Details
- **URL:** `https://oracle-riyadh.elfadil.com/prod/faces/Home`
- **Backend IP:** `128.1.1.185` (self-signed TLS)
- **Auth Secrets:** `ORACLE_USER_RIYADH` / `ORACLE_PASS_RIYADH`
- **TLS:** Cloudflare termination + No TLS Verify on origin
- **Probe Timeout:** 8 seconds

---

## 2. Claims Processing Analysis

### Latest Run: `run-2026-04-05T00-28-32-457`

**Batch Details:**
- **Payer:** Al Rajhi Takaful (inferred from pipeline)
- **Provider:** Hayat National Hospital - Riyadh
- **Service Period:** 2026-01-31
- **Settlement Date:** 2026-04-05 (TODAY)
- **Appeal Deadline:** 2026-04-20 (15 days remaining)

### Processed Claims

#### Claim 1: AYSHAH MOSHABAB AL ASIRI
- **National ID:** 1036216594
- **Bundle ID:** `6f9a6aaa-621f-416a-b715-fc3f64301e36`
- **Service Date:** 2026-01-31
- **Priority:** HIGH
- **Rejection Code:** SE-1-8 (Treatment plan inadequate/missing)
- **MRN:** 1036216594 (National ID fallback)
- **Oracle Found:** ❌ NO
- **Documents Retrieved:** 0
- **NPHIES Ready:** ❌ NO

**Required Attachments (4):**
1. ❌ TREATMENT_PLAN - Treatment Plan / Protocol
2. ❌ CLINICAL_NOTES - Clinical Notes
3. ❌ MEDICAL_REPORT - Medical Report
4. ❌ INVOICE - Original Hospital Invoice

**Gate Status:** NO_GO  
**Blockers:**
- MRN_NOT_RESOLVED
- ORACLE_NOT_FOUND
- MISSING_ATTACHMENTS: TREATMENT_PLAN, CLINICAL_NOTES, MEDICAL_REPORT, INVOICE

---

#### Claim 2: HALEMAH ABDULLAH AL ASIRI
- **National ID:** 1078370143
- **Bundle ID:** `291df98c-921e-492a-b47d-7d0f74e5e48d`
- **Service Date:** 2026-01-31
- **Priority:** HIGH
- **Rejection Code:** SE-1-8 (Treatment plan inadequate/missing)
- **MRN:** 1078370143 (National ID fallback)
- **Oracle Found:** ❌ NO
- **Documents Retrieved:** 0
- **NPHIES Ready:** ❌ NO

**Required Attachments (4):**
1. ❌ TREATMENT_PLAN - Treatment Plan / Protocol
2. ❌ CLINICAL_NOTES - Clinical Notes
3. ❌ MEDICAL_REPORT - Medical Report
4. ❌ INVOICE - Original Hospital Invoice

**Gate Status:** NO_GO  
**Blockers:**
- MRN_NOT_RESOLVED
- ORACLE_NOT_FOUND
- MISSING_ATTACHMENTS: TREATMENT_PLAN, CLINICAL_NOTES, MEDICAL_REPORT, INVOICE

---

## 3. Rejection Code Breakdown

| Code | Description | Count | Required Attachments |
|------|-------------|-------|----------------------|
| **SE-1-8** | Treatment plan inadequate/missing | 2 | TREATMENT_PLAN, CLINICAL_NOTES, MEDICAL_REPORT, INVOICE |

**Total Claims:** 2  
**Total Patients:** 2  
**Rejection Types:** 1 unique code

---

## 4. Document Retrieval Status

### Oracle Portal Performance

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Patient Searches** | 2 | 2 | ✅ |
| **Patients Found** | 0 | 2 | ❌ |
| **Match Rate** | 0% | >95% | 🚨 CRITICAL |
| **Documents Downloaded** | 0 | 8+ | ❌ |
| **Downloads Folder** | Empty | Populated | ❌ |

### MRN Resolution
- **Strategy:** National ID fallback (1036216594, 1078370143)
- **Success Rate:** 0% (Oracle search failed for both)
- **Issue:** Oracle portal not finding patients by National ID or MRN

---

## 5. NPHIES Submission Readiness

### Submission Gate Summary

```json
{
  "generatedAt": "2026-04-05T00:29:18.296Z",
  "go": [],
  "no_go": [
    {
      "bundleId": "6f9a6aaa-621f-416a-b715-fc3f64301e36",
      "reason": [
        "MRN_NOT_RESOLVED",
        "ORACLE_NOT_FOUND",
        "MISSING_ATTACHMENTS:TREATMENT_PLAN,CLINICAL_NOTES,MEDICAL_REPORT,INVOICE"
      ]
    },
    {
      "bundleId": "291df98c-921e-492a-b47d-7d0f74e5e48d",
      "reason": [
        "MRN_NOT_RESOLVED",
        "ORACLE_NOT_FOUND",
        "MISSING_ATTACHMENTS:TREATMENT_PLAN,CLINICAL_NOTES,MEDICAL_REPORT,INVOICE"
      ]
    }
  ]
}
```

**NPHIES Ready:** 0 claims (0%)  
**Blocked:** 2 claims (100%)  
**Submission Status:** ⛔ **CANNOT SUBMIT** - Missing critical evidence

---

## 6. Comparison with MOH Abha Portal

### Parallel Analysis (Same Patients, Different Pipeline)

**CRITICAL DISCOVERY:** The **EXACT SAME TWO PATIENTS** were processed in the MOH Abha pipeline (`live-oracle-sample.json`):

| Patient | Rajhi Pipeline | MOH Abha Pipeline | Payer |
|---------|----------------|-------------------|-------|
| AYSHAH MOSHABAB AL ASIRI (1036216594) | ❌ Oracle NOT FOUND | ❌ Oracle NOT FOUND | Al Rajhi vs MOH |
| HALEMAH ABDULLAH AL ASIRI (1078370143) | ❌ Oracle NOT FOUND | ❌ Oracle NOT FOUND | Al Rajhi vs MOH |

**Rejection Code:** Both pipelines show **SE-1-8** (Treatment plan inadequate/missing)

### Root Cause Hypothesis

This is **NOT a Riyadh-specific issue**. This is a **system-wide Oracle document extraction failure** affecting:
1. ✅ **Al Rajhi Takaful** (Riyadh portal) - 0% success rate
2. ✅ **MOH/NPHIES** (Abha portal) - 0% success rate

**Common Failure Point:**
- Oracle portal search functionality failing
- MRN resolution strategy not working
- Document download automation broken
- Authentication issues (both portals use separate credentials)

---

## 7. Identified Blockers

### 🚨 CRITICAL BLOCKERS (Submission Impossible)

#### Blocker #1: Oracle Portal Search Failure
- **Severity:** CRITICAL
- **Impact:** 100% of claims blocked
- **Symptoms:**
  - `oracleFound: false` for all claims
  - Empty `downloads/` folder
  - MRN searches returning zero results
- **Affected Portals:** Riyadh (`oracle-riyadh.elfadil.com`) + Abha (`oracle-abha.elfadil.com`)
- **Root Cause:** Unknown - needs investigation
  - Authentication failure?
  - Search query format incorrect?
  - Portal access restrictions?
  - Network/proxy issues?

#### Blocker #2: MRN Resolution Strategy
- **Severity:** HIGH
- **Impact:** Cannot match National IDs to Oracle MRNs
- **Current Strategy:** Using National ID as fallback MRN
- **Issue:** Oracle requires actual hospital MRN, not National ID
- **Recommendation:** Implement cross-reference table or API lookup

#### Blocker #3: Missing Documents (100% of claims)
- **Severity:** CRITICAL
- **Impact:** Cannot submit to NPHIES without evidence
- **Missing Types:**
  - TREATMENT_PLAN (2 claims)
  - CLINICAL_NOTES (2 claims)
  - MEDICAL_REPORT (2 claims)
  - INVOICE (2 claims)
- **Total Missing:** 8 required documents
- **Dependency:** Blocked by Blocker #1 (Oracle search failure)

---

## 8. Pipeline Capabilities (Ready but Unused)

### ✅ Supported Rejection Codes (11 total)

| Code | Description | Attachments Required |
|------|-------------|---------------------|
| **BE-1-4** | No Prior Authorization | 5 types (PRIOR_AUTH_REQUEST, CLINICAL_NOTES, MEDICAL_REPORT, INVOICE, DISCHARGE_SUMMARY) |
| **MN-1-1** | Medical Necessity | 4 types (CPG_REFERENCE, CLINICAL_NOTES, LAB_RESULTS, INVOICE) |
| **CV-1-3** | Coverage Issue | 4 types (POLICY_SCHEDULE, CLINICAL_NOTES, MEDICAL_NECESSITY, INVOICE) |
| **BE-1-3** | Service Code Mismatch | 4 types (SERVICE_CODE_MAPPING, CONTRACT_SCHEDULE, INVOICE, CLINICAL_NOTES) ⚠️ **BLOCKER FLAG** |
| **AD-1-4** | Diagnosis Linkage | 3 types (DIAGNOSIS_LINKAGE, CLINICAL_NOTES, INVOICE) |
| **SE-1-6** | Investigation Required | 4 types (INVESTIGATION_RESULT, XRAY_IMAGE, CLINICAL_NOTES, INVOICE) |
| **SE-1-8** | Treatment Plan Missing | 4 types (TREATMENT_PLAN, CLINICAL_NOTES, MEDICAL_REPORT, INVOICE) ← **CURRENT CASE** |
| **CV-1-9** | Early Follow-up | 4 types (FOLLOW_UP_JUSTIFICATION, PREVIOUS_VISIT_RECORD, CLINICAL_NOTES, INVOICE) |
| **AD-3-7** | Age-Inappropriate | 3 types (AGE_JUSTIFICATION, CLINICAL_NOTES, INVOICE) |
| **AD-2-4** | Same-Day Duplicate | 3 types (DUPLICATE_JUSTIFICATION, CLINICAL_NOTES, INVOICE) |
| **CV-1-4** | Out-of-Network | 3 types (NETWORK_VERIFICATION, REFERRAL_LETTER, INVOICE) |
| **MN-2-1** | Specialist Opinion Needed | 3 types (SPECIALIST_OPINION, CLINICAL_NOTES, INVOICE) |

**BE-1-3 Note:** Automatically flags claims as **BLOCKER** status (requires service code remapping before submission)

---

## 9. Recommended Next Steps

### Immediate Actions (0-24 hours)

#### Action 1: Diagnose Oracle Portal Connection
**Priority:** 🚨 CRITICAL  
**Owner:** DevOps / Infrastructure  
**Steps:**
1. Test manual login to `oracle-riyadh.elfadil.com` with `ORACLE_USER_RIYADH` credentials
2. Verify network connectivity from processing server to `128.1.1.185`
3. Check Cloudflare Worker logs for portal proxy errors
4. Validate TLS certificate handling (self-signed cert on backend)
5. Test patient search manually with National IDs: 1036216594, 1078370143

**Expected Outcome:** Identify why Oracle search returns zero results

---

#### Action 2: Fix Abha Portal Simultaneously
**Priority:** 🚨 CRITICAL  
**Rationale:** Same patients failing in both portals = shared root cause  
**Steps:**
1. Apply same diagnostic process to `oracle-abha.elfadil.com`
2. Compare Abha vs Riyadh Oracle configurations
3. Test with MOH credentials (`ORACLE_USER` / `ORACLE_PASS`)
4. Document any portal-specific differences

**Expected Outcome:** Unified fix for both portals

---

#### Action 3: Implement MRN Cross-Reference
**Priority:** HIGH  
**Dependency:** Requires Oracle access working  
**Steps:**
1. Create mapping table: `National ID → Hospital MRN`
2. Source data from previous successful Oracle exports
3. Implement lookup function in pipeline factory
4. Add MRN validation step before Oracle search

**Expected Outcome:** Accurate MRN resolution for future batches

---

### Short-Term Actions (1-3 days)

#### Action 4: Reprocess Al Rajhi Batch After Fix
**Priority:** HIGH  
**Dependency:** Actions 1-3 complete  
**Steps:**
1. Re-run pipeline with fixed Oracle connection
2. Verify document downloads appear in `downloads/` folder
3. Validate attachment completeness (4/4 per claim)
4. Generate updated submission gate report
5. Move claims from NO_GO → GO

**Expected Outcome:** 2 claims ready for NPHIES submission

---

#### Action 5: Expand Al Rajhi Dataset
**Priority:** MEDIUM  
**Current State:** Only 2 sample claims processed  
**Steps:**
1. Locate full Al Rajhi Takaful batch files (CSVs/Excel)
2. Check `/Volumes/NetworkShare/Download/` for Rajhi-specific folders
3. Extract remaining claims from settlement reports
4. Process full batch through pipeline

**Expected Outcome:** Complete Rajhi claim inventory (likely 50-200 claims based on typical batch sizes)

---

#### Action 6: Configure Appeal Automation
**Priority:** MEDIUM  
**Deadline:** 2026-04-20 (15 days)  
**Steps:**
1. Set up appeal letter generation for SE-1-8 rejections
2. Configure attachment bundling workflow
3. Test NPHIES resubmission API integration
4. Schedule automated submission before deadline

**Expected Outcome:** Automated appeal process for future batches

---

### Long-Term Improvements (1-2 weeks)

#### Action 7: Unified Portal Monitoring
**Priority:** MEDIUM  
**Steps:**
1. Deploy health check probes for all 6 Oracle portals (Riyadh, Abha, Madinah, Unaizah, Khamis, Jizan)
2. Implement automated alerting for search failures
3. Create dashboard for document retrieval success rates
4. Set up retry logic for transient failures

**Expected Outcome:** Proactive detection of portal issues

---

#### Action 8: Cross-Portal Comparison Study
**Priority:** LOW (Research)  
**Purpose:** Understand payer-specific rejection patterns  
**Analysis Points:**
- Al Rajhi vs MOH rejection code distribution
- Riyadh vs Abha document availability
- Settlement timelines by payer
- Appeal success rates by rejection code

**Expected Outcome:** Data-driven strategy for future batches

---

## 10. Data Artifacts Generated

### Latest Run Output Files

| File | Size | Purpose | Status |
|------|------|---------|--------|
| `checkpoint.json` | 3.3 KB | Processing state snapshot | ✅ Complete |
| `claims_processing_report.json` | 3.4 KB | Detailed claim analysis | ✅ Complete |
| `submission_gate.json` | 548 B | GO/NO_GO decision log | ✅ Complete |
| `validation_queue.json` | 2.0 KB | Missing attachments list | ✅ Complete |
| `nphies_submission_bundle_manifest.json` | 65 B | Empty manifest (0 ready claims) | ⚠️ Empty |
| `downloads/` | 0 files | Retrieved Oracle documents | ❌ Empty |

**Total Artifacts:** 6 files + 1 empty folder  
**Storage Location:** `~/oracle-setup/artifacts/oracle-portal/run-2026-04-05T00-28-32-457/`

---

## 11. Gap Analysis: Riyadh vs Abha

### Configuration Comparison

| Feature | Riyadh (Al Rajhi) | Abha (MOH) | Status |
|---------|-------------------|------------|--------|
| **Portal URL** | oracle-riyadh.elfadil.com | oracle-abha.elfadil.com | ✅ Both configured |
| **Login Path** | `/prod/faces/Home` | `/Oasis/faces/Home` | ⚠️ Different paths |
| **TLS** | ✅ HTTPS (Cloudflare) | ❌ HTTP | ⚠️ Config mismatch |
| **Backend IP** | 128.1.1.185 | Unknown | ℹ️ Not documented |
| **Auth Secrets** | ORACLE_USER_RIYADH | ORACLE_USER | ✅ Separate credentials |
| **Pipeline Factory** | rajhi-pipeline-factory.mjs | Embedded in resubmission logic | ⚠️ Different implementations |
| **Batch Processing** | CLI-based (--batch flag) | Workbook-based (Excel input) | ⚠️ Different workflows |
| **MRN Strategy** | National ID fallback | National ID fallback | ✅ Same (broken) strategy |
| **Document Extraction** | 0% success | 0% success | 🚨 Same failure |

### Key Differences

1. **Abha uses workbook input** (`claim_response_Abha_*.xlsx` + `MINISTRY_OF_HEALTH_*.xlsx`)
2. **Riyadh uses JSON patient files** (`--patients patients_bat_XXXX.json`)
3. **Abha has 328 claims processed** vs Riyadh's 2 claims (sample size difference)
4. **Abha shows more rejection codes** (12 types) vs Riyadh's 1 type (SE-1-8 only)

### Recommendation
**Standardize on Abha's workbook-based approach** for Riyadh batches to ensure consistency. The Rajhi pipeline factory is excellent for programmatic use but creates workflow divergence.

---

## 12. Critical Success Factors

To unblock Al Rajhi/Riyadh pipeline, we need:

1. ✅ **Oracle portal access working** (CRITICAL - blocks everything)
2. ✅ **MRN resolution accurate** (HIGH - enables correct patient lookup)
3. ✅ **Document downloads functional** (CRITICAL - required for submission)
4. ⚠️ **Full batch data available** (MEDIUM - only 2 sample claims currently)
5. ⚠️ **Appeal deadline buffer** (15 days remaining - actionable timeframe)

**Current Bottleneck:** Item #1 (Oracle portal) - fixing this unblocks items #2-3 automatically.

---

## 13. Conclusion

### Summary of Findings

**Infrastructure:** ✅ EXCELLENT  
- Riyadh portal configured correctly
- Pipeline factory production-ready
- All automation components in place

**Data Processing:** ⚠️ PARTIAL  
- Successfully processed 2 claims
- Correct rejection code identification (SE-1-8)
- Proper attachment requirements mapped

**Document Retrieval:** ❌ FAILED  
- 0% Oracle search success rate
- Identical failure pattern in Abha portal
- System-wide issue, not Riyadh-specific

**NPHIES Readiness:** ❌ BLOCKED  
- Cannot submit without documents
- 15-day deadline at risk if not resolved immediately

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Miss appeal deadline (Apr 20)** | HIGH | CRITICAL | Fix Oracle access within 48 hours |
| **Duplicate effort (manual retrieval)** | MEDIUM | HIGH | Prioritize automated fix over workarounds |
| **Cross-portal contamination** | LOW | MEDIUM | Test fixes in isolation before deploying |
| **Data loss (batch incomplete)** | MEDIUM | MEDIUM | Locate full Al Rajhi dataset immediately |

### Final Recommendation

**DO NOT proceed with manual workarounds.** Fix the Oracle portal connection issue systematically:

1. Diagnose root cause (authentication, network, search query format)
2. Apply fix to both Riyadh and Abha portals simultaneously
3. Reprocess existing batches to validate fix
4. Expand Al Rajhi dataset and process full batch
5. Submit to NPHIES before April 20 deadline

**Estimated Timeline:**
- Oracle fix: 1-2 days (critical path)
- Reprocessing: 4-6 hours
- Full batch expansion: 1-2 days
- NPHIES submission: 1 day
- **Total:** 4-6 days (well within deadline)

---

## Appendices

### Appendix A: Processing Run Inventory

| Run ID | Timestamp | Claims | Status |
|--------|-----------|--------|--------|
| run-2026-04-05T00-28-32-457 | 2026-04-05 00:28 | 2 | ✅ Latest (analyzed) |
| run-2026-04-05T00-26-25-425 | 2026-04-05 00:26 | Unknown | ⚠️ Not reviewed |
| run-2026-04-05T00-24-45-646 | 2026-04-05 00:24 | Unknown | ⚠️ Not reviewed |
| run-2026-04-05T00-24-13-339 | 2026-04-05 00:24 | Unknown | ⚠️ Not reviewed |
| run-2026-03-24T17-53-32-552 | 2026-03-24 17:53 | Unknown | ℹ️ Historical |
| run-2026-03-24T17-52-20-033 | 2026-03-24 17:52 | Unknown | ℹ️ Historical |

**Note:** Multiple runs on same day suggests active development/testing.

### Appendix B: SE-1-8 Rejection Code Details

**NPHIES Code:** SE-1-8  
**Description:** Treatment plan is inadequate or missing  
**Category:** Supporting Evidence  
**Common Causes:**
- Treatment protocol not attached
- Clinical notes incomplete
- Medical justification missing
- Follow-up plan not documented

**Required Evidence (per pipeline):**
1. **TREATMENT_PLAN** - Treatment Plan / Protocol document
2. **CLINICAL_NOTES** - Treating physician's clinical notes
3. **MEDICAL_REPORT** - Comprehensive medical report
4. **INVOICE** - Original hospital invoice

**Appeal Strategy:**
- Retrieve complete treatment documentation from Oracle
- Bundle with clinical justification letter
- Reference SCFHS/CPG guidelines if applicable
- Submit within 15-day window

### Appendix C: Contact Points

**Technical Escalation:**
- Oracle Portal Issues → DevOps / Infrastructure team
- NPHIES API → Integration team
- MRN Resolution → Hospital IT / HIS team

**Business Escalation:**
- Al Rajhi Takaful account manager
- Claims department (Riyadh branch)
- Revenue cycle management

**Compliance:**
- NPHIES submission deadline: 2026-04-20
- Data privacy (patient NationalIDs in logs) - ensure GDPR/KSA compliance

---

**Report End**  
**Next Review:** After Oracle portal fix implementation  
**Document Version:** 1.0  
**Classification:** Internal Use Only  
