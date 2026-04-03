/**
 * dry-run-nphies-checklist.mjs
 * COMPLIANCELINC — BrainSAIT
 *
 * Validates every submission in the normalized payload against a checklist:
 *   - Is bundleId present and valid UUID?
 *   - Are rejectionCodes known NPHIES codes?
 *   - Does each required attachment have a known type?
 *   - Is it a BLOCKER (96092-ERR)?
 *   - Is it inside the 15-day appeal window?
 *
 * Outputs:
 *   --output-json  dry_run_bat4295.json
 *   --output-csv   dry_run_bat4295.csv
 *   --output-xlsx  dry_run_bat4295.xlsx   (requires exceljs)
 *
 * Usage:
 *   node scripts/dry-run-nphies-checklist.mjs \
 *     --payload nphies_normalized_bat4295.json \
 *     --output-json dry_run_bat4295.json \
 *     --output-csv  dry_run_bat4295.csv
 */

import { readFileSync, writeFileSync } from "fs";

const argv  = process.argv.slice(2);
const arg   = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i+1] : d; };

const PAYLOAD_FILE  = arg("--payload",     "nphies_normalized_bat4295.json");
const OUT_JSON      = arg("--output-json", "dry_run_bat4295.json");
const OUT_CSV       = arg("--output-csv",  "dry_run_bat4295.csv");

const KNOWN_CODES = new Set([
  "BE-1-3","BE-1-4","MN-1-1","CV-1-3","CV-1-4","CV-1-9",
  "AD-1-4","AD-2-4","AD-3-7","SE-1-6","MN-2-1",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let payload;
try {
  payload = JSON.parse(readFileSync(PAYLOAD_FILE, "utf8"));
} catch (e) {
  console.error(`❌  Cannot read payload: ${PAYLOAD_FILE}`);
  process.exit(1);
}

const submissions = Array.isArray(payload) ? payload : (payload.submissions || []);
const deadline    = payload.meta?.appealDeadline || null;
const today       = new Date().toISOString().split("T")[0];
const withinWindow = deadline ? today <= deadline : true;

const rows = [];

for (const s of submissions) {
  const issues = [];

  // 1. Bundle ID format
  if (!UUID_RE.test(s.bundleId || "")) issues.push("INVALID_BUNDLE_ID");

  // 2. National ID
  if (!s.nationalId || s.nationalId.length < 8) issues.push("MISSING_NATIONAL_ID");

  // 3. Service date
  if (!DATE_RE.test(s.serviceDate || "")) issues.push("INVALID_SERVICE_DATE");

  // 4. Rejection codes — all must be known
  const unknownCodes = (s.rejectionCodes || []).filter(c => !KNOWN_CODES.has(c));
  if (unknownCodes.length) issues.push(`UNKNOWN_CODES:${unknownCodes.join(",")}`);

  // 5. Blocker check
  if (s.requiresRecode) issues.push("BLOCKER_RECODE_96092-ERR");

  // 6. Attachments must be array (not number)
  if (typeof s.attachments === "number") {
    issues.push("ATTACHMENTS_NUMERIC_NOT_ARRAY");
  } else if (!Array.isArray(s.attachments) || s.attachments.length === 0) {
    issues.push("NO_ATTACHMENTS_DEFINED");
  } else {
    const noType = s.attachments.filter(a => !a.type);
    if (noType.length) issues.push(`ATTACHMENTS_MISSING_TYPE:${noType.length}`);
    const noLabel = s.attachments.filter(a => !a.label);
    if (noLabel.length) issues.push(`ATTACHMENTS_MISSING_LABEL:${noLabel.length}`);
  }

  // 7. Appeal window
  if (!withinWindow) issues.push(`OUTSIDE_APPEAL_WINDOW:${deadline}`);

  // 8. Patient name
  if (!s.patientName || s.patientName.trim().length < 3) issues.push("MISSING_PATIENT_NAME");

  const status = issues.length === 0 ? "PASS"
    : issues.some(i => i.startsWith("BLOCKER")) ? "BLOCKER"
    : "FAIL";

  rows.push({
    seq:             s.seq,
    status,
    priority:        s.priority,
    patientName:     s.patientName,
    nationalId:      s.nationalId,
    bundleId:        s.bundleId,
    serviceDate:     s.serviceDate,
    rejectionCodes:  (s.rejectionCodes || []).join("+"),
    items:           (s.rejections || []).length,
    requiredAttachments: (s.attachments || []).filter(a => a.required).length,
    issues:          issues.join(" | ") || "—",
    specialNote:     s.specialNote || "",
  });
}

// Summary
const summary = {
  generatedAt:   new Date().toISOString(),
  payload:       PAYLOAD_FILE,
  appealDeadline: deadline,
  withinWindow,
  total:         rows.length,
  PASS:          rows.filter(r => r.status === "PASS").length,
  FAIL:          rows.filter(r => r.status === "FAIL").length,
  BLOCKER:       rows.filter(r => r.status === "BLOCKER").length,
  byPriority: {
    CRITICAL: rows.filter(r => r.priority === "CRITICAL").length,
    HIGH:     rows.filter(r => r.priority === "HIGH").length,
    NORMAL:   rows.filter(r => r.priority === "NORMAL").length,
    BLOCKER:  rows.filter(r => r.priority === "BLOCKER").length,
  },
};

// JSON output
writeFileSync(OUT_JSON, JSON.stringify({ summary, rows }, null, 2));

// CSV output
const headers = Object.keys(rows[0]);
const csvLines = [
  headers.join(","),
  ...rows.map(r =>
    headers.map(h => {
      const v = String(r[h] ?? "").replace(/"/g, '""');
      return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
    }).join(",")
  ),
];
writeFileSync(OUT_CSV, csvLines.join("\n"));

// Console summary
console.log("\n─── Dry-Run Checklist Results ───");
console.log(`  Total submissions : ${summary.total}`);
console.log(`  ✅ PASS           : ${summary.PASS}`);
console.log(`  ❌ FAIL           : ${summary.FAIL}`);
console.log(`  🚫 BLOCKER        : ${summary.BLOCKER}`);
console.log(`  Appeal deadline   : ${deadline || "—"} (${withinWindow ? "✅ within window" : "❌ EXPIRED"})`);
console.log(`\n  Output: ${OUT_JSON}`);
console.log(`  Output: ${OUT_CSV}\n`);

if (summary.FAIL > 0) {
  console.log("FAIL details:");
  rows.filter(r => r.status === "FAIL").forEach(r =>
    console.log(`  [${r.seq}] ${r.patientName} | ${r.issues}`)
  );
}
if (summary.BLOCKER > 0) {
  console.log("\nBLOCKER details (recode required):");
  rows.filter(r => r.status === "BLOCKER").forEach(r =>
    console.log(`  [${r.seq}] ${r.patientName} | ${r.bundleId.slice(0,8)} | ${r.serviceDate}`)
  );
}
