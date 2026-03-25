/**
 * nphies-assisted-submit.mjs  v2.0
 * COMPLIANCELINC — BrainSAIT
 *
 * Opens the NPHIES portal communication channel for batch BAT-2026-NB-00004295-OT,
 * presents each GO claim's appeal package, waits for human confirmation + OTP,
 * detects success message, and screenshots every step.
 *
 * Per Al Rajhi notice: MUST use "communication option" not new claim submission.
 *
 * Usage:
 *   node scripts/nphies-assisted-submit.mjs \
 *     --selection artifacts/oracle-portal/run-<ts>/go_for_submission.top5.json \
 *     --submit-url "https://nphies.sa/..." \
 *     --headless false
 */

import { chromium }   from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { validateBeforeSubmit, validateSBSCodes } from "./fhir-integration/index.mjs";

const argv = process.argv.slice(2);
const arg  = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i+1] : d; };

const SELECTION_FILE = arg("--selection", "");
const SUBMIT_URL     = arg("--submit-url", "");
const HEADLESS       = arg("--headless", "false") === "true";
const BATCH_ID       = "BAT-2026-NB-00004295-OT";

if (!SELECTION_FILE) {
  console.error("❌  --selection <path> is required");
  process.exit(1);
}

// ─── Load selection ────────────────────────────────────────────────────────────
let selectionData;
try {
  selectionData = JSON.parse(readFileSync(SELECTION_FILE, "utf8"));
} catch (e) {
  console.error(`❌  Cannot read selection file: ${e.message}`);
  process.exit(1);
}

const claims = selectionData.selection || [];
if (!claims.length) {
  console.error("❌  No claims in selection file.");
  process.exit(1);
}

// ─── Load manifest (for attachment paths) ─────────────────────────────────────
const runDir  = selectionData.runDir;
const manifestPath = join(runDir, "nphies_submission_bundle_manifest.json");
let manifest = { goClaims: [] };
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.warn("⚠  No bundle manifest found — proceeding without attachment upload.");
}

const manifestMap = {};
for (const c of manifest.goClaims) {
  manifestMap[c.bundleId] = c;
}

// ─── Artifacts setup ─────────────────────────────────────────────────────────
const RUN_TS  = new Date().toISOString().replace(/[:.]/g,"-").slice(0,23);
const OUT_DIR = resolve(`artifacts/nphies-submit/run-${RUN_TS}`);
mkdirSync(OUT_DIR, { recursive: true });

const summaryPath = join(OUT_DIR, "summary.json");
const auditResults = [];
const fhirAudit = [];

// ─── Success message patterns (NPHIES portal — English + Arabic) ──────────────
const SUCCESS_PATTERNS = [
  /submitted successfully/i,
  /claim.*accepted/i,
  /communication.*sent/i,
  /تم.*التقديم/,
  /تم.*الإرسال/,
  /تم.*القبول/,
  /نجح/,
];

