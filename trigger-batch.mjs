/**
 * COMPLIANCELINC — trigger-batch.mjs
 * Run from MacBook: node trigger-batch.mjs [payload.json] [--parallel N] [--hospital riyadh]
 *
 * Reads nphies_normalized_bat4295.json → sends to CF Worker → writes results
 * 
 * Options:
 *   --parallel N     Process N claims in parallel (via individual /scan requests)
 *   --single         Process claims one by one via /scan endpoint
 *   --retry N        Retry failed scans N times (default: 2)
 *   --hospital ID    Target hospital (riyadh, madinah, unaizah, khamis, jizan, abha)
 */

import { readFileSync, writeFileSync } from "fs";
import { validateSBSCodes, enrichWithFHIR } from "./fhir-integration/index.mjs";

const WORKER_URL = process.env.WORKER_URL || "https://oracle-scanner.elfadil.com";
const API_KEY    = process.env.API_KEY;

if (!API_KEY) {
  console.error("ERROR: API_KEY is required. Export API_KEY before running trigger-batch.");
  process.exit(1);
}

const AUTH_HEADERS = {
  "Content-Type":  "application/json",
  "Authorization": `Bearer ${API_KEY}`,
};
const PAYLOAD = process.argv[2] || "nphies_normalized_bat4295.json";
const PARALLEL = process.argv.includes("--parallel") 
  ? parseInt(process.argv[process.argv.indexOf("--parallel") + 1]) || 5 
  : 0;
const SINGLE_MODE = process.argv.includes("--single");
const RETRY_COUNT = process.argv.includes("--retry")
  ? parseInt(process.argv[process.argv.indexOf("--retry") + 1]) || 2
  : 2;
const HOSPITAL = process.argv.includes("--hospital")
  ? process.argv[process.argv.indexOf("--hospital") + 1]
  : "riyadh";

const VALID_HOSPITALS = ["riyadh", "madinah", "unaizah", "khamis", "jizan", "abha"];
const BATCH_CHUNK_SIZE = 10; // Cloudflare Worker max limits ~10-15 sequentially to prevent timeout

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options, retries = RETRY_COUNT) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000); // 3min timeout
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (e) {
      if (i === retries) throw e;
      console.log(`  ⚠ Retry ${i + 1}/${retries} after error: ${e.message}`);
      await sleep(2000 * (i + 1)); // Exponential backoff
    }
  }
}

async function scanSingle(sub) {
  const res = await fetchWithRetry(`${WORKER_URL}/scan`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      nationalId: sub.nationalId,
      bundleId: sub.bundleId,
      serviceDate: sub.serviceDate,
      patientName: sub.patientName,
      hospital: HOSPITAL,
    }),
  });
  return res.json();
}

