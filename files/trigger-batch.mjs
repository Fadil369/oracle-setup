/**
 * COMPLIANCELINC — trigger-batch.mjs
 * Run from MacBook: node trigger-batch.mjs
 *
 * Reads nphies_normalized_bat4295.json → sends to CF Worker → writes results
 */

import { readFileSync, writeFileSync } from "fs";

const WORKER_URL = "https://oracle-claim-scanner.brainsait.workers.dev";
const PAYLOAD    = process.argv[2] || "nphies_normalized_bat4295.json";

const payload = JSON.parse(readFileSync(PAYLOAD, "utf8"));
const submissions = payload.submissions || [];

// Skip blockers
const eligible = submissions.filter(s =>
  !s.requiresRecode && !s.rejectionCodes?.includes("BE-1-3")
);
const blockers = submissions.filter(s => s.requiresRecode);

console.log(`\nBatch: ${payload.meta?.batchId}`);
console.log(`Total  : ${submissions.length}`);
console.log(`Eligible: ${eligible.length}  |  Blockers: ${blockers.length}`);
console.log(`Deadline: ${payload.meta?.appealDeadline}\n`);

// Send batch to worker
const res = await fetch(`${WORKER_URL}/scan-batch`, {
  method:  "POST",
  headers: { "Content-Type": "application/json" },
  body:    JSON.stringify({ submissions: eligible }),
});

if (!res.ok) {
  console.error(`Worker error: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const results = await res.json();

// Save results
const outFile = `scan_results_${Date.now()}.json`;
writeFileSync(outFile, JSON.stringify(results, null, 2));

console.log(`\n─── Results ─────────────────────────────────────────`);
console.log(`  Processed : ${results.processed}`);
console.log(`  GO        : ${results.go}`);
console.log(`  PARTIAL   : ${results.partial}`);
console.log(`  NO_GO     : ${results.noGo}`);
console.log(`  Errors    : ${results.errors}`);
console.log(`  Saved     : ${outFile}`);

// Print GO claims
if (results.go > 0) {
  console.log(`\n✅  GO claims ready for NPHIES submission:`);
  results.results
    .filter(r => r.gateStatus === "GO")
    .forEach(r => console.log(`  [${r.bundleId.slice(0,8)}] ${r.patientName || r.nationalId} | docs: ${r.docCount}`));
}

// Print blockers reminder
if (blockers.length > 0) {
  console.log(`\n🚫  ${blockers.length} BLOCKER bundles (96092-ERR) still need recoding:`);
  blockers.slice(0, 5).forEach(b =>
    console.log(`  ${b.patientName} | ${b.nationalId} | ${b.serviceDate}`)
  );
}