function isSuccessMessage(text) {
  return SUCCESS_PATTERNS.some(p => p.test(text));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page    = await context.newPage();

  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  // Navigate to NPHIES batch/communication page
  const baseURL = SUBMIT_URL || "https://nphies.sa";
  console.log(`\nOpening NPHIES portal: ${baseURL}`);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });

  // Screenshot initial state
  await page.screenshot({ path: join(OUT_DIR, "00_portal_initial.png") });
  console.log("📸  Portal initial state captured\n");

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    console.log(`\n[${ i + 1}/${claims.length}] Processing: ${claim.patient} | ${claim.bundleId.slice(0,8)}`);

    const claimDir = join(OUT_DIR, `${(i+1).toString().padStart(2,"0")}_${claim.patient.replace(/[^a-zA-Z0-9]/g,"_").slice(0,25)}`);
    mkdirSync(claimDir, { recursive: true });

    const result = {
      seq:        i + 1,
      bundleId:   claim.bundleId,
      patient:    claim.patient,
      nationalId: claim.nationalId,
      priority:   claim.priority,
      submitted:  false,
      success:    false,
      screenshots: [],
      timestamp:  null,
      error:      null,
      fhir:       null,
    };

    try {
      // ── FHIR pre-submit checks (advisory) ─────────────────────────────────
      const mBundle = manifestMap[claim.bundleId];
      const codes = (claim.rejections || [])
        .map((r) => r?.code)
        .filter((c) => typeof c === "string" && c.length > 0);

      const sbsValidation = codes.length
        ? await validateSBSCodes(codes)
        : { valid: [], invalid: [], prior_auth_required: [] };

      const fhirPayload = mBundle?.fhirBundle || {
        resourceType: "Claim",
        id: claim.bundleId,
        status: "active",
        type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "professional" }] },
        use: "claim",
        patient: { reference: `Patient/${claim.nationalId}` },
        created: new Date().toISOString(),
        insurer: { reference: "Organization/PAYER" },
        provider: { reference: "Organization/PROVIDER" },
        priority: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/processpriority", code: "normal" }] },
        insurance: [{ sequence: 1, focal: true, coverage: { reference: "Coverage/1" } }],
        item: [{ sequence: 1, productOrService: { coding: [] } }],
      };

      const fhirCheck = await validateBeforeSubmit(fhirPayload);
      result.fhir = {
        safe_to_submit: fhirCheck.safe_to_submit,
        sbs_invalid_codes: sbsValidation.invalid,
        sbs_prior_auth_required: sbsValidation.prior_auth_required,
        errors: fhirCheck.errors,
        warnings: fhirCheck.warnings,
      };
      fhirAudit.push({ bundleId: claim.bundleId, ...result.fhir });

      // ── Step 1: Prompt human operator ──────────────────────────────────────
      console.log("\n  ⏸  HUMAN ACTION REQUIRED:");
      console.log(`     1. Locate batch ${BATCH_ID} in the NPHIES communication panel`);
      console.log(`     2. Find bundle: ${claim.bundleId}`);
      console.log(`     3. Patient: ${claim.patient} (ID: ${claim.nationalId})`);
      console.log(`     4. Attach the following documents from:`);
      if (mBundle?.attachments?.length) {
        mBundle.attachments.forEach(a =>
          console.log(`        - ${a.type}: ${a.path}`)
        );
      } else {
        console.log(`        (refer to appeal letter: ${i+1}_${claim.patient.slice(0,20)}*.txt)`);
      }
      if (result.fhir?.errors?.length) {
        console.log("     FHIR errors detected (advisory):");
        result.fhir.errors.slice(0, 3).forEach((e) => console.log(`        - ${e}`));
      }
      if (result.fhir?.sbs_invalid_codes?.length) {
        console.log(`     Invalid SBS codes: ${result.fhir.sbs_invalid_codes.join(", ")}`);
      }
      console.log(`     5. Submit the communication / appeal`);
      console.log(`     6. Press ENTER here after submission (or type 'skip' to skip this claim)`);

      // Wait for human
      const response = await waitForKeypress();

      if (response.trim().toLowerCase() === "skip") {
        result.error = "SKIPPED_BY_OPERATOR";
        auditResults.push(result);
        console.log("  ↩  Skipped.");
        continue;
      }

      result.submitted = true;
      result.timestamp = new Date().toISOString();

      // ── Step 2: Screenshot current portal state ─────────────────────────────
      const ss1 = join(claimDir, `step1_submitted.png`);
      await page.screenshot({ path: ss1, fullPage: true });
      result.screenshots.push(ss1);

      // ── Step 3: Detect success message ─────────────────────────────────────
      const pageText = await page.innerText("body").catch(() => "");
      if (isSuccessMessage(pageText)) {
        result.success = true;
        const ss2 = join(claimDir, `step2_success.png`);
        await page.screenshot({ path: ss2, fullPage: true });
        result.screenshots.push(ss2);
        console.log(`  ✅  Success message detected. Screenshot: ${ss2}`);
      } else {
        console.log("  ⚠  Success message NOT detected. Please verify manually.");
        console.log("     Current page excerpt:");
        console.log("     " + pageText.slice(0, 300).replace(/\n/g, "\n     "));
        const ss2 = join(claimDir, `step2_verify_needed.png`);
        await page.screenshot({ path: ss2, fullPage: true });
        result.screenshots.push(ss2);
      }

    } catch (e) {
      result.error = e.message;
      console.error(`  ❌  Error: ${e.message}`);
      await page.screenshot({ path: join(claimDir, "error.png") }).catch(() => {});
    }

    auditResults.push(result);

    // Save running audit after each claim
    writeFileSync(summaryPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      batchId: BATCH_ID,
      runDir:  OUT_DIR,
      fhirAudit,
      results: auditResults,
    }, null, 2));
  }

  await browser.close();

  // ── Final summary ─────────────────────────────────────────────────────────
  const submitted = auditResults.filter(r => r.submitted).length;
  const succeeded = auditResults.filter(r => r.success).length;

  console.log("\n─── Submission Summary ───");
  console.log(`  Claims attempted : ${claims.length}`);
  console.log(`  Submitted        : ${submitted}`);
  console.log(`  Success detected : ${succeeded}`);
  console.log(`  Audit record     : ${summaryPath}`);

  auditResults.forEach(r => {
    const icon = r.success ? "✅" : r.submitted ? "⚠ " : "⏭ ";
    console.log(`  ${icon} [${r.seq}] ${r.patient} | ${r.success ? "SUCCESS" : r.error || "VERIFY"}`);
  });
}

// ── Keypress helper (Node.js readline) ────────────────────────────────────────
function waitForKeypress() {
  const { createInterface } = require("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question("  > ", answer => {
      rl.close();
      resolve(answer);
    });
  });
}

run().catch(e => {
  console.error(`\n💥  Fatal: ${e.message}`);
  process.exit(1);
});
