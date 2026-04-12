/**
 * oracle-scanner.mjs  v2.1.0
 * COMPLIANCELINC — BrainSAIT
 *
 * Fixes from audit 2026-02-11 + scan crash at MRN group 25:
 *   FIX-1: Session recovery creates a fresh browser context instead of
 *           reusing the closed page — eliminates "Target page has been closed" cascade.
 *   FIX-2: Tunnel keepalive probe before every MRN group — fails fast
 *           with a clear error instead of spinning 3×1200 s timeouts.
 *   FIX-3: BAT-2026 payload uses nationalId (not MRN) as the primary key.
 *           Added nationalId→MRN resolution step with Oracle search fallback.
 *   FIX-4: --skip-codes flag skips BE-1-3 (96092-ERR) bundles entirely.
 *   FIX-5: Attachment completeness check properly reads explicit attachment[]
 *           objects (not numeric counts) — audit blocker #2 resolved.
 *   FIX-6: Per-MRN batch save: checkpoint written after every single MRN,
 *           not after every 10.
 *
 * Usage:
 *   node oracle-scanner.mjs \
 *     --payload nphies_normalized_bat4295.json \
 *     --headless true \
 *     --max-docs 2 \
 *     --skip-codes BE-1-3 \
 *     --batch 5 \
 *     --resume true
 */

import { chromium }            from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve }       from "path";
import { createHash }          from "crypto";

// ─── CLI args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg  = (flag, def) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i+1] : def; };
const flag = (f)          => argv.includes(f);

const PAYLOAD_FILE  = arg("--payload",    "nphies_normalized_bat4295.json");
const HEADLESS      = arg("--headless",   "true") === "true";
const MAX_DOCS      = parseInt(arg("--max-docs",  "2"), 10);
const BATCH_SIZE    = parseInt(arg("--batch",     "5"),  10);
const RESUME        = arg("--resume",     "true") === "true";
const SKIP_CODES    = (arg("--skip-codes","") || "").split(",").filter(Boolean);
const ORACLE_URL    = arg("--oracle-url", "https://128.1.1.185/prod/faces/Home");
const ORACLE_USER   = arg("--user",       process.env.ORACLE_USER  || "");
const ORACLE_PASS   = arg("--pass",       process.env.ORACLE_PASS  || "");
const TIMEOUT_NAV   = parseInt(arg("--nav-timeout", "60000"),  10);  // per page.goto
const TIMEOUT_MRN   = parseInt(arg("--mrn-timeout", "120000"), 10);  // per MRN group
const KEEPALIVE_URL = arg("--keepalive",  ORACLE_URL);
const BROWSER_PATH  = arg("--browser-path", process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.BROWSER_PATH || "");

function deriveOracleContext(urlText) {
  const url = new URL(urlText);
  const [firstSegment] = url.pathname.split("/").filter(Boolean);
  const ctx = firstSegment ? `/${firstSegment}` : "";

  return {
    patientSearchUrl: `${url.origin}${ctx}/faces/patient/PatientSearch.jsf`,
    patientDocumentsUrl: `${url.origin}${ctx}/faces/documents/PatientDocuments.jsf`,
  };
}

function parsePatientsFromHTML(html) {
  const patients = [];
  const rowRegex = /<tr[^>]*class="[^"]*patient[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
      cell[1].replace(/<[^>]+>/g, "").trim(),
    );
    if (cells.length >= 2) {
      patients.push({
        mrn: cells[0] || "",
        name: cells[1] || "",
        nationalId: cells[2] || "",
      });
    }
  }
  return patients;
}

const ORACLE_CONTEXT = deriveOracleContext(ORACLE_URL);

// ─── Artifacts setup ──────────────────────────────────────────────────────────
const RUN_TS  = new Date().toISOString().replace(/[:.]/g,"-").slice(0,23);
const RUN_DIR = resolve(`artifacts/oracle-portal/run-${RUN_TS}`);
const DL_DIR  = join(RUN_DIR, "downloads");
mkdirSync(DL_DIR, { recursive: true });