async function processParallel(submissions, concurrency) {
  const results = [];
  const errors = [];
  
  for (let i = 0; i < submissions.length; i += concurrency) {
    const batch = submissions.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(submissions.length / concurrency);
    
    console.log(`  Processing chunk ${batchNum}/${totalBatches} (${batch.length} claims)...`);
    
    const batchResults = await Promise.allSettled(batch.map(scanSingle));
    
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results.push(result.value);
        const status = result.value.gateStatus;
        const icon = status === "GO" ? "✅" : status === "PARTIAL" ? "⚠️" : "❌";
        console.log(`    ${icon} ${batch[j].patientName || batch[j].nationalId}: ${status}`);
      } else {
        errors.push({ bundleId: batch[j].bundleId, error: result.reason?.message });
        console.log(`    ❌ ${batch[j].patientName || batch[j].nationalId}: ERROR - ${result.reason?.message}`);
      }
    }
    
    // Delay between chunks to avoid CF limits
    if (i + concurrency < submissions.length) {
      await sleep(1500);
    }
  }
  
  return { results, errors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Validate hospital
if (!VALID_HOSPITALS.includes(HOSPITAL)) {
  console.error(`❌ Invalid hospital: ${HOSPITAL}`);
  console.error(`   Valid hospitals: ${VALID_HOSPITALS.join(", ")}`);
  process.exit(1);
}

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  COMPLIANCELINC — Multi-Hospital Oracle Claim Scanner            ║
║  Worker: ${WORKER_URL.padEnd(52)}║
║  Hospital: ${HOSPITAL.toUpperCase().padEnd(50)}║
╚══════════════════════════════════════════════════════════════════╝
`);

const payload = JSON.parse(readFileSync(PAYLOAD, "utf8"));
const submissions = payload.submissions || [];

// FHIR preflight: validate and enrich SBS codes when available in submission payload.
let fhirPreflight = {
  validatedSubmissions: 0,
  totalCodes: 0,
  invalidCodes: 0,
  priorAuthCodes: 0,
};

for (const sub of submissions) {
  const codes = (sub.rejections || [])
    .map((r) => r?.code)
    .filter((c) => typeof c === "string" && c.length > 0);
  if (!codes.length) continue;

  try {
    const validation = await validateSBSCodes(codes);
    const enriched = await enrichWithFHIR(validation.valid);

    sub.fhir = {
      sbsValidation: validation,
      sbsCoding: enriched,
    };

    fhirPreflight.validatedSubmissions += 1;
    fhirPreflight.totalCodes += codes.length;
    fhirPreflight.invalidCodes += validation.invalid.length;
    fhirPreflight.priorAuthCodes += validation.prior_auth_required.length;
  } catch (e) {
    sub.fhir = {
      warning: `FHIR preflight unavailable: ${e.message}`,
    };
  }
}

// Skip blockers
const eligible = submissions.filter(s =>
  !s.requiresRecode && !s.rejectionCodes?.includes("BE-1-3")
);
const blockers = submissions.filter(s => s.requiresRecode);

console.log(`📋 Batch: ${payload.meta?.batchId || "unknown"}`);
console.log(`   Total   : ${submissions.length}`);
console.log(`   Eligible: ${eligible.length}`);
console.log(`   Blockers: ${blockers.length}`);
console.log(`   Deadline: ${payload.meta?.appealDeadline || "N/A"}`);
console.log(`   Hospital: ${HOSPITAL}`);
console.log(`   Mode    : ${SINGLE_MODE ? "Single" : PARALLEL > 0 ? `Parallel (${PARALLEL})` : "Batch Chunked"}\n`);
console.log(`   FHIR    : validated ${fhirPreflight.validatedSubmissions} submissions, invalid codes ${fhirPreflight.invalidCodes}, prior-auth flags ${fhirPreflight.priorAuthCodes}\n`);

// Before scanning, ping status to ensure worker is up
try {
  const statusRes = await fetchWithRetry(`${WORKER_URL}/status`, { headers: AUTH_HEADERS });
  if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);
} catch (e) {
  console.log(`⚠ Warning: CF Worker status check failed (${e.message}). Proceeding anyway...`);
}

const startTime = Date.now();
let finalResults = {
  batchId: `batch-${Date.now()}`,
  total: eligible.length,
  processed: 0,
  skippedBlockers: blockers.length,
  go: 0,
  partial: 0,
  noGo: 0,
  errorCount: 0,
  results: [],
  errors: [],
};

if (SINGLE_MODE || PARALLEL > 0) {
  // Process via individual /scan calls
  const concurrency = PARALLEL || 1;
  console.log(`🔄 Processing ${eligible.length} claims individual mode (${concurrency} at a time)...\n`);
  
  const { results: scanResults, errors } = await processParallel(eligible, concurrency);
  finalResults.results = scanResults;
  finalResults.errors = errors;

} else {
  // Process via /scan-batch in manageable chunks
  console.log(`🔄 Sending batch to worker in chunks of ${BATCH_CHUNK_SIZE}...\n`);
  
  for (let i = 0; i < eligible.length; i += BATCH_CHUNK_SIZE) {
    const chunk = eligible.slice(i, i + BATCH_CHUNK_SIZE);
    const chunkNum = Math.floor(i / BATCH_CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(eligible.length / BATCH_CHUNK_SIZE);
    
    console.log(`  🚀 Sending chunk ${chunkNum}/${totalChunks} (${chunk.length} claims) to Cloudflare...`);
    
    const res = await fetchWithRetry(`${WORKER_URL}/scan-batch`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ submissions: chunk, hospital: HOSPITAL }),
    });

    if (!res.ok) {
      console.error(`  ❌ Worker HTTP error: ${res.status} ${await res.text()}`);
      finalResults.errors.push({ chunk: chunkNum, error: `HTTP ${res.status}` });
      continue;
    }

    const chunkData = await res.json();
    finalResults.results.push(...(chunkData.results || []));
    finalResults.errors.push(...(chunkData.errorDetails || []));
    
    const chunkGo = (chunkData.results || []).filter(r => r.gateStatus === "GO").length;
    const chunkNoGo = (chunkData.results || []).filter(r => r.gateStatus === "NO_GO").length;
    console.log(`     Response complete -> ${chunkGo} GO`);
  }
}

// Compute aggregate metrics
finalResults.processed = finalResults.results.length;
finalResults.go = finalResults.results.filter(r => r.gateStatus === "GO").length;
finalResults.partial = finalResults.results.filter(r => r.gateStatus === "PARTIAL").length;
finalResults.noGo = finalResults.results.filter(r => r.gateStatus === "NO_GO").length;
finalResults.errorCount = finalResults.errors.length;

const duration = Date.now() - startTime;
finalResults.batchDuration = `${duration}ms`;
finalResults.avgScanTime = finalResults.results.length ? `${Math.round(duration / finalResults.results.length)}ms` : "N/A";
finalResults.completedAt = new Date().toISOString();
finalResults.fhirPreflight = fhirPreflight;

// Save results
const outFile = `scan_results_${Date.now()}.json`;
writeFileSync(outFile, JSON.stringify(finalResults, null, 2));

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  SCAN RESULTS                                                     ║
╠══════════════════════════════════════════════════════════════════╣
║  Processed : ${String(finalResults.processed).padEnd(49)}║
║  ✅ GO     : ${String(finalResults.go).padEnd(49)}║
║  ⚠️  PARTIAL: ${String(finalResults.partial).padEnd(49)}║
║  ❌ NO_GO  : ${String(finalResults.noGo).padEnd(49)}║
║  🚨 Errors : ${String(finalResults.errorCount || 0).padEnd(49)}║
║  ⏱️  Duration: ${String(finalResults.batchDuration).padEnd(47)}║
║  📁 Saved  : ${outFile.padEnd(49)}║
╚══════════════════════════════════════════════════════════════════╝
`);

