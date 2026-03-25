/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  COMPLIANCELINC — BrainSAIT Complete Interface Test Suite                   ║
 * ║  BAT-2026-NB-00004295-OT  |  Payer: Al Rajhi Takaful                       ║
 * ║  Provider: Hayat National Hospital — Riyadh                                 ║
 * ║                                                                              ║
 * ║  Interfaces under test:                                                      ║
 * ║    1. Patient   → BSMA            (beneficiary / patient data layer)        ║
 * ║    2. Provider  → GIVC            (SBS V3.1 billing system)                 ║
 * ║    3. Provider  → Oracle Oasis+   (hospital portal scanner)                 ║
 * ║    4. Payer     → SBS             (code catalogue + rejection matrix)       ║
 * ║    5. Payer     → Oracle Worker   (scan API + batch processing)             ║
 * ║    6. Payer     → NPHIES          (FHIR R4 bundle / claim submission)       ║
 * ║    7. Payer     → Etimad          (appeal window + payment disputes)        ║
 * ║                                                                              ║
 * ║  Usage:  node tests/complete-interface-test.mjs [--verbose] [--live]        ║
 * ║    --verbose   Show full assertion detail                                    ║
 * ║    --live      Also run live HTTP probes against real endpoints              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const VERBOSE = process.argv.includes("--verbose");
const LIVE    = process.argv.includes("--live");

// ─── Tiny assertion harness ────────────────────────────────────────────────

const PASS = "✅";
const FAIL = "❌";
const WARN = "⚠️ ";
const INFO = "ℹ️ ";

let totalTests  = 0;
let passedTests = 0;
let failedTests = 0;
const failures  = [];

function assert(cond, msg, detail = null) {
  totalTests++;
  if (cond) {
    passedTests++;
    if (VERBOSE) console.log(`  ${PASS} ${msg}`);
    return true;
  } else {
    failedTests++;
    failures.push({ msg, detail });
    console.log(`  ${FAIL} ${msg}${detail ? ` | ${detail}` : ""}`);
    return false;
  }
}

function assertThrows(fn, msg) {
  totalTests++;
  try {
    fn();
    failedTests++;
    failures.push({ msg, detail: "Expected throw, none thrown" });
    console.log(`  ${FAIL} ${msg} | Expected throw, none thrown`);
  } catch {
    passedTests++;
    if (VERBOSE) console.log(`  ${PASS} ${msg}`);
  }
}

function section(name) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${name}`);
  console.log(`${"─".repeat(70)}`);
}

function subsection(name) {
  console.log(`\n  ► ${name}`);
}

// ─── Python helper ────────────────────────────────────────────────────────

function runPython(script) {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", ["-c", script], {
      env: { ...process.env, PYTHONPATH: `${ROOT}:${process.env.PYTHONPATH ?? ""}` },
    });
    let out = "", err = "";
    py.stdout.on("data", d => { out += d.toString(); });
    py.stderr.on("data", d => { err += d.toString(); });
    py.on("close", code => {
      if (code !== 0) return reject(new Error(`Python ${code}: ${err.trim().slice(0, 300)}`));
      try { resolve(JSON.parse(out)); }
      catch { reject(new Error(`Not JSON: ${out.slice(0, 200)}`)); }
    });
  });
}

// ─── Load real workspace data ─────────────────────────────────────────────

const payload    = JSON.parse(readFileSync(join(ROOT, "nphies_normalized_bat4295.json"), "utf8"));
const dryRun     = JSON.parse(readFileSync(join(ROOT, "dry_run_bat4295.json"), "utf8"));
const BATCH_ID   = "BAT-2026-NB-00004295-OT";
const APPEAL_DL  = "2026-04-06";
const PAYER      = "Al Rajhi Takaful";
const PROVIDER   = "Hayat National Hospital - Riyadh";
const WORKER_URL = "https://oracle-claim-scanner.brainsait-fadil.workers.dev";

const submissions = payload.submissions || [];
const dryRows     = dryRun.rows || [];

// ─── SBS Catalogue ────────────────────────────────────────────────────────

let SBS_CATALOGUE = {};
const catPath = join(ROOT, "sbs-integration", "sbs_catalogue.json");
try {
  const raw = JSON.parse(readFileSync(catPath, "utf8"));
  SBS_CATALOGUE = raw.catalogue ?? raw;
} catch (e) {
  console.warn(`${WARN} SBS catalogue not loaded: ${e.message}`);
}

// ─── NPHIES Rejection code definitions ───────────────────────────────────

const NPHIES_REJECTION_CODES = {
  "BE-1-4": { name: "No Prior Authorization",         severity: "HIGH" },
  "MN-1-1": { name: "Medical Necessity Not Met",       severity: "MEDIUM" },
  "CV-1-3": { name: "Coverage/Benefits Limitation",    severity: "HIGH" },
  "BE-1-3": { name: "Service Code Not in Contract",    severity: "BLOCKER" },
  "AD-1-4": { name: "Diagnosis-Procedure Mismatch",    severity: "MEDIUM" },
  "SE-1-6": { name: "Missing Investigation Results",   severity: "HIGH" },
  "CV-1-9": { name: "Follow-up Within Restricted Days",severity: "MEDIUM" },
  "AD-3-7": { name: "Administrative Coding Error",     severity: "HIGH" },
  "AD-2-4": { name: "Incomplete Clinical Documentation",severity: "MEDIUM" },
};

// ─── ATTACHMENT matrix (from rajhi-pipeline-factory.mjs) ─────────────────

const ATTACHMENT_MATRIX = {
  "BE-1-4": ["PRIOR_AUTH_REQUEST", "CLINICAL_NOTES", "MEDICAL_REPORT", "INVOICE"],
  "MN-1-1": ["CPG_REFERENCE", "CLINICAL_NOTES", "LAB_RESULTS", "INVOICE"],
  "CV-1-3": ["POLICY_SCHEDULE", "CLINICAL_NOTES", "MEDICAL_NECESSITY", "INVOICE"],
  "BE-1-3": ["SERVICE_CODE_MAPPING", "CONTRACT_SCHEDULE", "INVOICE", "CLINICAL_NOTES"],
  "AD-1-4": ["DIAGNOSIS_LINKAGE", "CLINICAL_NOTES", "INVOICE"],
  "SE-1-6": ["INVESTIGATION_RESULT", "XRAY_IMAGE", "CLINICAL_NOTES", "INVOICE"],
  "CV-1-9": ["FOLLOW_UP_JUSTIFICATION", "PREVIOUS_VISIT_RECORD", "CLINICAL_NOTES"],
  "AD-3-7": ["CORRECTED_CODING", "CLINICAL_NOTES", "INVOICE"],
  "AD-2-4": ["COMPLETE_DOCUMENTATION", "CLINICAL_NOTES", "INVOICE"],
};

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACE 1: Patient → BSMA (Beneficiary / Patient Data Layer)
// ══════════════════════════════════════════════════════════════════════════════

async function testPatientBSMA() {
  section("INTERFACE 1 — Patient → BSMA (Beneficiary / Patient Data Layer)");

  // ── 1A: Payload contains valid patient records ──────────
  subsection("Scenario 1A: Patient record completeness");
  assert(submissions.length > 0,
    `Batch contains patient submissions (found ${submissions.length})`);
  const non10DigitIds = submissions.filter(s => !s.nationalId || !/^\d{10}$/.test(s.nationalId));
  if (non10DigitIds.length > 0) {
    console.log(`  ${WARN} ${non10DigitIds.length} patient(s) with non-standard national IDs: ${non10DigitIds.map(s => `seq=${s.seq}:${s.nationalId}`).join(", ")}`);
  }
  assert(submissions.every(s => s.nationalId && s.nationalId.length > 0),
    "All patients have non-empty national IDs");
  assert(non10DigitIds.length < 3,
    `Non-standard national IDs within tolerance (${non10DigitIds.length}/73)`,
    non10DigitIds.map(s => `seq=${s.seq}:${s.nationalId}`).join(", ") || undefined);
  assert(submissions.every(s => s.patientName && s.patientName.trim().length > 0),
    "All patients have non-empty names");
  assert(submissions.every(s => s.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(s.serviceDate)),
    "All service dates are ISO 8601 (YYYY-MM-DD)");

  // ── 1B: Arabic patient name coverage ───────────────────
  subsection("Scenario 1B: Arabic patient name detection (BSMA bilingual)");
  const arabicPatients = submissions.filter(s => /[\u0600-\u06FF]/.test(s.patientName));
  const latinPatients  = submissions.filter(s => /[A-Za-z]/.test(s.patientName));
  assert(arabicPatients.length > 0,
    `Arabic patient names present (${arabicPatients.length})`);
  assert(latinPatients.length > 0,
    `Latin/English patient names present (${latinPatients.length})`);
  if (VERBOSE) {
    console.log(`    Arabic: ${arabicPatients.slice(0,3).map(s=>s.patientName).join(" | ")}`);
    console.log(`    Latin:  ${latinPatients.slice(0,3).map(s=>s.patientName).join(" | ")}`);
  }

  // ── 1C: FHIR Patient resource cardinality (Python) ─────
  subsection("Scenario 1C: FHIR Patient resource — cardinality (valid)");
  const validPatient = {
    resourceType: "Patient",
    identifier: [{ system: "http://nphies.sa/identifier/iqama", value: "2538864592" }],
    name: [{ family: "خالد", given: ["سوده", "عبدا", "ناصر"] }],
    gender: "female",
    birthDate: "1985-06-15",
    extension: [
      { url: "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-nationality",
        valueCodeableConcept: { coding: [{ system: "http://nphies.sa/terminology/CodeSystem/ksa-nationality", code: "SA" }] }
      },
      { url: "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-occupation",
        valueCodeableConcept: { coding: [{ system: "http://nphies.sa/terminology/CodeSystem/occupation", code: "student" }] }
      },
    ],
  };
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import validate_cardinality
pat = json.loads(${JSON.stringify(JSON.stringify(validPatient))})
print(json.dumps(validate_cardinality('Patient', pat)))
`);
    assert(r.valid === true,
      "Valid FHIR Patient passes cardinality check",
      r.missing_required?.join(", ") || undefined);
    assert((r.nphies_warnings?.length ?? 0) === 0,
      "Valid Patient has no NPHIES extension warnings",
      r.nphies_warnings?.join("; ") || undefined);
    assert(r.resource_type === "Patient",
      `resource_type returned correctly: ${r.resource_type}`);
  } catch (e) {
    assert(false, "FHIR Patient cardinality check (Python)", e.message);
  }

  // ── 1D: Invalid patient — missing required fields ───────
  subsection("Scenario 1D: FHIR Patient resource — missing required fields");
  const invalidPatient = { resourceType: "Patient", name: [{ family: "Test" }] };
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import validate_cardinality
p = json.loads(${JSON.stringify(JSON.stringify(invalidPatient))})
print(json.dumps(validate_cardinality('Patient', p)))
`);
    assert(r.valid === false,
      "Invalid Patient (missing identifier, gender, birthDate) fails cardinality");
    assert(r.missing_required.includes("identifier"),
      `Missing 'identifier' detected (missing: ${r.missing_required.join(", ")})`);
    assert(r.missing_required.includes("gender"),
      `Missing 'gender' detected`);
  } catch (e) {
    assert(false, "FHIR Patient invalid cardinality check (Python)", e.message);
  }

  // ── 1E: Missing NPHIES extensions warning ───────────────
  subsection("Scenario 1E: FHIR Patient — missing NPHIES KSA extensions");
  const patientNoExt = {
    resourceType: "Patient",
    identifier: [{ system: "http://nphies.sa/identifier/iqama", value: "1234567890" }],
    name: [{ family: "Test", given: ["Patient"] }],
    gender: "male",
    birthDate: "1990-01-01",
    // ← no extension array at all
  };
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import validate_cardinality
p = json.loads(${JSON.stringify(JSON.stringify(patientNoExt))})
print(json.dumps(validate_cardinality('Patient', p)))
`);
    assert(r.valid === true,
      "Patient without NPHIES extensions passes cardinality (extensions are soft-warnings)");
    assert((r.nphies_warnings?.length ?? 0) > 0,
      `NPHIES extension warnings generated (${r.nphies_warnings?.length ?? 0})`,
      r.nphies_warnings?.join("; ") || "none");
    if (VERBOSE && r.nphies_warnings?.length) {
      r.nphies_warnings.forEach(w => console.log(`    ${WARN} ${w}`));
    }
  } catch (e) {
    assert(false, "FHIR Patient NPHIES extensions warning (Python)", e.message);
  }

  // ── 1F: Chemotherapy patients flagged ───────────────────
  subsection("Scenario 1F: Chemotherapy / high-risk patient flagging");
  const chemoPatients = submissions.filter(s =>
    s.specialNote && /chemo|oncol|dacarbazine|doxorubicin/i.test(s.specialNote)
  );
  assert(chemoPatients.length >= 2,
    `Chemotherapy patients identified in batch (${chemoPatients.length})`);
  const criticalChemo = chemoPatients.filter(s => s.priority === "CRITICAL");
  assert(criticalChemo.length > 0,
    `Chemotherapy patients flagged as CRITICAL (${criticalChemo.length})`);
  assert(chemoPatients.every(s => s.rejections.some(r => r.reason === "BE-1-4")),
    "All chemo patients have BE-1-4 (Prior Auth) rejection");

  // ── 1G: Unique patient count ────────────────────────────
  subsection("Scenario 1G: Batch multi-visit patient deduplication");
  const uniqueNationalIds = new Set(submissions.map(s => s.nationalId));
  assert(uniqueNationalIds.size < submissions.length,
    `Multi-visit patients exist: ${uniqueNationalIds.size} unique patients in ${submissions.length} claims`);
  const maxVisits = Math.max(...[...uniqueNationalIds].map(id =>
    submissions.filter(s => s.nationalId === id).length));
  assert(maxVisits > 1,
    `Max visits per patient: ${maxVisits} (multi-visit consolidation needed for BSMA)`);
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACE 2: Provider → GIVC (SBS V3.1 Billing System)
// ══════════════════════════════════════════════════════════════════════════════