const CHECKPOINT_FILE  = join(RUN_DIR, "checkpoint.json");
const REPORT_FILE      = join(RUN_DIR, "claims_processing_report.json");
const MANIFEST_FILE    = join(RUN_DIR, "nphies_submission_bundle_manifest.json");
const GATE_FILE        = join(RUN_DIR, "submission_gate.json");
const VALIDATION_FILE  = join(RUN_DIR, "validation_queue.json");

function saveJSON(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

// ─── Load + filter payload ────────────────────────────────────────────────────
let rawPayload;
try {
  rawPayload = JSON.parse(readFileSync(PAYLOAD_FILE, "utf8"));
} catch (e) {
  console.error(`❌  Cannot read payload: ${PAYLOAD_FILE}\n    ${e.message}`);
  process.exit(1);
}

// Support both top-level array and { submissions: [] }
const ALL_SUBMISSIONS = Array.isArray(rawPayload)
  ? rawPayload
  : (rawPayload.submissions || []);

if (!ALL_SUBMISSIONS.length) {
  console.error(`❌  Payload has 0 submissions. Check format (must be top-level array or { submissions:[] })`);
  process.exit(1);
}

// Apply --skip-codes filter
const SUBMISSIONS = SKIP_CODES.length
  ? ALL_SUBMISSIONS.filter(s => !s.rejectionCodes?.some(c => SKIP_CODES.includes(c)))
  : ALL_SUBMISSIONS;

const SKIPPED = ALL_SUBMISSIONS.length - SUBMISSIONS.length;

// ─── Resume / checkpoint ───────────────────────────────────────────────────────
// Checkpoint keyed by bundleId (not MRN) for BAT-2026 payload
let checkpoint = { processedBundles: [], results: [] };

if (RESUME) {
  // Find latest run dir with a checkpoint
  const artifactsDir = resolve("artifacts/oracle-portal");
  if (existsSync(artifactsDir)) {
    const runs = require("fs").readdirSync(artifactsDir)
      .filter(d => d.startsWith("run-"))
      .sort()
      .reverse();
    for (const run of runs) {
      const cpFile = join(artifactsDir, run, "checkpoint.json");
      if (existsSync(cpFile)) {
        try {
          checkpoint = JSON.parse(readFileSync(cpFile, "utf8"));
          console.log(`Resuming from: ${join(artifactsDir, run)}`);
          console.log(`Checkpoint loaded: ${checkpoint.processedBundles.length} bundles, ${checkpoint.results.length} results`);
          break;
        } catch { /* corrupt checkpoint — start fresh */ }
      }
    }
  }
}

// Filter to unprocessed
const PENDING = SUBMISSIONS.filter(
  s => !checkpoint.processedBundles.includes(s.bundleId)
);

console.log(`\nPayload : ${ALL_SUBMISSIONS.length} total  |  ${SKIPPED} skipped (${SKIP_CODES.join(",") || "none"})  |  ${SUBMISSIONS.length} in scope`);
console.log(`Pending : ${PENDING.length} unprocessed bundles`);
console.log(`Config  : headless=${HEADLESS} maxDocs=${MAX_DOCS} batch=${BATCH_SIZE} resume=${RESUME}`);
console.log(`Oracle  : ${ORACLE_URL}\n`);

if (!PENDING.length) {
  console.log("✅  All bundles already processed. Nothing to do.");
  process.exit(0);
}

// ─── Browser management ───────────────────────────────────────────────────────
let browser, context, page;

function resolveBrowserLaunchOptions() {
  const candidates = [
    BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev",
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => existsSync(candidate));

  return {
    headless: HEADLESS,
    ...(executablePath ? { executablePath } : {}),
    args: ["--ignore-certificate-errors", "--disable-web-security"],
  };
}

async function launchBrowser() {
  browser = await chromium.launch(resolveBrowserLaunchOptions());
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.setDefaultNavigationTimeout(TIMEOUT_NAV);
  page.setDefaultTimeout(TIMEOUT_NAV);
}

async function closeBrowser() {
  try { await browser?.close(); } catch { /* ignore */ }
  browser = null; context = null; page = null;
}

// ─── FIX-1: Full browser restart on session failure ───────────────────────────
// Old code tried to reuse the closed page → cascade of "Target page has been closed".
// New code: close everything, launch fresh, re-authenticate.
async function recoverSession(reason) {
  console.warn(`  ⚠  Session recovery triggered: ${reason}`);
  await closeBrowser();
  await launchBrowser();
  await oracleLogin();
}

async function oracleLogin() {
  if (!ORACLE_USER || !ORACLE_PASS) {
    console.log("  Skipping Oracle login (no credentials). Running in pre-authenticated mode.");
    return;
  }
  try {
    await page.goto(ORACLE_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_NAV });
    // Standard Oracle Forms / JSF login
    const userField = page.locator("input[type='text'], input[id*='user'], input[name*='user']").first();
    if (await userField.isVisible({ timeout: 5000 })) {
      await userField.fill(ORACLE_USER);
      const passField = page.locator("input[type='password']").first();
      await passField.fill(ORACLE_PASS);
      await page.keyboard.press("Enter");
      await page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_NAV });
    }
  } catch (e) {
    console.warn(`  Login attempt failed: ${e.message}`);
  }
}

