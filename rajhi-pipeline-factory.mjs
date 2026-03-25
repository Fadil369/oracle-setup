/**
 * COMPLIANCELINC — BrainSAIT
 * FUTURE RAJHI PIPELINE — Permanent factory for any Al Rajhi Takaful batch
 *
 * This is the STABLE SOLUTION for all future batches.
 * Replace BATCH_CONFIG and PATIENTS per batch. Everything else is reusable.
 *
 * Usage:
 *   node rajhi-pipeline-factory.mjs \
 *     --batch "BAT-2026-NB-XXXXXXXX-OT" \
 *     --period-from "2026-03-01" \
 *     --period-to   "2026-03-31" \
 *     --patients patients_bat_XXXX.json \
 *     --output-dir  ./pipeline-output/bat-XXXX
 *
 * patients_bat_XXXX.json schema:
 * [
 *   {
 *     "name": "Patient Full Name",
 *     "nationalId": "XXXXXXXXXX",
 *     "bundles": [
 *       {
 *         "bundleId": "uuid-from-pdf",
 *         "serviceDate": "YYYY-MM-DD",
 *         "priority": "CRITICAL|HIGH|NORMAL|BLOCKER",
 *         "specialNote": "optional clinical note",
 *         "rejections": [
 *           { "code": "SVCCODE", "name": "Service Name", "reason": "BE-1-4" }
 *         ]
 *       }
 *     ]
 *   }
 * ]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ─── Attachment matrix (permanent — covers all NPHIES rejection codes) ───────
export const ATTACHMENT_MATRIX = {
  "BE-1-4": [
    { type: "PRIOR_AUTH_REQUEST",     label: "Prior Authorization Request (retroactive)", required: true  },
    { type: "CLINICAL_NOTES",         label: "Treating Physician Clinical Notes",          required: true  },
    { type: "MEDICAL_REPORT",         label: "Medical Report / Referral",                  required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
    { type: "DISCHARGE_SUMMARY",      label: "Discharge Summary (if inpatient)",           required: false },
  ],
  "MN-1-1": [
    { type: "CPG_REFERENCE",          label: "Saudi CPG / SCFHS Clinical Guideline",       required: true  },
    { type: "CLINICAL_NOTES",         label: "Physician Notes with Active Diagnosis",       required: true  },
    { type: "LAB_RESULTS",            label: "Supporting Investigation Results",            required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
  "CV-1-3": [
    { type: "POLICY_SCHEDULE",        label: "Insurance Policy Schedule / Benefits",       required: true  },
    { type: "CLINICAL_NOTES",         label: "Clinical Notes with ICD-10 Justification",  required: true  },
    { type: "MEDICAL_NECESSITY",      label: "Medical Necessity Statement",                required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
  "BE-1-3": [
    { type: "SERVICE_CODE_MAPPING",   label: "Corrected Service Code Mapping",             required: true  },
    { type: "CONTRACT_SCHEDULE",      label: "Provider-Payer Contract Service Schedule",   required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
    { type: "CLINICAL_NOTES",         label: "Clinical Notes",                             required: true  },
  ],
  "AD-1-4": [
    { type: "DIAGNOSIS_LINKAGE",      label: "Diagnosis-to-Procedure Linkage Report",     required: true  },
    { type: "CLINICAL_NOTES",         label: "Clinical Notes with Diagnosis Context",      required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
  "SE-1-6": [
    { type: "INVESTIGATION_RESULT",   label: "Investigation / Lab Result Document",        required: true  },
    { type: "XRAY_IMAGE",             label: "Radiology / Imaging File (DICOM/JPEG)",      required: true  },
    { type: "CLINICAL_NOTES",         label: "Clinical Notes",                             required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
  "CV-1-9": [
    { type: "FOLLOW_UP_JUSTIFICATION",label: "Clinical Justification for Early Follow-up", required: true  },
    { type: "PREVIOUS_VISIT_RECORD",  label: "Previous Visit Record (within 14 days)",     required: true  },
    { type: "CLINICAL_NOTES",         label: "Clinical Notes",                             required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
  "AD-3-7": [
    { type: "AGE_JUSTIFICATION",      label: "Age-Appropriate Use Justification",          required: true  },
    { type: "CLINICAL_NOTES",         label: "Pediatric Clinical Notes",                   required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
  "AD-2-4": [
    { type: "DUPLICATE_JUSTIFICATION",label: "Same-Day Repeat Clinical Justification",     required: true  },
    { type: "CLINICAL_NOTES",         label: "Clinical Notes",                             required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
  "CV-1-4": [
    { type: "NETWORK_VERIFICATION",   label: "In-Network Provider Verification",           required: true  },
    { type: "REFERRAL_LETTER",        label: "Referral Letter from Primary Provider",      required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
  "MN-2-1": [
    { type: "SPECIALIST_OPINION",     label: "Specialist Medical Opinion",                 required: true  },
    { type: "CLINICAL_NOTES",         label: "Clinical Notes",                             required: true  },
    { type: "INVOICE",                label: "Original Hospital Invoice",                  required: true  },
  ],
};

// ─── Settlement date → appeal deadline calculator ─────────────────────────────
function appealDeadline(settlementDateStr) {
  const d = new Date(settlementDateStr);
  d.setDate(d.getDate() + 15);
  return d.toISOString().split("T")[0];
}

// ─── Build submissions[] from patients data ────────────────────────────────────
export function buildNormalizedPayload(config, patients) {
  const submissions = [];
  let seq = 1;

  for (const pt of patients) {
    for (const bundle of pt.bundles) {
      const codes = [...new Set(bundle.rejections.map(r => r.reason))];
      const seenTypes = new Set();
      const attachments = [];

      for (const code of codes) {
        for (const att of (ATTACHMENT_MATRIX[code] || [])) {
          if (!seenTypes.has(att.type)) {
            seenTypes.add(att.type);
            attachments.push({ ...att, rejectionCode: code });
          }
        }
      }

      submissions.push({
        seq: seq++,
        batchId:        config.batchId,
        payer:          config.payer,
        provider:       config.provider,
        period:         config.period,
        settlementDate: config.settlementDate,
        appealDeadline: config.appealDeadline,

        patientName: pt.name,
        nationalId:  pt.nationalId,

        bundleId:    bundle.bundleId,
        serviceDate: bundle.serviceDate,
        rejections:  bundle.rejections,
        rejectionCodes: codes,
        specialNote: bundle.specialNote || null,
        priority:    bundle.priority || "NORMAL",

        requiresRecode:   codes.includes("BE-1-3"),
        isPriorityAppeal: ["CRITICAL","HIGH"].includes(bundle.priority),

        attachments,
        attachmentCount: attachments.length,
        requiredCount:   attachments.filter(a => a.required).length,

        // Oracle scanner compatibility
        oracleFound:  null,
        nphiesReady:  false,
        gateStatus:   codes.includes("BE-1-3") ? "BLOCKER" : "PENDING",
        oracleUrl:    config.oracleUrl,
        oracleSearchHint: {
          nationalId:  pt.nationalId,
          name:        pt.name,
          serviceDate: bundle.serviceDate,
        },
      });
    }
  }
  return submissions;
}

// ─── Stats generator ───────────────────────────────────────────────────────────
export function buildStats(config, submissions) {
  const byCode = {};
  for (const s of submissions) {
    for (const code of s.rejectionCodes) {
      byCode[code] = (byCode[code] || 0) + 1;
    }
  }
  return {
    generatedAt:    new Date().toISOString(),
    batchId:        config.batchId,
    settlementDate: config.settlementDate,
    appealDeadline: config.appealDeadline,
    totalBundles:   submissions.length,
    totalPatients:  new Set(submissions.map(s => s.nationalId)).size,
    byPriority: {
      CRITICAL: submissions.filter(s => s.priority === "CRITICAL").length,
      HIGH:     submissions.filter(s => s.priority === "HIGH").length,
      BLOCKER:  submissions.filter(s => s.requiresRecode).length,
      NORMAL:   submissions.filter(s => s.priority === "NORMAL").length,
    },
    byRejectionCode: byCode,
    blockerBundleIds: submissions.filter(s => s.requiresRecode).map(s => ({
      bundleId: s.bundleId,
      patient:  s.patientName,
      date:     s.serviceDate,
    })),
    topAttachmentTypes: Object.entries(
      submissions.flatMap(s => s.attachments).reduce((acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1; return acc;
      }, {})
    ).sort((a,b) => b[1]-a[1]).slice(0, 10),
  };
}

// ─── CLI entry point ────────────────────────────────────────────────────────────
if (process.argv[1].includes("rajhi-pipeline-factory")) {
  const args = process.argv.slice(2);
  const get  = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : def; };

  const batchId        = get("--batch",       "BAT-UNKNOWN");
  const periodFrom     = get("--period-from", "");
  const periodTo       = get("--period-to",   "");
  const patientsFile   = get("--patients",    null);
  const settlementDate = get("--settlement",  new Date().toISOString().split("T")[0]);
  const outDir         = get("--output-dir",  `./pipeline-output/${batchId}`);

  if (!patientsFile) {
    console.error("❌  --patients <file.json> is required");
    process.exit(1);
  }

  const patients = JSON.parse(readFileSync(patientsFile, "utf8"));
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const config = {
    batchId,
    payer:          "Al Rajhi Takaful",
    provider:       "Hayat National Hospital - Riyadh",
    period:         { from: periodFrom, to: periodTo },
    settlementDate,
    appealDeadline: appealDeadline(settlementDate),
    oracleUrl:      "https://128.1.1.185/prod/faces/Home",
  };

  const submissions = buildNormalizedPayload(config, patients);
  const stats       = buildStats(config, submissions);
  const output      = { meta: stats, submissions };

  const payloadPath = join(outDir, `nphies_normalized_${batchId}.json`);
  writeFileSync(payloadPath, JSON.stringify(output, null, 2));

  console.log(`\n✅  ${batchId} normalized payload → ${payloadPath}`);
  console.log(`📊  ${stats.totalBundles} bundles | ${stats.totalPatients} patients`);
  console.log(`⏰  Appeal deadline: ${config.appealDeadline}`);
  console.log(`🚫  Blockers: ${stats.byPriority.BLOCKER}`);
  console.log(`\nRejection code distribution:`);
  for (const [code, count] of Object.entries(stats.byRejectionCode)) {
    console.log(`    ${code.padEnd(8)} : ${count}`);
  }
}