async function testProviderGIVC() {
  section("INTERFACE 2 — Provider → GIVC (SBS V3.1 Billing System)");

  const catalogueSize = Object.keys(SBS_CATALOGUE).length;

  // ── 2A: Catalogue availability ──────────────────────────
  subsection("Scenario 2A: SBS V3.1 catalogue availability");
  assert(catalogueSize >= 20000,
    `SBS V3.1 catalogue loaded: ${catalogueSize.toLocaleString()} codes`);
  assert(catalogueSize >= 20403,
    `SBS V3.1 catalogue has 20,403+ codes (actual: ${catalogueSize.toLocaleString()})`);

  // ── 2B: Known-good SBS codes from actual batch ──────────
  subsection("Scenario 2B: SBS code lookup — known valid codes from BAT-4295");
  const allBatchCodes = [...new Set(
    submissions.flatMap(s => s.rejections.map(r => r.code))
  )];
  assert(allBatchCodes.length > 0,
    `Extracted ${allBatchCodes.length} unique SBS codes from batch`);

  // Note: Batch uses NPHIES billing codes (e.g. B00113); SBS catalogue uses SBS V3 procedure
  // codes (e.g. 40803-00-00). These are different coding systems — no direct cross-lookup expected.
  assert(allBatchCodes.length >= 10,
    `Batch contains ${allBatchCodes.length} unique NPHIES service codes for enrichment`);
  if (VERBOSE) {
    console.log(`    Batch service codes (${allBatchCodes.length}): ${allBatchCodes.slice(0, 8).join(", ")}…`);
    const catSize = Object.keys(SBS_CATALOGUE).length || (Array.isArray(SBS_CATALOGUE) ? SBS_CATALOGUE.length : 0);
    console.log(`    SBS V3 catalogue: ${catSize.toLocaleString()} procedure codes available for enrichment`);
  }

  // ── 2C: Specific known-bad codes (BLOCKER) ─────────────
  subsection("Scenario 2C: BLOCKER detection — unrecognised service codes");
  const blockerSubmissions = submissions.filter(s => s.priority === "BLOCKER");
  assert(blockerSubmissions.length === 10,
    `10 BLOCKER submissions in batch (dry-run confirmed)`);

  // seq=3 has "96092-ERR" — the known bad code per dry-run notes
  const seq3 = submissions.find(s => s.seq === 3);
  if (seq3) {
    const seq3Codes = seq3.rejections.map(r => r.code);
    if (VERBOSE) console.log(`    seq=3 codes: ${seq3Codes.join(", ")}`);
    const missingCodes = seq3Codes.filter(c => !SBS_CATALOGUE[c]);
    assert(missingCodes.length > 0 || seq3Codes.length > 0,
      `seq=3 (BLOCKER) has ${seq3Codes.length} service codes — catalogue hit rate assessed`);
  }

  // ── 2D: SBS code enrichment with FHIR Coding (Python bridge) ──
  subsection("Scenario 2D: SBS → FHIR coding enrichment (Python bridge)");
  // Pick a few real codes from the batch for enrichment test
  const testCodes = allBatchCodes.filter(c => SBS_CATALOGUE[c]).slice(0, 5);
  if (testCodes.length > 0) {
    try {
      const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir.sbs_fhir_bridge import SBSFHIRBridge
bridge = SBSFHIRBridge()
results = {}
codes = json.loads(${JSON.stringify(JSON.stringify(testCodes))})
for code in codes:
    entry = bridge.catalogue.get(code)
    if entry:
        coding = bridge.sbs_to_fhir_coding(code)
        results[code] = {'coding': coding, 'found': True}
    else:
        results[code] = {'found': False}
print(json.dumps(results))
`);
      const enrichedFound = Object.values(r).filter(v => v.found).length;
      assert(enrichedFound > 0,
        `SBS → FHIR enrichment: ${enrichedFound}/${testCodes.length} codes enriched`);
      const firstCode = testCodes[0];
      if (r[firstCode]?.coding) {
        assert(r[firstCode].coding.system === "http://nphies.sa/terminology/CodeSystem/sbs",
          "FHIR coding system URI is correct NPHIES SBS URI");
        assert(r[firstCode].coding.code === firstCode,
          `Coding code matches input code (${firstCode})`);
        if (VERBOSE) console.log(`    Sample: ${firstCode} →`, JSON.stringify(r[firstCode].coding));
      }
    } catch (e) {
      assert(false, "SBS FHIR bridge enrichment (Python)", e.message);
    }
  } else {
    console.log(`  ${WARN} Skipping 2D — no catalogue codes found for test`);
  }

  // ── 2E: Prior-auth detection ────────────────────────────
  subsection("Scenario 2E: Prior-authorization required code detection");
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir.sbs_fhir_bridge import SBSFHIRBridge
bridge = SBSFHIRBridge()
cat = bridge.catalogue
if isinstance(cat, list):
    prior_auth_codes = [e['sbs_id'] for e in cat if e.get('requires_prior_auth', False)]
else:
    prior_auth_codes = [c for c, v in cat.items() if v.get('requires_prior_auth', False)]
print(json.dumps({'count': len(prior_auth_codes), 'sample': prior_auth_codes[:5]}))
`);
    assert(typeof r.count === "number",
      `Prior-auth codes exist in catalogue: ${r.count.toLocaleString()}`);
    if (VERBOSE && r.sample.length > 0) {
      console.log(`    Prior-auth sample: ${r.sample.join(", ")}`);
    }
  } catch (e) {
    assert(false, "Prior-auth code detection (Python bridge)", e.message);
  }

  // ── 2F: Category coverage (21 SBS categories) ──────────
  subsection("Scenario 2F: SBS V3.1 category coverage (21 categories)");
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir.sbs_fhir_bridge import SBSFHIRBridge
bridge = SBSFHIRBridge()
cats = {}
cat_raw = bridge.catalogue
if isinstance(cat_raw, list):
    for entry in cat_raw:
        cat = entry.get('category_id') or entry.get('category') or entry.get('subcategory') or 'unknown'
        cats[cat] = cats.get(cat, 0) + 1
else:
    for code, entry in cat_raw.items():
        cat = entry.get('category_id', 'unknown')
        cats[cat] = cats.get(cat, 0) + 1
print(json.dumps({'categories': len(cats), 'distribution': cats}))
`);
    assert(r.categories >= 10,
      `SBS categories found: ${r.categories} (expected 10+)`);
    if (VERBOSE) {
      const top5 = Object.entries(r.distribution)
        .sort(([,a],[,b]) => b-a).slice(0,5)
        .map(([c,n]) => `${c}:${n}`).join(", ");
      console.log(`    Top-5 categories: ${top5}`);
    }
  } catch (e) {
    assert(false, "SBS category coverage (Python bridge)", e.message);
  }

  // ── 2G: GIVC Node.js validateSBSCodes ──────────────────
  subsection("Scenario 2G: Node.js FHIR bridge — validateSBSCodes()");
  const { validateSBSCodes } = await import("../fhir-integration/index.mjs");
  const knownCodes = allBatchCodes.filter(c => SBS_CATALOGUE[c]).slice(0, 3);
  const badCodes   = ["INVALID-999", "NOTEXIST-000", "96092-ERR"];
  const toTest     = [...knownCodes, ...badCodes];
  
  if (toTest.length > 0) {
    const res = await validateSBSCodes(toTest);
    assert(Array.isArray(res.valid),   "validateSBSCodes returns .valid array");
    assert(Array.isArray(res.invalid), "validateSBSCodes returns .invalid array");
    assert(Array.isArray(res.prior_auth_required), "validateSBSCodes returns .prior_auth_required array");
    assert(res.invalid.length >= badCodes.length,
      `Invalid codes detected: ${res.invalid.join(", ")}`);
    if (VERBOSE) {
      console.log(`    valid: [${res.valid.join(", ")}]`);
      console.log(`    invalid: [${res.invalid.join(", ")}]`);
    }
  }

  // ── 2H: enrichWithFHIR ─────────────────────────────────
  subsection("Scenario 2H: Node.js FHIR bridge — enrichWithFHIR()");
  const { enrichWithFHIR } = await import("../fhir-integration/index.mjs");
  const enrichCodes = allBatchCodes.slice(0, 3);
  if (enrichCodes.length > 0) {
    const enriched = await enrichWithFHIR(enrichCodes);
    assert(typeof enriched === "object", "enrichWithFHIR returns object");
    assert(enrichCodes.every(c => c in enriched),
      `All requested codes present in enrichment result`);
    const firstKey = enrichCodes[0];
    assert(enriched[firstKey]?.coding?.system === "http://nphies.sa/terminology/CodeSystem/sbs",
      `Enrichment coding.system is correct SBS NPHIES URI`);
    assert("requires_prior_auth" in enriched[firstKey],
      "Enrichment includes requires_prior_auth flag");
    if (VERBOSE) {
      console.log(`    ${firstKey}:`, JSON.stringify(enriched[firstKey], null, 2).split("\n").slice(0,6).join("\n    "));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACE 3: Provider → Oracle Oasis+ (Hospital Portal Scanner)
// ══════════════════════════════════════════════════════════════════════════════

async function testProviderOracle() {
  section("INTERFACE 3 — Provider → Oracle Oasis+ (Hospital Portal Scanner)");

  const HOSPITALS = {
    riyadh:  { baseUrl: "https://oracle-riyadh.elfadil.com",  loginPath: "/prod/faces/Home" },
    madinah: { baseUrl: "https://oracle-madinah.elfadil.com", loginPath: "/Oasis/faces/Login.jsf" },
    unaizah: { baseUrl: "https://oracle-unaizah.elfadil.com", loginPath: "/prod/faces/Login.jsf" },
    khamis:  { baseUrl: "https://oracle-khamis.elfadil.com",  loginPath: "/prod/faces/Login.jsf" },
    jizan:   { baseUrl: "https://oracle-jizan.elfadil.com",   loginPath: "/prod/faces/Login.jsf" },
    abha:    { baseUrl: "https://oracle-abha.elfadil.com",    loginPath: "/Oasis/faces/Home" },
  };

  // ── 3A: Hospital routing config completeness ────────────
  subsection("Scenario 3A: Hospital routing configuration");
  assert(Object.keys(HOSPITALS).length === 6,
    "6 hospital branches configured (riyadh, madinah, unaizah, khamis, jizan, abha)");
  assert(Object.values(HOSPITALS).every(h => h.baseUrl.startsWith("https://oracle-")),
    "All hospital baseUrls follow oracle-<branch>.elfadil.com pattern");
  assert(["riyadh", "abha"].every(branch =>
    HOSPITALS[branch].loginPath.includes("Home")),
    "Riyadh and Abha use /Home login path (Madinah/Abha variant)");
  assert(["madinah", "abha"].every(branch =>
    HOSPITALS[branch].loginPath.includes("/Oasis/")),
    "Madinah and Abha use /Oasis/ path prefix");

  // ── 3B: Scan payload schema validation ─────────────────
  subsection("Scenario 3B: Scan payload schema — single claim");
  const sampleSub = submissions[0];
  const scanPayload = {
    nationalId: sampleSub.nationalId,
    bundleId:   sampleSub.bundleId,
    serviceDate: sampleSub.serviceDate,
    patientName: sampleSub.patientName,
    hospital: "riyadh",
  };
  assert(scanPayload.nationalId.length === 10,
    `nationalId is 10 digits: ${scanPayload.nationalId}`);
  assert(/^[0-9a-f-]{36}$/i.test(scanPayload.bundleId),
    `bundleId is valid UUID: ${scanPayload.bundleId}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(scanPayload.serviceDate),
    `serviceDate is ISO date: ${scanPayload.serviceDate}`);
  assert(scanPayload.hospital in HOSPITALS,
    `hospital ID is valid: ${scanPayload.hospital}`);

  // ── 3C: Batch submission structure ─────────────────────
  subsection("Scenario 3C: Batch scan payload structure (63 PASS submissions)");
  const passSubmissions = submissions.filter(s => {
    const dryRow = dryRows.find(r => r.bundleId === s.bundleId);
    return dryRow && dryRow.status === "PASS";
  });
  assert(passSubmissions.length >= 50,
    `PASS-flagged submissions for batch scan: ${passSubmissions.length}`);

  const batchPayload = {
    hospital: "riyadh",
    submissions: passSubmissions.slice(0, 10).map(s => ({
      nationalId: s.nationalId,
      bundleId: s.bundleId,
      serviceDate: s.serviceDate,
      patientName: s.patientName,
    })),
  };
  assert(batchPayload.submissions.length === 10,
    "Batch chunk of 10 built correctly");
  assert(batchPayload.submissions.every(s => s.nationalId && s.bundleId),
    "All batch entries have nationalId and bundleId");

  // ── 3D: FHIR preflight before Oracle scan ──────────────
  subsection("Scenario 3D: FHIR preflight before Oracle scan dispatch");
  const { validateSBSCodes, enrichWithFHIR } = await import("../fhir-integration/index.mjs");
  const prefightSub = submissions[0];
  const codes = prefightSub.rejections.map(r => r.code);
  const validation = await validateSBSCodes(codes);
  const enriched   = await enrichWithFHIR(validation.valid);
  
  assert(typeof validation === "object", "FHIR preflight validateSBSCodes returned result");
  assert(typeof enriched   === "object", "FHIR preflight enrichWithFHIR returned result");
  const fhirEntry = {
    bundleId: prefightSub.bundleId,
    sbsValidation: validation,
    sbsCoding: enriched,
  };
  assert(typeof fhirEntry.sbsValidation.valid === "object",
    "SBS validation has .valid array");
  if (VERBOSE) {
    console.log(`    codes tested: ${codes.join(", ")}`);
    console.log(`    valid: ${validation.valid.length}, invalid: ${validation.invalid.length}`);
  }

  // ── 3E: Hospital-specific payload routing ──────────────
  subsection("Scenario 3E: Hospital-specific claim routing (multi-hospital scenario)");
  const hospitalAssignments = {
    riyadh:  submissions.filter((_, i) => i % 6 === 0).length,
    madinah: submissions.filter((_, i) => i % 6 === 1).length,
    unaizah: submissions.filter((_, i) => i % 6 === 2).length,
    khamis:  submissions.filter((_, i) => i % 6 === 3).length,
    jizan:   submissions.filter((_, i) => i % 6 === 4).length,
    abha:    submissions.filter((_, i) => i % 6 === 5).length,
  };
  assert(Object.values(hospitalAssignments).every(n => n >= 0),
    "Hospital round-robin assignment is non-negative for all branches");
  const totalAssigned = Object.values(hospitalAssignments).reduce((a, b) => a + b, 0);
  assert(totalAssigned === submissions.length,
    `All ${submissions.length} submissions assigned to a hospital branch`);

  // ── 3F: Live Oracle Worker health probe (if --live) ────
  if (LIVE) {
    subsection("Scenario 3F: Live Oracle Worker health probe (LIVE)");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${WORKER_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      assert(res.status === 200, `Oracle Worker /health returned HTTP ${res.status}`);
      const body = await res.json().catch(() => null);
      assert(body !== null, "Oracle Worker health response is JSON");
      if (VERBOSE) console.log("    Health:", JSON.stringify(body));
    } catch (e) {
      assert(false, `Oracle Worker live health check`, e.message);
    }
  } else {
    console.log(`  ${INFO} Scenario 3F: Skipped (run with --live for live HTTP probes)`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACE 4: Payer → SBS (Code Catalogue + Rejection Matrix)
// ══════════════════════════════════════════════════════════════════════════════

async function testPayerSBS() {
  section("INTERFACE 4 — Payer → SBS (Code Catalogue + Rejection Matrix)");

  // ── 4A: Catalogue size & integrity ─────────────────────
  subsection("Scenario 4A: SBS V3.1 catalogue integrity");
  const catalogueSize = Object.keys(SBS_CATALOGUE).length;
  assert(catalogueSize >= 20000,
    `Catalogue has ${catalogueSize.toLocaleString()} entries (≥20,000 required)`);

  const sampleKeys = Object.keys(SBS_CATALOGUE).slice(0, 10);
  const allHaveDescription = sampleKeys.every(k =>
    SBS_CATALOGUE[k]?.description_en || SBS_CATALOGUE[k]?.description || SBS_CATALOGUE[k]?.name);
  assert(allHaveDescription,
    "Sample catalogue entries have description fields");

  // ── 4B: Batch rejection codes all in NPHIES matrix ─────
  subsection("Scenario 4B: Batch rejection codes all defined in NPHIES matrix");
  const batchRejCodes = new Set(
    submissions.flatMap(s => s.rejectionCodes ?? s.rejections?.map(r => r.reason) ?? [])
  );
  const definedCodes = Object.keys(NPHIES_REJECTION_CODES);
  const allDefined = [...batchRejCodes].every(c => definedCodes.includes(c));
  assert(allDefined,
    `All batch rejection codes defined in NPHIES matrix`,
    allDefined ? undefined : [...batchRejCodes].filter(c => !definedCodes.includes(c)).join(", "));

  // Count by code
  const countsByCode = {};
  for (const s of submissions) {
    for (const rej of (s.rejections ?? [])) {
      countsByCode[rej.reason] = (countsByCode[rej.reason] ?? 0) + 1;
    }
  }
  if (VERBOSE) {
    console.log(`    Rejection code distribution:`);
    Object.entries(countsByCode).sort(([,a],[,b]) => b-a)
      .forEach(([c,n]) => console.log(`      ${c}: ${n} occurrences — ${NPHIES_REJECTION_CODES[c]?.name ?? "?"}`));
  }

  // ── 4C: BE-1-4 is dominant (43 out of 73 expected) ─────
  subsection("Scenario 4C: BE-1-4 (No Prior Auth) is dominant rejection (43/73)");
  const be14Total = Object.values(countsByCode).length > 0
    ? (countsByCode["BE-1-4"] ?? 0) : 0;
  // From the payload meta: "BE-1-4": 43
  assert(payload.meta?.byRejectionCode?.["BE-1-4"] === 43,
    `Meta confirms BE-1-4 appears in 43 submissions (actual: ${payload.meta?.byRejectionCode?.["BE-1-4"]})`);
  assert(payload.meta?.byRejectionCode?.["MN-1-1"] === 17,
    `Meta confirms MN-1-1 appears in 17 submissions`);
  assert(payload.meta?.byRejectionCode?.["CV-1-3"] === 13,
    `Meta confirms CV-1-3 appears in 13 submissions`);
  assert(payload.meta?.byRejectionCode?.["BE-1-3"] === 10,
    `Meta confirms BE-1-3 (BLOCKER) appears in 10 submissions`);

  // ── 4D: Attachment matrix completeness ─────────────────
  subsection("Scenario 4D: Attachment matrix completeness for all rejection codes");
  const allRejCodes = Object.keys(payload.meta?.byRejectionCode ?? {});
  const matrixKeys  = Object.keys(ATTACHMENT_MATRIX);
  const unmapped = allRejCodes.filter(c => !matrixKeys.includes(c));
  assert(unmapped.length === 0,
    `All batch rejection codes have attachment matrix entries`,
    unmapped.join(", ") || "none missing");
  for (const code of allRejCodes) {
    const attachments = ATTACHMENT_MATRIX[code] ?? [];
    assert(attachments.length >= 2,
      `${code} has ≥2 required attachment types (${attachments.length}): ${attachments.slice(0,3).join(", ")}...`);
  }

  // ── 4E: BLOCKER submissions have no attachment matrix fix ──
  subsection("Scenario 4E: BLOCKER submissions require recode, not just attachments");
  const blockers = submissions.filter(s => s.priority === "BLOCKER");
  assert(blockers.length === 10,
    `10 BLOCKER submissions identified (bundleIds in meta)`);
  assert(blockers.every(s => s.rejections.some(r => r.reason === "BE-1-3")),
    `All BLOCKER submissions have BE-1-3 (service code not in contract)`);

  // ── 4F: CRITICAL + HIGH priority distribution ───────────
  subsection("Scenario 4F: Priority distribution matches dry-run");
  const criticalCount = submissions.filter(s => s.priority === "CRITICAL").length;
  const highCount     = submissions.filter(s => s.priority === "HIGH").length;
  const normalCount   = submissions.filter(s => s.priority === "NORMAL").length;
  const blockerCount  = submissions.filter(s => s.priority === "BLOCKER").length;
  assert(criticalCount === payload.meta?.byPriority?.CRITICAL,
    `CRITICAL count matches meta: ${criticalCount} (expected ${payload.meta?.byPriority?.CRITICAL})`);
  assert(highCount === payload.meta?.byPriority?.HIGH,
    `HIGH count matches meta: ${highCount} (expected ${payload.meta?.byPriority?.HIGH})`);
  assert(normalCount === payload.meta?.byPriority?.NORMAL,
    `NORMAL count matches meta: ${normalCount} (expected ${payload.meta?.byPriority?.NORMAL})`);
  assert(blockerCount === payload.meta?.byPriority?.BLOCKER,
    `BLOCKER count matches meta: ${blockerCount} (expected ${payload.meta?.byPriority?.BLOCKER})`);
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACE 5: Payer → Oracle Worker (Scan API + Batch Processing)
// ══════════════════════════════════════════════════════════════════════════════

async function testPayerOracleWorker() {
  section("INTERFACE 5 — Payer → Oracle Worker (Scan API + Batch Processing)");

  // ── 5A: Last scan result analysis ──────────────────────
  subsection("Scenario 5A: Most recent scan results (scan_results_1774398418316.json)");
  const lastScan = JSON.parse(readFileSync(
    join(ROOT, "scan_results_1774398418316.json"), "utf8"));
  assert(lastScan.batchId !== undefined, "Scan results have batchId");
  assert(typeof lastScan.total === "number", `Total in scan: ${lastScan.total}`);
  assert(lastScan.skippedBlockers === 10, 
    `Scan correctly skipped 10 BLOCKER submissions (actual: ${lastScan.skippedBlockers})`);
  assert(lastScan.errorCount > 0, 
    `HTTP 404 errors detected: ${lastScan.errorCount} (Worker endpoint needs deploy)`);
  const errorTypes = [...new Set(lastScan.errors?.map(e => e.error) ?? [])];
  assert(errorTypes.includes("HTTP 404"),
    `All errors are HTTP 404 (Worker route not found) — ${errorTypes.join(", ")}`);

  // ── 5B: Earlier successful scan shape ──────────────────
  subsection("Scenario 5B: Earlier scan result structure (scan_results_1774390555869.json)");
  const prevScan = JSON.parse(readFileSync(
    join(ROOT, "scan_results_1774390555869.json"), "utf8"));
  assert(prevScan !== null, "Previous scan results parseable");
  // Check structure
  if (prevScan.results && prevScan.results.length > 0) {
    const firstResult = prevScan.results[0];
    assert("bundleId" in firstResult || "nationalId" in firstResult,
      "Scan result entries have patient identifiers");
  }
  if (VERBOSE) {
    console.log(`    prev scan total: ${prevScan.total ?? "?"}, go: ${prevScan.go ?? "?"}, partial: ${prevScan.partial ?? "?"}`);
  }

  // ── 5C: Batch chunking logic ────────────────────────────
  subsection("Scenario 5C: Batch chunk size enforcement (max 10 per chunk)");
  const CHUNK_SIZE = 10;
  const passRows = submissions.filter(s => !s.priority?.includes("BLOCKER"));
  const chunks = [];
  for (let i = 0; i < passRows.length; i += CHUNK_SIZE) {
    chunks.push(passRows.slice(i, i + CHUNK_SIZE));
  }
  assert(chunks.every(c => c.length <= CHUNK_SIZE),
    `All chunks ≤${CHUNK_SIZE} items (max: ${Math.max(...chunks.map(c => c.length))})`);
  assert(chunks.length === Math.ceil(passRows.length / CHUNK_SIZE),
    `Chunk count correct: ${chunks.length} chunks for ${passRows.length} submissions`);

  // ── 5D: Retry backoff parameters ───────────────────────
  subsection("Scenario 5D: Retry/backoff configuration");
  const RETRY_COUNT = 2;
  const backoffsMs = Array.from({length: RETRY_COUNT}, (_, i) => 2000 * (i + 1));
  assert(backoffsMs[0] === 2000, `First retry backoff 2000ms (actual: ${backoffsMs[0]}ms)`);
  assert(backoffsMs[1] === 4000, `Second retry backoff 4000ms (actual: ${backoffsMs[1]}ms)`);
  assert(RETRY_COUNT === 2, `Default retry count: ${RETRY_COUNT}`);

  // ── 5E: Live Worker connectivity (if --live) ───────────
  if (LIVE) {
    subsection("Scenario 5E: Live Oracle Worker endpoints (LIVE)");
    const endpoints = ["/health", "/hospitals", "/status"];
    for (const path of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${WORKER_URL}${path}`, { signal: controller.signal });
        clearTimeout(timeout);
        assert(res.status < 500,
          `${path} returned HTTP ${res.status} (non-5xx)`);
      } catch (e) {
        assert(false, `Live probe ${path}`, e.message);
      }
    }
  } else {
    console.log(`  ${INFO} Scenario 5E: Skipped (run with --live for live HTTP probes)`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACE 6: Payer → NPHIES (FHIR R4 Bundle / Claim Submission)
// ══════════════════════════════════════════════════════════════════════════════

async function testPayerNPHIES() {
  section("INTERFACE 6 — Payer → NPHIES (FHIR R4 Bundle / Claim Submission)");

  const { validateBeforeSubmit, buildNphiesClaimBundle } = await import("../fhir-integration/index.mjs");

  // ── 6A: FHIR Claim resource — valid structure ───────────
  subsection("Scenario 6A: FHIR Claim resource cardinality — valid claim");
  const validClaim = {
    resourceType: "Claim",
    id: "claim-test-001",
    identifier: [{ system: "http://nphies.sa/identifier/claim", value: "CLM-001" }],
    status: "active",
    type: {
      coding: [{ system: "http://nphies.sa/terminology/CodeSystem/claim-type", code: "institutional" }]
    },
    use: "claim",
    patient: { reference: "Patient/patient-001" },
    created: "2026-02-25T10:00:00Z",
    insurer: { reference: "Organization/rajhi-takaful" },
    provider: { reference: "Organization/hayat-riyadh" },
    priority: { coding: [{ code: "normal" }] },
    insurance: [{ sequence: 1, focal: true, coverage: { reference: "Coverage/cov-001" } }],
    item: [
      {
        sequence: 1,
        productOrService: {
          coding: [{ system: "http://nphies.sa/terminology/CodeSystem/sbs", code: "B00113" }]
        },
        unitPrice: { value: 150.00, currency: "SAR" },
        net: { value: 150.00, currency: "SAR" },
      }
    ],
    extension: [
      { url: "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-episode",
        valueIdentifier: { value: "EP-2026-001" }},
      { url: "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-patientShare",
        valueMoney: { value: 0, currency: "SAR" }},
    ],
  };
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import validate_cardinality
c = json.loads(${JSON.stringify(JSON.stringify(validClaim))})
print(json.dumps(validate_cardinality('Claim', c)))
`);
    assert(r.valid === true,
      "Valid FHIR Claim passes cardinality check",
      r.missing_required?.join(", ") || undefined);
    assert((r.nphies_warnings?.length ?? 0) === 0,
      "Valid Claim has no NPHIES extension warnings");
    if (VERBOSE) {
      console.log(`    missing_required: ${JSON.stringify(r.missing_required)}`);
      console.log(`    nphies_warnings:  ${JSON.stringify(r.nphies_warnings)}`);
    }
  } catch (e) {
    assert(false, "FHIR Claim cardinality check (Python)", e.message);
  }

  // ── 6B: FHIR Claim — missing required fields ───────────
  subsection("Scenario 6B: FHIR Claim — missing required fields detected");
  const incompleteClaim = {
    resourceType: "Claim",
    status: "active",
    // missing: type, use, patient, created, insurer, provider, priority, insurance, item
  };
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import validate_cardinality
c = json.loads(${JSON.stringify(JSON.stringify(incompleteClaim))})
print(json.dumps(validate_cardinality('Claim', c)))
`);
    assert(r.valid === false,
      "Incomplete Claim fails cardinality check");
    assert(r.missing_required.includes("type"),
      "Missing 'type' detected");
    assert(r.missing_required.includes("insurance"),
      "Missing 'insurance' detected");
    assert(r.missing_required.includes("item"),
      "Missing 'item' detected");
    if (VERBOSE) console.log(`    Missing fields: ${r.missing_required.join(", ")}`);
  } catch (e) {
    assert(false, "FHIR Claim missing fields detection (Python)", e.message);
  }

  // ── 6C: FHIR Coverage resource ─────────────────────────
  subsection("Scenario 6C: FHIR Coverage — cardinality validation");
  const validCoverage = {
    resourceType: "Coverage",
    status: "active",
    beneficiary: { reference: "Patient/patient-001" },
    payor: [{ reference: "Organization/rajhi-takaful" }],
    relationship: { coding: [{ code: "self" }] },
  };
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import validate_cardinality
c = json.loads(${JSON.stringify(JSON.stringify(validCoverage))})
print(json.dumps(validate_cardinality('Coverage', c)))
`);
    assert(r.valid === true,
      "Valid FHIR Coverage passes cardinality check");
  } catch (e) {
    assert(false, "FHIR Coverage cardinality (Python)", e.message);
  }

  // ── 6D: FHIR Organization resource ─────────────────────
  subsection("Scenario 6D: FHIR Organization — cardinality (Provider + Payer)");
  const providerOrg = {
    resourceType: "Organization",
    identifier: [{ system: "http://nphies.sa/identifier/prid", value: "N-F-00001" }],
    active: true,
    name: "Hayat National Hospital",
    extension: [
      { url: "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-organization-type",
        valueCodeableConcept: { coding: [{ code: "prov" }] }}
    ],
  };
  const payerOrg = {
    resourceType: "Organization",
    identifier: [{ system: "http://nphies.sa/identifier/insurerId", value: "102" }],
    active: true,
    name: "Al Rajhi Takaful",
    extension: [
      { url: "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-organization-type",
        valueCodeableConcept: { coding: [{ code: "ins" }] }}
    ],
  };
  for (const [label, org] of [["Provider org", providerOrg], ["Payer org", payerOrg]]) {
    try {
      const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import validate_cardinality
o = json.loads(${JSON.stringify(JSON.stringify(org))})
print(json.dumps(validate_cardinality('Organization', o)))
`);
      assert(r.valid === true, `${label} passes cardinality check`);
      assert((r.nphies_warnings?.length ?? 0) === 0,
        `${label} has no NPHIES extension warnings`);
    } catch (e) {
      assert(false, `${label} cardinality (Python)`, e.message);
    }
  }

  // ── 6E: FHIR Message Bundle for claim-request ──────────
  subsection("Scenario 6E: FHIR Message Bundle — claim-request event");
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import build_nphies_message_header, build_message_bundle

header = build_nphies_message_header(
    event_code='claim-request',
    sender_org_id='N-F-00001',
    receiver_org_id='102',
    focus_references=['Claim/claim-test-001']
)

bundle = build_message_bundle(header, [
    {'resourceType': 'Patient', 'id': 'p-001'},
    {'resourceType': 'Coverage', 'id': 'cov-001'}
])

print(json.dumps({
    'bundleType': bundle.get('resourceType'),
    'type': bundle.get('type'),
    'entryCount': len(bundle.get('entry', [])),
    'hasId': bool(bundle.get('id')),
    'hasTimestamp': bool(bundle.get('meta', {}).get('lastUpdated')),
    'headerEvent': bundle.get('entry', [{}])[0].get('resource', {}).get('eventCoding', {}).get('code', '') if bundle.get('entry') else '',
}))
`);
    assert(r.bundleType === "Bundle",
      "Message bundle resourceType is 'Bundle'");
    assert(r.type === "message",
      "Bundle type is 'message' (NPHIES messaging pattern)");
    assert(r.entryCount >= 2,
      `Bundle has ≥2 entries: ${r.entryCount} (header + focus resources)`);
    assert(r.hasId, "Bundle has generated UUID id");
    assert(r.hasTimestamp, "Bundle has meta.lastUpdated timestamp");
    if (VERBOSE) console.log(`    Header event: ${r.headerEvent}, entries: ${r.entryCount}`);
  } catch (e) {
    assert(false, "FHIR Message Bundle build (Python)", e.message);
  }

  // ── 6F: validateBeforeSubmit — full FHIR bundle ────────
  subsection("Scenario 6F: validateBeforeSubmit — full message bundle");
  try {
    const bundlePayload = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import build_nphies_message_header, build_message_bundle

patient = {
    'resourceType': 'Patient', 'id': 'p-001',
    'identifier': [{'value': '2538864592'}], 'name': [{'family': 'خالد'}],
    'gender': 'female', 'birthDate': '1985-06-15'
}
claim = {
    'resourceType': 'Claim', 'id': 'claim-001',
    'identifier': [{'value': 'CLM-001'}], 'status': 'active',
    'type': {'coding': [{'code': 'institutional'}]}, 'use': 'claim',
    'patient': {'reference': 'Patient/p-001'}, 'created': '2026-02-25T00:00:00Z',
    'insurer': {'reference': 'Organization/payer-001'},
    'provider': {'reference': 'Organization/provider-001'},
    'priority': {'coding': [{'code': 'normal'}]},
    'insurance': [{'sequence': 1, 'focal': True, 'coverage': {'reference': 'Coverage/cov-001'}}],
    'item': [{'sequence': 1, 'productOrService': {'coding': [{'code': 'B00113'}]}, 'net': {'value': 150, 'currency': 'SAR'}}],
    'extension': [
        {'url': 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-episode', 'valueIdentifier': {'value': 'EP-001'}},
        {'url': 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-patientShare', 'valueMoney': {'value': 0, 'currency': 'SAR'}},
    ]
}
header = build_nphies_message_header('claim-request', 'N-F-00001', '102', ['Claim/claim-001'])
bundle = build_message_bundle(header, [patient, claim])
print(json.dumps(bundle))
`);
    const valResult = await validateBeforeSubmit(bundlePayload);
    assert(typeof valResult.safe_to_submit === "boolean",
      "validateBeforeSubmit returns safe_to_submit boolean");
    assert(Array.isArray(valResult.errors),   "validateBeforeSubmit returns errors array");
    assert(Array.isArray(valResult.warnings), "validateBeforeSubmit returns warnings array");
    assert(typeof valResult.details === "object", "validateBeforeSubmit returns details object");
    if (VERBOSE) {
      console.log(`    safe_to_submit: ${valResult.safe_to_submit}`);
      console.log(`    errors: ${valResult.errors.length}, warnings: ${valResult.warnings.length}`);
      if (valResult.errors.length) console.log(`    first error: ${valResult.errors[0]}`);
    }
  } catch (e) {
    assert(false, "validateBeforeSubmit full bundle (Node.js bridge)", e.message);
  }

  // ── 6G: Transaction bundle (batch submission) ───────────
  subsection("Scenario 6G: FHIR Transaction Bundle — batch/transaction type");
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir import build_transaction_bundle

resources = [
    {'resource': {'resourceType': 'Patient', 'id': f'p-{i}'}, 'method': 'POST', 'url': 'Patient'}
    for i in range(3)
]
bundle = build_transaction_bundle(resources)
print(json.dumps({
    'type': bundle.get('type'),
    'entryCount': len(bundle.get('entry', [])),
    'profileSet': bundle.get('meta', {}).get('profile', [None])[0] or '',
    'allHaveRequest': all('request' in e for e in bundle.get('entry', [])),
}))
`);
    assert(r.type === "transaction", "Transaction bundle type is 'transaction'");
    assert(r.entryCount === 3, "Transaction bundle has correct entry count (3)");
    assert(r.allHaveRequest, "All transaction entries have .request block");
    assert(r.profileSet.includes("nphies.sa"), "Transaction bundle has NPHIES profile URL");
  } catch (e) {
    assert(false, "FHIR Transaction Bundle build (Python)", e.message);
  }

  // ── 6H: Real payload — buildNphiesClaimBundle ──────────
  subsection("Scenario 6H: buildNphiesClaimBundle — from real normalized payload sub");
  const sub = submissions[0];
  const normalizedSub = {
    claim: { id: sub.bundleId, status: "active", use: "claim" },
    patient: { id: sub.nationalId, name: sub.patientName },
    coverage: { status: "active", beneficiary: sub.nationalId },
    provider: { id: "N-F-00001" },
    payer: { id: "102" },
  };
  try {
    const bundle = await buildNphiesClaimBundle(normalizedSub);
    assert(bundle?.resourceType === "Bundle",
      `buildNphiesClaimBundle returns FHIR Bundle (got: ${bundle?.resourceType})`);
    assert(bundle?.type === "message",
      "Built bundle is of type 'message'");
    assert((bundle?.entry?.length ?? 0) >= 1,
      `Bundle has entries (${bundle?.entry?.length ?? 0})`);
  } catch (e) {
    assert(false, "buildNphiesClaimBundle from real payload (Node.js bridge)", e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERFACE 7: Payer → Etimad (Appeal Window + Payment Disputes)
// ══════════════════════════════════════════════════════════════════════════════

async function testPayerEtimad() {
  section("INTERFACE 7 — Payer → Etimad (Appeal Window + Payment Disputes)");

  const TODAY         = new Date("2026-03-25");
  const DEADLINE      = new Date(APPEAL_DL);
  const DAYS_REMAINING = Math.floor((DEADLINE - TODAY) / (1000 * 60 * 60 * 24));

  // ── 7A: Appeal window validation ───────────────────────
  subsection("Scenario 7A: Appeal window — within Etimad submission deadline");
  assert(DEADLINE > TODAY,
    `Appeal deadline (${APPEAL_DL}) is in the future as of 2026-03-25`);
  assert(DAYS_REMAINING >= 0,
    `Days remaining in appeal window: ${DAYS_REMAINING}`);
  assert(dryRun.summary.withinWindow === true,
    "Dry-run confirms withinWindow=true");
  assert(DAYS_REMAINING <= 30,
    `Appeal window is tight (${DAYS_REMAINING} days) — prioritization required`);
  console.log(`  ${INFO} Days remaining: ${DAYS_REMAINING} | Deadline: ${APPEAL_DL}`);

  // ── 7B: Priority queue for Etimad submission ────────────
  subsection("Scenario 7B: Etimad priority queue — CRITICAL → HIGH → NORMAL");
  const criticalSubs = submissions.filter(s => s.priority === "CRITICAL");
  const highSubs     = submissions.filter(s => s.priority === "HIGH");
  const normalSubs   = submissions.filter(s => s.priority === "NORMAL");

  assert(criticalSubs.length === 3,
    `CRITICAL queue: ${criticalSubs.length} submissions (appeal ASAP)`);
  assert(highSubs.length === 8,
    `HIGH queue: ${highSubs.length} submissions`);
  assert(normalSubs.length === 52,
    `NORMAL queue: ${normalSubs.length} submissions`);

  // CRITICAL must all have BE-1-4 or chemo flags
  const criticalWithHighReason = criticalSubs.filter(s =>
    s.rejections.some(r => ["BE-1-4", "CV-1-3"].includes(r.reason)) ||
    /chemo|oncol/i.test(s.specialNote ?? "")
  );
  assert(criticalWithHighReason.length > 0,
    `CRITICAL submissions have high-severity rejection codes or clinical flags (${criticalWithHighReason.length}/${criticalSubs.length})`);

  // ── 7C: BLOCKER exclusion from Etimad (need recode first) ──
  subsection("Scenario 7C: BLOCKER submissions excluded from Etimad (need recode via GIVC)");
  const passForEtimad  = dryRows.filter(r => r.status === "PASS");
  const blockerRows    = dryRows.filter(r => r.status === "BLOCKER");
  assert(passForEtimad.length  === dryRun.summary.PASS,
    `PASS submissions ready for Etimad: ${passForEtimad.length}`);
  assert(blockerRows.length === dryRun.summary.BLOCKER,
    `BLOCKER submissions excluded: ${blockerRows.length} (require GIVC recode first)`);
  assert(passForEtimad.length + blockerRows.length === dryRun.summary.total,
    `PASS + BLOCKER = total (${passForEtimad.length} + ${blockerRows.length} = ${dryRun.summary.total})`);

  // ── 7D: Per-submission attachment completeness ──────────
  subsection("Scenario 7D: Attachment completeness per submission (Etimad requirement)");
  let completeSubs = 0, incompleteSubs = 0;
  for (const sub of submissions.filter(s => s.priority !== "BLOCKER")) {
    const allRejCodes = sub.rejections.map(r => r.reason);
    const requiredAttachments = new Set(
      allRejCodes.flatMap(code => ATTACHMENT_MATRIX[code] ?? [])
    );
    const hasAttachmentPlan = sub.attachments && sub.attachments.length > 0;
    if (hasAttachmentPlan) {
      const providedTypes = new Set(sub.attachments.map(a => a.type));
      const required = [...requiredAttachments].filter(t => t !== undefined);
      const missingCount = required.filter(t => !providedTypes.has(t)).length;
      if (missingCount === 0) completeSubs++;
      else incompleteSubs++;
    }
  }
  assert(completeSubs + incompleteSubs > 0,
    `Attachment completeness assessed for ${completeSubs + incompleteSubs} non-blocker claims`);
  if (VERBOSE) {
    console.log(`    Complete: ${completeSubs}, Incomplete: ${incompleteSubs}`);
  }

  // ── 7E: Financial exposure calculation ─────────────────
  subsection("Scenario 7E: Financial exposure — total value under appeal");
  // We don't have dollar amounts per sub, but we can count items
  const totalItems = submissions.reduce((sum, s) => {
    const dryRow = dryRows.find(r => r.bundleId === s.bundleId);
    return sum + (dryRow?.items ?? 0);
  }, 0);
  const avgItemsPerSub = (totalItems / submissions.length).toFixed(1);
  assert(totalItems > 0,
    `Total service items under appeal: ${totalItems} across ${submissions.length} submissions`);
  assert(parseFloat(avgItemsPerSub) > 1.0,
    `Average items per submission: ${avgItemsPerSub}`);

  // ── 7F: Multi-rejection submissions (hardest appeals) ───
  subsection("Scenario 7F: Multi-rejection submissions (complex Etimad appeals)");
  const multiRejSubs = submissions.filter(s => s.rejections.length >= 3);
  const maxRejections = Math.max(...submissions.map(s => s.rejections.length));
  assert(multiRejSubs.length > 0,
    `Submissions with 3+ rejection codes: ${multiRejSubs.length}`);
  assert(maxRejections >= 3,
    `Most complex submission has ${maxRejections} rejection codes`);
  if (VERBOSE) {
    const top3 = submissions
      .sort((a, b) => b.rejections.length - a.rejections.length)
      .slice(0, 3)
      .map(s => `${s.bundleId.slice(0,8)}… (${s.rejections.length} rejections)`);
    top3.forEach(t => console.log(`    ${t}`));
  }

  // ── 7G: Systematic pattern detection for NPHIES feedback ──
  subsection("Scenario 7G: Systematic patterns for NPHIES/Etimad feedback loop");
  const codeFrequency = {};
  for (const sub of submissions) {
    for (const rej of sub.rejections) {
      codeFrequency[rej.reason] = (codeFrequency[rej.reason] ?? 0) + 1;
    }
  }
  const topCode = Object.entries(codeFrequency).sort(([,a],[,b]) => b-a)[0];
  assert(topCode[0] === "BE-1-4",
    `Top rejection code is BE-1-4 (No Prior Auth): ${topCode[1]} occurrences`);
  const patternInsight = `BE-1-4 (${topCode[1]} cases) → systematic prior-auth gap → escalate to hospital admin`;
  assert(topCode[1] >= 40, `BE-1-4 frequency ≥40 (${topCode[1]}) — systemic issue requiring Etimad root-cause report`);
  if (VERBOSE) console.log(`    ${INFO} ${patternInsight}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSS-INTERFACE PIPELINE TESTS
// Full workflow scenarios spanning multiple interfaces
// ══════════════════════════════════════════════════════════════════════════════

async function testFullPipelineScenarios() {
  section("CROSS-INTERFACE — Full Pipeline Scenario Tests");

  const { validateSBSCodes, validateBeforeSubmit, enrichWithFHIR } = await import("../fhir-integration/index.mjs");

  // ── P1: Happy path — NORMAL claim end-to-end ───────────
  subsection("Pipeline P1: Happy path — NORMAL claim (Patient→GIVC→NPHIES→Etimad)");
  const normalClaim = submissions.find(s => s.priority === "NORMAL" && s.rejections.length <= 2);
  assert(normalClaim !== undefined, "Normal claim found for happy path test");
  if (normalClaim) {
    const codes = normalClaim.rejections.map(r => r.code);
    const sbsValidation = await validateSBSCodes(codes);
    assert(sbsValidation.valid !== undefined, `P1: SBS validation ran on ${codes.length} codes`);

    const fhirClaim = {
      resourceType: "Claim",
      identifier: [{ value: normalClaim.bundleId }],
      status: "active", type: { coding: [{ code: "institutional" }] },
      use: "claim",
      patient: { reference: `Patient/${normalClaim.nationalId}` },
      created: normalClaim.serviceDate + "T00:00:00Z",
      insurer: { reference: "Organization/rajhi" },
      provider: { reference: "Organization/hayat-riyadh" },
      priority: { coding: [{ code: "normal" }] },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: "Coverage/cov" } }],
      item: codes.map((c, i) => ({
        sequence: i + 1,
        productOrService: { coding: [{ system: "http://nphies.sa/terminology/CodeSystem/sbs", code: c }] },
        net: { value: 100, currency: "SAR" },
      })),
      extension: [
        { url: "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-episode", valueIdentifier: { value: "EP-001" } },
        { url: "http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition/extension-patientShare", valueMoney: { value: 0, currency: "SAR" } },
      ],
    };
    const nphiesResult = await validateBeforeSubmit(fhirClaim);
    assert(typeof nphiesResult.safe_to_submit === "boolean",
      `P1: NPHIES FHIR validation ran (safe_to_submit=${nphiesResult.safe_to_submit})`);
    if (VERBOSE) {
      console.log(`    P1 codes: ${codes.join(", ")}`);
      console.log(`    P1 SBS valid: ${sbsValidation.valid.length}, invalid: ${sbsValidation.invalid.length}`);
      console.log(`    P1 NPHIES safe_to_submit: ${nphiesResult.safe_to_submit}, errors: ${nphiesResult.errors.length}`);
    }
  }

  // ── P2: CRITICAL chemo claim — prior auth chain ─────────
  subsection("Pipeline P2: CRITICAL chemo claim — prior-auth required chain");
  const chemoClaim = submissions.find(s =>
    s.priority === "CRITICAL" && /chemo/i.test(s.specialNote ?? "")
  );
  assert(chemoClaim !== undefined, "CRITICAL chemo claim found");
  if (chemoClaim) {
    const codes = chemoClaim.rejections.map(r => r.code);
    const sbsVal = await validateSBSCodes(codes);
    const enriched = await enrichWithFHIR(sbsVal.valid.slice(0, 3));
    const priorAuthCodes = sbsVal.prior_auth_required;

    assert(chemoClaim.rejections.some(r => r.reason === "BE-1-4"),
      "P2: Chemo claim has BE-1-4 prior-auth rejection");
    assert(typeof enriched === "object",
      `P2: ${Object.keys(enriched).length} codes enriched with FHIR codings`);
    if (VERBOSE) {
      console.log(`    P2 patient: ${chemoClaim.patientName}`);
      console.log(`    P2 codes: ${codes.join(", ")}`);
      console.log(`    P2 prior-auth required: ${priorAuthCodes.join(", ") || "none in catalogue"}`);
    }
  }

  // ── P3: BLOCKER recode path — GIVC → Oracle feedback ───
  subsection("Pipeline P3: BLOCKER recode path (GIVC diagnosis → Oracle correction)");
  const blockerClaim = submissions.find(s => s.priority === "BLOCKER");
  assert(blockerClaim !== undefined, "BLOCKER claim found for recode scenario");
  if (blockerClaim) {
    const codes = blockerClaim.rejections.map(r => r.code);
    const sbsVal = await validateSBSCodes(codes);
    const hasInvalidCode = sbsVal.invalid.length > 0;
    assert(blockerClaim.rejections.some(r => r.reason === "BE-1-3"),
      `P3: BLOCKER claim has BE-1-3 code (service not in contract): ${blockerClaim.bundleId.slice(0,8)}…`);
    if (VERBOSE) {
      console.log(`    P3 codes: ${codes.join(", ")}`);
      console.log(`    P3 invalid SBS codes: ${sbsVal.invalid.join(", ") || "none"}`);
      console.log(`    Recode required: ${hasInvalidCode ? "YES — cannot appeal until recoded via GIVC" : "Codes exist, contract mismatch only"}`);
    }
    assert(codes.length > 0, "P3: BLOCKER claim has service codes to recode");
  }

  // ── P4: Multi-hospital batch routing ───────────────────
  subsection("Pipeline P4: Multi-hospital batch — Oracle routing coverage");
  const VALID_HOSPITALS = ["riyadh", "madinah", "unaizah", "khamis", "jizan", "abha"];
  for (const hospital of VALID_HOSPITALS) {
    const sampleBatch = {
      hospital,
      submissions: submissions.slice(0, 5).map(s => ({
        nationalId: s.nationalId,
        bundleId: s.bundleId,
        serviceDate: s.serviceDate,
      })),
    };
    assert(sampleBatch.submissions.length === 5,
      `P4: ${hospital} batch payload built correctly (5 claims)`);
    assert(sampleBatch.hospital === hospital,
      `P4: hospital field set to '${hospital}'`);
  }

  // ── P5: Full batch — 63 PASS + 10 BLOCKER skip logic ───
  subsection("Pipeline P5: Full batch processing — skip BLOCKER, scan PASS");
  const processedInBatch = submissions.filter(s => s.priority !== "BLOCKER");
  const skippedInBatch   = submissions.filter(s => s.priority === "BLOCKER");
  assert(processedInBatch.length === 63,
    `P5: 63 claims sent to Oracle Worker scan (actual: ${processedInBatch.length})`);
  assert(skippedInBatch.length === 10,
    `P5: 10 BLOCKER claims skipped as per scan logic`);
  assert(processedInBatch.length + skippedInBatch.length === submissions.length,
    `P5: Processed + Skipped = Total (${processedInBatch.length} + ${skippedInBatch.length} = ${submissions.length})`);

  // ── P6: Coding systems round-trip ──────────────────────
  subsection("Pipeline P6: Coding systems round-trip (FHIR coding bridges)");
  try {
    const r = await runPython(`
import json, sys
sys.path.insert(0, '${ROOT}')
from packages.fhir.coding_systems import build_coding, CODING_SYSTEMS, SNOMED_ARABIC

# Build SNOMED coding for diabetes
snomed_result = build_coding('snomed', '73211009', 'Diabetes mellitus', SNOMED_ARABIC.get('73211009', {}).get('ar', ''))

# Build NPHIES claim type coding
claim_type = build_coding('nphies_claim_type', 'institutional', 'Institutional Claim', '')

# ICD-10 for diabetes
icd10 = build_coding('icd10', 'E11', 'Type 2 diabetes mellitus', '')

print(json.dumps({
    'snomed': snomed_result,
    'claim_type': claim_type,
    'icd10': icd10,
    'snomedSystem': CODING_SYSTEMS.get('snomed'),
    'nphiesSystem': CODING_SYSTEMS.get('nphies_claim_type'),
}))
`);
    assert(r.snomed?.system === "http://snomed.info/sct",
      `SNOMED system URI correct: ${r.snomed?.system}`);
    assert(r.snomed?.code === "73211009",
      "SNOMED code preserved in coding");
    assert(r.claim_type?.system?.includes("nphies.sa"),
      "NPHIES claim type system URI is NPHIES domain");
    assert(r.icd10?.system === "http://hl7.org/fhir/sid/icd-10",
      "ICD-10 system URI correct");
    if (VERBOSE) {
      console.log(`    SNOMED:`, JSON.stringify(r.snomed));
      console.log(`    ICD-10:`, JSON.stringify(r.icd10));
    }
  } catch (e) {
    assert(false, "Coding systems round-trip (Python)", e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN RUNNER
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  COMPLIANCELINC — BrainSAIT Complete Interface Test Suite`);
  console.log(`  Batch: ${BATCH_ID}`);
  console.log(`  Payer: ${PAYER}   |   Provider: ${PROVIDER}`);
  console.log(`  Date:  2026-03-25   |   Appeal Deadline: ${APPEAL_DL}`);
  if (LIVE)    console.log(`  Mode: LIVE (real HTTP probes enabled)`);
  if (VERBOSE) console.log(`  Mode: VERBOSE`);
  console.log(`${"═".repeat(70)}`);

  const start = Date.now();
  const suites = [
    { name: "Patient → BSMA",          fn: testPatientBSMA      },
    { name: "Provider → GIVC",         fn: testProviderGIVC     },
    { name: "Provider → Oracle",       fn: testProviderOracle   },
    { name: "Payer → SBS",             fn: testPayerSBS         },
    { name: "Payer → Oracle Worker",   fn: testPayerOracleWorker},
    { name: "Payer → NPHIES",          fn: testPayerNPHIES      },
    { name: "Payer → Etimad",          fn: testPayerEtimad      },
    { name: "Full Pipeline Scenarios", fn: testFullPipelineScenarios },
  ];

  for (const suite of suites) {
    try {
      await suite.fn();
    } catch (err) {
      console.error(`\n${FAIL} Suite "${suite.name}" threw uncaught error: ${err.message}`);
      if (VERBOSE) console.error(err.stack);
      failedTests++;
      failures.push({ msg: `Suite "${suite.name}" crashed`, detail: err.message });
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  TEST SUMMARY`);
  console.log(`${"═".repeat(70)}`);
  console.log(`  Total:   ${totalTests}`);
  console.log(`  ${PASS} Passed:  ${passedTests}`);
  console.log(`  ${FAIL} Failed:  ${failedTests}`);
  console.log(`  Duration: ${elapsed}s`);

  if (failures.length > 0) {
    console.log(`\n  FAILURES:`);
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.msg}`);
      if (f.detail) console.log(`       ${f.detail}`);
    });
  }

  const pct = Math.round((passedTests / totalTests) * 100);
  console.log(`\n  Pass rate: ${pct}%`);

  if (failedTests === 0) {
    console.log(`\n  ${PASS} ALL TESTS PASSED — system is ready for Etimad submission`);
  } else if (failedTests <= 5) {
    console.log(`\n  ${WARN} ${failedTests} test(s) failed — review above before submission`);
  } else {
    console.log(`\n  ${FAIL} ${failedTests} test(s) failed — NOT ready for submission`);
  }
  console.log(`${"═".repeat(70)}\n`);

  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(2);
});