// ─── FIX-2: Keepalive probe ────────────────────────────────────────────────────
// Probes the tunnel with a 10 s HEAD request before starting each MRN group.
// If tunnel is down, throws immediately with a clear error.
async function probeKeepalive() {
  try {
    const res = await page.request.head(KEEPALIVE_URL, { timeout: 10000 });
    return res.status() < 500;
  } catch (e) {
    throw new Error(`Tunnel keepalive probe failed: ${e.message}. Check cloudflared tunnel status.`);
  }
}

// ─── FIX-3: nationalId → MRN lookup ───────────────────────────────────────────
// BAT-2026 payload uses nationalId. Oracle requires MRN.
// Strategy: (a) try the oracleSearchHint.nationalId in Oracle patient search,
//           (b) extract MRN from the result, (c) cache for the run.
const mrnCache = {};  // nationalId → mrn

async function resolveMRN(submission) {
  const { nationalId, patientName, serviceDate } = submission;

  // Use cached value if available
  if (mrnCache[nationalId]) return mrnCache[nationalId];

  try {
    await page.goto(`${ORACLE_CONTEXT.patientSearchUrl}?national_id=${encodeURIComponent(nationalId)}`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_NAV,
    });

    const pagePatients = parsePatientsFromHTML(await page.content());
    if (pagePatients.length > 0 && pagePatients[0].mrn) {
      const mrn = pagePatients[0].mrn;
      mrnCache[nationalId] = mrn;
      console.log(`    MRN resolved: ${nationalId} → ${mrn}`);
      return mrn;
    }

    // Try national ID field (varies by Oracle version — try common selectors)
    const searchSelectors = [
      "input[id*='national'], input[name*='national']",
      "input[placeholder*='National'], input[placeholder*='national']",
      "input[id*='nid'], input[id*='NID']",
    ];

    let typed = false;
    for (const sel of searchSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.fill(nationalId);
          await page.keyboard.press("Enter");
          await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
          typed = true;
          break;
        }
      } catch { /* try next */ }
    }

    if (!typed) {
      // Fallback: try patient name search
      const nameField = page.locator("input[id*='name'], input[placeholder*='Name']").first();
      if (await nameField.isVisible({ timeout: 2000 })) {
        await nameField.fill(patientName.split(" ")[0]);
        await page.keyboard.press("Enter");
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      }
    }

    const fallbackPatients = parsePatientsFromHTML(await page.content());
    if (fallbackPatients.length > 0 && fallbackPatients[0].mrn) {
      const mrn = fallbackPatients[0].mrn;
      mrnCache[nationalId] = mrn;
      console.log(`    MRN resolved: ${nationalId} → ${mrn}`);
      return mrn;
    }

    // Extract MRN from result table
    const mrnCandidates = await page.locator(
      "td:has-text('MRN'), td[id*='mrn'], td[class*='mrn'], " +
      "span[id*='mrn'], td:nth-child(1)"
    ).allInnerTexts();

    const mrnMatch = mrnCandidates
      .join(" ")
      .match(/\b([0-9]{5,8})\b/);

    if (mrnMatch) {
      const mrn = mrnMatch[1];
      mrnCache[nationalId] = mrn;
      console.log(`    MRN resolved: ${nationalId} → ${mrn}`);
      return mrn;
    }
  } catch (e) {
    console.warn(`    MRN resolution failed for ${nationalId}: ${e.message}`);
  }

  // Could not resolve — return nationalId as fallback (scanner will log NO_MATCH)
  mrnCache[nationalId] = nationalId;
  return nationalId;
}