// Print GO claims
if (finalResults.go > 0) {
  console.log(`✅ GO claims ready for NPHIES submission:`);
  finalResults.results
    .filter(r => r.gateStatus === "GO")
    .forEach(r => console.log(`   [${r.bundleId?.slice(0,8) || "unknown"}] ${r.patientName || r.nationalId} | docs: ${r.docCount}`));
  console.log();
}

// Print PARTIAL claims
if (finalResults.partial > 0) {
  console.log(`⚠️  PARTIAL claims (patient found, no docs):`);
  finalResults.results
    .filter(r => r.gateStatus === "PARTIAL")
    .slice(0, 10)
    .forEach(r => console.log(`   [${r.bundleId?.slice(0,8) || "unknown"}] ${r.patientName || r.nationalId}`));
  console.log();
}

// Print blockers reminder
if (blockers.length > 0) {
  console.log(`🚫 ${blockers.length} BLOCKER bundles (96092-ERR) still need recoding:`);
  blockers.slice(0, 5).forEach(b =>
    console.log(`   ${b.patientName} | ${b.nationalId} | ${b.serviceDate}`)
  );
  if (blockers.length > 5) console.log(`   ... and ${blockers.length - 5} more`);
  console.log();
}

// Print errors if any
if (finalResults.errorCount > 0) {
  console.log(`🚨 Errors encountered:`);
  finalResults.errors.slice(0, 5).forEach(e =>
    console.log(`   [${e.bundleId?.slice(0,8) || "unknown"}] ${e.error}`)
  );
  console.log();
}

// Export CSV for easy review
const csvFile = outFile.replace('.json', '.csv');
const csvRows = ['bundleId,nationalId,patientName,serviceDate,gateStatus,docCount,mrn'];
finalResults.results?.forEach(r => {
  csvRows.push(`${r.bundleId},${r.nationalId},"${r.patientName || ''}",${r.serviceDate || ''},${r.gateStatus},${r.docCount || 0},${r.mrn || ''}`);
});
writeFileSync(csvFile, csvRows.join('\n'));
console.log(`📊 CSV exported: ${csvFile}`);