// ─── Oracle document retrieval ────────────────────────────────────────────────
async function fetchDocumentsForMRN(mrn, invoiceHint, maxDocs) {
  const docs = [];
  try {
    await page.goto(`${ORACLE_CONTEXT.patientDocumentsUrl}?mrn=${encodeURIComponent(mrn)}`, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_NAV,
    });

    // Wait for patient record
    await page.waitForSelector(
      "[id*='patient'], [class*='patient'], table.patientInfo, #patientDetails",
      { timeout: 10000 }
    ).catch(() => { /* not always present */ });

    // Find document links
    const docLinks = await page.locator(
      "a[href*='document'], a[href*='invoice'], a[href*='claim'], " +
      "a[href*='pdf'], a[href*='report'], button[id*='print'], button[id*='view']"
    ).all();

    let fetched = 0;
    for (const link of docLinks) {
      if (fetched >= maxDocs) break;
      try {
        const text = (await link.innerText()).trim();
        const href  = await link.getAttribute("href") || "";

        // Skip navigation/UI links
        if (!text && !href.match(/document|invoice|claim|pdf|report/i)) continue;

        let filePath = null;
        let sha256   = null;
        let docType  = "UNKNOWN";

        // Classify document type
        if (text.match(/invoice|فاتورة/i))  docType = "INVOICE";
        else if (text.match(/prescription|وصفة/i)) docType = "PRESCRIPTION";
        else if (text.match(/lab|مختبر|تحليل/i))   docType = "LAB_RESULT";
        else if (text.match(/xray|radiol|أشعة/i))   docType = "XRAY";
        else if (text.match(/note|ملاحظ|تقرير/i))   docType = "CLINICAL_NOTES";
        else if (text.match(/report|تقرير/i))        docType = "MEDICAL_REPORT";

        // Try download
        try {
          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 15000 }),
            link.click(),
          ]);
          const suggestedName = download.suggestedFilename() ||
            `${mrn}_${docType}_${fetched}.pdf`;
          filePath = join(DL_DIR, `${mrn}_${suggestedName}`);
          await download.saveAs(filePath);
          const buf = readFileSync(filePath);
          sha256 = createHash("sha256").update(buf).digest("hex");
        } catch {
          // Fallback: save rendered page as PDF
          filePath = join(DL_DIR, `${mrn}_rendered_${fetched}.pdf`);
          await page.pdf({ path: filePath, format: "A4" }).catch(() => {});
          if (existsSync(filePath)) {
            const buf = readFileSync(filePath);
            sha256 = createHash("sha256").update(buf).digest("hex");
          }
        }

        if (filePath && existsSync(filePath)) {
          docs.push({ type: docType, path: filePath, sha256, label: text, href });
          fetched++;
        }
      } catch { /* skip this link */ }
    }
  } catch (e) {
    console.warn(`    Document fetch error for MRN ${mrn}: ${e.message}`);
  }
  return docs;
}

// ─── FIX-5: Attachment completeness check ─────────────────────────────────────
// Reads explicit attachment[] objects (required: true/false) not numeric counts.
function checkAttachmentCompleteness(submission, retrievedDocs) {
  const required = (submission.attachments || []).filter(a => a.required);
  const retrieved = retrievedDocs.map(d => d.type);

  const missing = [];
  const fulfilled = [];

  for (const att of required) {
    // Fuzzy match: INVOICE matches INVOICE, LAB_RESULT matches LAB_RESULTS, etc.
    const match = retrieved.find(r =>
      r === att.type ||
      r.startsWith(att.type.split("_")[0])
    );
    if (match) {
      fulfilled.push({ ...att, retrievedAs: match });
    } else {
      missing.push(att);
    }
  }

  return {
    totalRequired: required.length,
    fulfilled: fulfilled.length,
    missing,
    complete: missing.length === 0,
  };
}

// ─── Main processing loop ─────────────────────────────────────────────────────
async function run() {
  await launchBrowser();
  await oracleLogin();

  const results     = [...checkpoint.results];
  const processed   = new Set(checkpoint.processedBundles);
  const goClaims    = [];
  const noGoClaims  = [];
  const validationQ = [];

  let batchCount = 0;

  for (let i = 0; i < PENDING.length; i++) {
    const sub = PENDING[i];
    console.log(`\n[${i+1}/${PENDING.length}] ${sub.patientName} | ${sub.bundleId.slice(0,8)} | ${sub.serviceDate} | ${sub.rejectionCodes?.join("+")}`);

    // ── FIX-2: Probe tunnel before each item ──────────────────────────────────
    try {
      await probeKeepalive();
    } catch (e) {
      console.error(`\n❌  ${e.message}`);
      console.error("    Halting scan. Restart cloudflared tunnel then resume with --resume true.");
      break;
    }

    const result = {
      seq:          sub.seq,
      bundleId:     sub.bundleId,
      patientName:  sub.patientName,
      nationalId:   sub.nationalId,
      serviceDate:  sub.serviceDate,
      rejectionCodes: sub.rejectionCodes,
      priority:     sub.priority,
      oracleFound:  false,
      mrn:          null,
      retrievedDocs: [],
      attachmentCheck: null,
      nphiesReady:  false,
      gateStatus:   "NO_GO",
      gateReason:   [],
      specialNote:  sub.specialNote,
    };

    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        // ── FIX-3: Resolve MRN from nationalId ───────────────────────────────
        const mrn = await resolveMRN(sub);
        result.mrn = mrn;

        if (mrn === sub.nationalId) {
          // Fallback — Oracle search didn't find an MRN
          result.gateReason.push("MRN_NOT_RESOLVED");
        } else {
          result.oracleFound = true;
        }

        // Fetch documents
        const docs = await fetchDocumentsForMRN(mrn, sub.bundleId, MAX_DOCS);
        result.retrievedDocs = docs;

        // ── FIX-5: Check attachment completeness ─────────────────────────────
        const attCheck = checkAttachmentCompleteness(sub, docs);
        result.attachmentCheck = attCheck;

        if (!result.oracleFound)  result.gateReason.push("ORACLE_NOT_FOUND");
        if (!attCheck.complete)   result.gateReason.push(`MISSING_ATTACHMENTS:${attCheck.missing.map(m=>m.type).join(",")}`);
        if (sub.requiresRecode)   result.gateReason.push("RECODE_REQUIRED");

        result.nphiesReady = result.oracleFound && attCheck.complete && !sub.requiresRecode;
        result.gateStatus  = result.nphiesReady ? "GO" : "NO_GO";

        console.log(`  Oracle: ${result.oracleFound ? "✓ found" : "✗ not found"} | MRN: ${mrn} | Docs: ${docs.length} | Attachments: ${attCheck.fulfilled}/${attCheck.totalRequired} | Gate: ${result.gateStatus}`);

        break; // success — exit retry loop

      } catch (e) {
        console.warn(`  Attempt ${attempts}/${MAX_ATTEMPTS} failed: ${e.message}`);

        if (attempts < MAX_ATTEMPTS) {
          // ── FIX-1: Full browser restart ───────────────────────────────────
          await recoverSession(e.message);
        } else {
          result.gateReason.push(`SCAN_ERROR:${e.message.slice(0,80)}`);
        }
      }
    }

    results.push(result);
    processed.add(sub.bundleId);

    if (result.gateStatus === "GO")    goClaims.push(result);
    else                               noGoClaims.push(result);

    if (result.attachmentCheck && !result.attachmentCheck.complete) {
      validationQ.push({
        bundleId:    sub.bundleId,
        patient:     sub.patientName,
        nationalId:  sub.nationalId,
        date:        sub.serviceDate,
        missing:     result.attachmentCheck.missing,
        specialNote: sub.specialNote,
      });
    }

    // ── FIX-6: Save checkpoint after every bundle (not every 10) ─────────────
    checkpoint = { processedBundles: [...processed], results };
    saveJSON(CHECKPOINT_FILE, checkpoint);

    batchCount++;
    if (batchCount % BATCH_SIZE === 0) {
      console.log(`\n  --- Batch of ${BATCH_SIZE} complete. Intermediate reports saved. ---`);
      writeIntermediateReports(results, goClaims, noGoClaims, validationQ);
    }
  }

  await closeBrowser();

  // ── Final reports ─────────────────────────────────────────────────────────
  writeIntermediateReports(results, goClaims, noGoClaims, validationQ);
  writeFinalSummary(results, goClaims, noGoClaims);
}

function writeIntermediateReports(results, go, nogo, vq) {
  // Processing report
  saveJSON(REPORT_FILE, {
    runDir:        RUN_DIR,
    generatedAt:   new Date().toISOString(),
    payloadTotal:  ALL_SUBMISSIONS.length,
    skipped:       SKIPPED,
    inScope:       SUBMISSIONS.length,
    processedCount: results.length,
    oracleMatches: results.filter(r => r.oracleFound).length,
    nphiesReady:   results.filter(r => r.nphiesReady).length,
    gateGO:        go.length,
    gateNO_GO:     nogo.length,
    results,
  });

  // Bundle manifest (GO claims only — with sha256 per doc)
  saveJSON(MANIFEST_FILE, {
    generatedAt: new Date().toISOString(),
    goClaims: go.map(r => ({
      bundleId:   r.bundleId,
      patient:    r.patientName,
      nationalId: r.nationalId,
      mrn:        r.mrn,
      date:       r.serviceDate,
      attachments: r.retrievedDocs.map(d => ({
        type:   d.type,
        path:   d.path,
        sha256: d.sha256,
        status: "ready",
      })),
    })),
  });

  // Gate file
  saveJSON(GATE_FILE, {
    generatedAt: new Date().toISOString(),
    go:    go.map(r => ({ bundleId: r.bundleId, mrn: r.mrn, patient: r.patientName })),
    no_go: nogo.map(r => ({ bundleId: r.bundleId, reason: r.gateReason })),
  });

  // Validation queue
  saveJSON(VALIDATION_FILE, { missing: vq });
}

function writeFinalSummary(results, go, nogo) {
  const summary = {
    "Run dir":        RUN_DIR,
    "Payload total":  ALL_SUBMISSIONS.length,
    "Skipped codes":  SKIP_CODES.join(",") || "none",
    "In scope":       SUBMISSIONS.length,
    "Processed":      results.length,
    "Oracle matches": results.filter(r => r.oracleFound).length,
    "NPHIES ready":   results.filter(r => r.nphiesReady).length,
    "Gate GO":        go.length,
    "Gate NO_GO":     nogo.length,
    "Appeal deadline": rawPayload.meta?.appealDeadline || "—",
  };

  console.log("\n─── Run Summary ───");
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k.padEnd(20)}: ${v}`);
  }

  if (go.length) {
    console.log("\n✅  GO claims ready for NPHIES submission:");
    go.forEach(r => console.log(`  [${r.seq}] ${r.patientName} | ${r.bundleId.slice(0,8)} | ${r.serviceDate}`));
  }

  if (vq_count_from_file() > 0) {
    console.log(`\n⚠️   Validation queue (missing attachments): ${vq_count_from_file()} bundles`);
    console.log(`    Review: ${VALIDATION_FILE}`);
  }

  console.log(`\nMain report   : ${REPORT_FILE}`);
  console.log(`Bundle manifest: ${MANIFEST_FILE}`);
  console.log(`Next step      : run select-go-for-submission.ps1 -Count 5 -RunDir "${RUN_DIR}"\n`);
}

function vq_count_from_file() {
  try {
    return JSON.parse(readFileSync(VALIDATION_FILE,"utf8")).missing?.length || 0;
  } catch { return 0; }
}

// ── Entrypoint ────────────────────────────────────────────────────────────────
run().catch(e => {
  console.error(`\n💥  Unhandled error: ${e.message}`);
  process.exit(1);
});
