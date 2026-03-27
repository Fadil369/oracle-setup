/**
 * COMPLIANCELINC — oracle-claim-scanner
 * Cloudflare Worker with Browser Rendering binding
 *
 * Multi-Hospital Oracle Oasis+ Scanner
 * Supports: Riyadh, Madinah, Unaizah, Khamis, Jizan, Abha
 *
 * Deploy: wrangler deploy
 * Trigger: POST https://oracle-scanner.elfadil.com/scan
 */

import puppeteer from "@cloudflare/puppeteer";

// Sleep helper since @cloudflare/puppeteer doesn't have waitForTimeout
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Hospital Configurations ────────────────────────────────────────────────
const HOSPITALS = {
  riyadh: {
    name: "Riyadh",
    baseUrl: "https://oracle-riyadh.elfadil.com",
    loginPath: "/prod/faces/Home",
    searchPath: "/prod/faces/PatientSearch",
    internalIp: "128.1.1.185",
    protocol: "https"
  },
  madinah: {
    name: "Madinah", 
    baseUrl: "https://oracle-madinah.elfadil.com",
    loginPath: "/Oasis/faces/Login.jsf",
    searchPath: "/Oasis/faces/PatientSearch",
    internalIp: "172.25.11.26",
    protocol: "http"
  },
  unaizah: {
    name: "Unaizah",
    baseUrl: "https://oracle-unaizah.elfadil.com",
    loginPath: "/prod/faces/Login.jsf",
    searchPath: "/prod/faces/PatientSearch",
    internalIp: "10.0.100.105",
    protocol: "http"
  },
  khamis: {
    name: "Khamis Mushait",
    baseUrl: "https://oracle-khamis.elfadil.com",
    loginPath: "/prod/faces/Login.jsf",
    searchPath: "/prod/faces/PatientSearch",
    internalIp: "172.30.0.77",
    protocol: "http"
  },
  jizan: {
    name: "Jizan",
    baseUrl: "https://oracle-jizan.elfadil.com",
    loginPath: "/prod/faces/Login.jsf",
    searchPath: "/prod/faces/PatientSearch",
    internalIp: "172.17.4.84",
    protocol: "http"
  },
  abha: {
    name: "Abha",
    baseUrl: "https://oracle-abha.elfadil.com",
    loginPath: "/Oasis/faces/Home",
    searchPath: "/Oasis/faces/PatientSearch",
    internalIp: "172.19.1.1",
    protocol: "http"
  }
};

// Default hospital (can be overridden per request)
const DEFAULT_HOSPITAL = "riyadh";

// ── Oracle Oasis+ selectors ────────────────────────────────────────────────
const SEL = {
  // Multiple selector options to handle different Oracle versions
  username:    'input[id*="username" i], input[id*="user" i], input[name*="username" i], input[placeholder*="user" i], #j_username, #username, input[type="text"]:first-of-type',
  password:    'input[type="password"], #j_password, #password, input[name*="password" i]',
  loginBtn:    'a#login, a.btn-submit, input[type="submit"], button[type="submit"], #loginButton, a[id*="login" i], input[value*="Login" i]',
  searchInput: 'input[id*="search" i], input[id*="national" i], input[placeholder*="national" i], input[name*="search" i]',
  patientRow:  'tr[id*="patient"], tr.patientRow, tbody tr',
  docLinks:    'a[href*="document"], a[href*="invoice"], a[href*="report"], a[href*="pdf"], a[href*="attach"]',
};

const LOGIN_PATH = "/prod/faces/Home";
const SEARCH_PATH = "/prod/faces/PatientSearch";
const WATCHLIST_LIMIT = 24;

// ── API key guard ───────────────────────────────────────────────────────────
function requireApiKey(request, env) {
  const allowUnauthenticated = env.ALLOW_UNAUTHENTICATED === "1" || env.ALLOW_UNAUTHENTICATED === "true";
  if (!env.API_KEY && !allowUnauthenticated) {
    return new Response(JSON.stringify({ error: "Server misconfigured: API_KEY is required" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!env.API_KEY) return null;

  const url = new URL(request.url);
  const auth = request.headers.get("Authorization") ?? "";
  const bearerKey = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerKey = request.headers.get("X-API-Key") ?? "";
  const queryKey = url.searchParams.get("key") ?? "";
  const key = bearerKey || headerKey || queryKey;

  if (key !== env.API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": "Bearer",
      },
    });
  }
  return null;
}

// ── Per-hospital credential resolver ────────────────────────────────────────
function getHospitalCreds(env, hospitalId) {
  const id = hospitalId.toUpperCase();
  const user = env[`ORACLE_USER_${id}`] || env.ORACLE_USER;
  const pass = env[`ORACLE_PASS_${id}`] || env.ORACLE_PASS;
  return { user, pass };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS preflight ─────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age":       "86400",
        },
      });
    }

    // ── Public routes (no auth) ────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/health") {
      return handleHealth(env);
    }

    if (request.method === "GET" && url.pathname === "/control-tower/claims") {
      return handleControlTowerClaims(request, env);
    }

    // ── Auth guard — all non-health routes require API key ─────────────
    const authErr = requireApiKey(request, env);
    if (authErr) return authErr;

    // ── Route: GET /hospitals ─────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/hospitals") {
      return json({
        hospitals: Object.entries(HOSPITALS).map(([key, h]) => ({
          id: key,
          name: h.name,
          baseUrl: h.baseUrl,
          loginPath: h.loginPath,
          status: "configured"
        })),
        default: DEFAULT_HOSPITAL
      });
    }

    // ── Route: POST /scan ─────────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/scan") {
      return handleScan(request, env);
    }

    // ── Route: POST /scan-batch ───────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/scan-batch") {
      return handleBatch(request, env);
    }

    // ── Route: GET /result/:bundleId ──────────────────────────────────────
    if (request.method === "GET" && url.pathname.startsWith("/result/")) {
      const bundleId = url.pathname.split("/result/")[1];
      return handleGetResult(bundleId, env);
    }

    // ── Route: GET /status ────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/status") {
      return handleStatus(env);
    }

    // ── Route: GET /metrics ───────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/metrics") {
      return handleMetrics(env);
    }

    // ── Route: GET /batch/latest ──────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/batch/latest") {
      return handleLatestBatch(env);
    }

    // ── Route: GET /batch/:batchId ────────────────────────────────────────
    if (request.method === "GET" && url.pathname.startsWith("/batch/")) {
      const batchId = url.pathname.split("/batch/")[1];
      return handleGetBatch(batchId, env);
    }

    // ── Route: DELETE /session ────────────────────────────────────────────
    if (request.method === "DELETE" && url.pathname === "/session") {
      // Clear session for specific hospital or all
      const hospitalId = url.searchParams.get("hospital");
      if (hospitalId) {
        await env.SESSIONS.delete(`oracle_session_${hospitalId}`);
        return json({ cleared: true, hospital: hospitalId });
      } else {
        // Clear all hospital sessions
        for (const hId of Object.keys(HOSPITALS)) {
          await env.SESSIONS.delete(`oracle_session_${hId}`);
        }
        await env.SESSIONS.delete("oracle_session"); // legacy key
        return json({ cleared: true, hospitals: Object.keys(HOSPITALS) });
      }
    }

    // ── Route: GET /debug/portal — screenshot Oracle home page post-login ─
    if (request.method === "GET" && url.pathname === "/debug/portal") {
      return handleDebugPortal(request, env);
    }

    // ── Route: GET /debug/login — screenshot login page + attempt ─────────
    if (request.method === "GET" && url.pathname === "/debug/login") {
      return handleDebugLogin(request, env);
    }

    // ── Route: GET /debug/menu — dump full sidebar nav tree (with hrefs) ──
    if (request.method === "GET" && url.pathname === "/debug/menu") {
      return handleDebugMenu(request, env);
    }

    // ── Route: GET /debug/click — click a menu item by text, capture URL ──
    if (request.method === "GET" && url.pathname === "/debug/click") {
      return handleDebugClick(request, env);
    }

    // ── Route: GET /debug/navigate — navigate to a specific Oracle path ───
    if (request.method === "GET" && url.pathname === "/debug/navigate") {
      return handleDebugNavigate(request, env);
    }

    // ── Route: GET /debug/api-scan — Api Transactions date/bundle search ──
    if (request.method === "GET" && url.pathname === "/debug/api-scan") {
      return handleDebugApiScan(request, env);
    }

    // ── Route: GET /debug/manage-claims — Manage Claims page search ─────
    if (request.method === "GET" && url.pathname === "/debug/manage-claims") {
      return handleDebugManageClaims(request, env);
    }

    return json({ 
      error: "Not found", 
      routes: [
        "GET  /hospitals        — list all configured hospitals",
        "POST /scan             — scan single claim {nationalId, bundleId, serviceDate, hospital?}",
        "POST /scan-batch       — scan multiple claims {submissions:[...], hospital?}",
        "GET  /result/:id       — get stored result for bundleId",
        "GET  /status           — check session + KV health",
        "GET  /health           — full health check",
        "GET  /metrics          — view performance metrics",
        "GET  /batch/latest     — latest stored batch summary",
        "GET  /batch/:id        — stored batch summary by id",
        "GET  /control-tower/claims — live claims feed for the portals control tower",
        "DELETE /session        — clear stored session (force re-login)",
        "GET  /debug/login      — screenshot login flow + diagnostics",
        "GET  /debug/portal     — home page + hamburger + menu search (?search=billing)",
        "GET  /debug/menu       — full sidebar nav tree: clickables, allVisible with parentIds",
        "GET  /debug/click      — click menu item by text, capture resulting URL (?item=Billing+Transactions)",
        "GET  /debug/navigate   — navigate to any Oracle path (?path=/prod/faces/Xyz)",
      ],
      hospitals: Object.keys(HOSPITALS)
    }, 404);
  },
};

// ─── Core Scanner Logic ────────────────────────────────────────────────────────
async function performOracleScan(page, env, req, hospitalConfig) {
  const t0 = Date.now();
  const { bundleId, nationalId, serviceDate } = req;

  // ── Step 1: Open hamburger sidebar ──────────────────────────────────────
  const menuOpened = await page.evaluate(() => {
    const el = document.getElementById('pt1:OasisHedarToolBar:hamburgerBtn')
      || document.querySelector('[id$=":hamburgerBtn"]');
    if (el) { el.click(); return true; }
    return false;
  });
  if (!menuOpened) throw new Error("Could not open Oracle sidebar (hamburger btn not found)");
  await sleep(3000);

  // ── Step 2: Navigate to Api Transactions via ADF sidebar ────────────────
  const clickInfo = await page.evaluate(() => {
    const sidebar = document.getElementById('pt1:r1') || document.body;
    const allTextSpans = Array.from(sidebar.querySelectorAll('.os-treeview-item-text'));
    for (const span of allTextSpans) {
      const txt = (span.innerText || span.textContent || '').trim();
      if (txt === 'Api Transactions') {
        const row = span.closest('.os-treeview-item-content') || span.parentElement;
        row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        const r = row.getBoundingClientRect();
        return { found: true, x: r.left + r.width / 2, y: r.top + r.height / 2, hasRect: r.width > 0 && r.height > 0 };
      }
    }
    return { found: false };
  });

  if (!clickInfo.found) throw new Error("Api Transactions menu item not found in sidebar");

  if (clickInfo.hasRect && clickInfo.x > 0 && clickInfo.y > 0) {
    await page.mouse.move(clickInfo.x, clickInfo.y);
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
  }

  try {
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 });
  } catch { await sleep(4000); }

  // ── Step 3: Fill Bundle ID filter ────────────────────────────────────────
  // The BUNDELID textarea is the primary filter for claim lookup
  const bundleIdFilled = await page.evaluate((bId) => {
    const ta = document.querySelector('textarea[id*="BUNDELID"]')
      || document.querySelector('[id*="BUNDELID::content"]');
    if (ta) {
      ta.focus();
      ta.value = bId;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }, bundleId);

  // ── Step 4: Also fill From Date / To Date if serviceDate is provided ─────
  // Oracle expects datetime format: YYYY-MM-DD HH:MM:SS (e.g. 2026-02-25 00:00:00)
  if (serviceDate) {
    let fromStr = serviceDate;
    let toStr   = serviceDate;
    // Normalize from YYYY-MM-DD to Oracle's expected datetime format
    const m = serviceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      fromStr = `${m[1]}-${m[2]}-${m[3]} 00:00:00`;
      toStr   = `${m[1]}-${m[2]}-${m[3]} 23:59:59`;
    }

    await page.evaluate((from, to) => {
      const contentArea = document.getElementById('pt1:contrRg') || document.body;
      const fromEl = contentArea.querySelector('[id*="fi2:id1::content"], [id*=":id1::content"]');
      if (fromEl) {
        fromEl.focus(); fromEl.value = from;
        fromEl.dispatchEvent(new Event('input', { bubbles: true }));
        fromEl.dispatchEvent(new Event('change', { bubbles: true }));
        fromEl.blur();
      }
      const toEl = contentArea.querySelector('[id*="fi3:id2::content"], [id*=":id2::content"]');
      if (toEl) {
        toEl.focus(); toEl.value = to;
        toEl.dispatchEvent(new Event('input', { bubbles: true }));
        toEl.dispatchEvent(new Event('change', { bubbles: true }));
        toEl.blur();
      }
    }, fromStr, toStr);
  }

  // ── Step 5: Click the "View" / Search button ─────────────────────────────
  // Only look in the main content area (pt1:contrRg) to avoid hitting nav buttons
  const viewClicked = await page.evaluate(() => {
    const contentArea = document.getElementById('pt1:contrRg') || document.getElementById('pt1:r2') || document.body;
    const allEls = Array.from(contentArea.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
    for (const el of allEls) {
      if (!el.offsetParent) continue;
      const txt = (el.innerText || el.value || el.getAttribute('title') || '').trim().toLowerCase();
      if (txt === 'view' || txt === 'search' || txt === 'go' || txt === 'find') {
        el.click();
        return { clicked: true, text: txt, tag: el.tagName, id: el.id };
      }
    }
    // Fallback: press Enter in the bundle ID field
    const ta = document.querySelector('textarea[id*="BUNDELID"]');
    if (ta) {
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      return { clicked: false, fallback: 'Enter on BUNDELID' };
    }
    return { clicked: false };
  });

  try {
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 10000 });
  } catch { await sleep(5000); }

  // ── Step 6: Extract transaction results ──────────────────────────────────
  const txData = await page.evaluate(() => {
    // Scope entirely to the main content region (never touch nav/header)
    const mainPanel = document.getElementById('pt1:contrRg')
      || document.getElementById('pt1:r2')
      || document.body;
    const visibleText = (mainPanel.innerText || mainPanel.textContent || '').replace(/\s+/g, ' ').trim();
    const noData = visibleText.toLowerCase().includes('no data to display');

    // Only scan tables inside the main content panel
    const rows = Array.from(mainPanel.querySelectorAll('tr')).filter(r => r.offsetParent);
    const transactions = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td')).map(c => (c.innerText || '').trim().replace(/\s+/g, ' '));
      // Skip header rows (th only) and rows with fewer than 3 actual data cells
      if (cells.length >= 3 && cells.filter(c => c.length > 0).length >= 3) {
        transactions.push(cells);
      }
    }

    // Map columns: Trans Id, Name, Function, Trans Date, Res Ms, Status, Outcome, Patient Id, Purchaser Code, Error Message
    const txRows = transactions.slice(0, 20).map(cells => ({
      transId:       cells[0] || '',
      name:          cells[1] || '',
      func:          cells[2] || '',
      transDate:     cells[3] || '',
      resMs:         cells[4] || '',
      status:        cells[5] || '',
      outcome:       cells[6] || '',
      patientId:     cells[7] || '',
      purchaserCode: cells[8] || '',
      errorMsg:      cells[9] || '',
    }));

    // Extract error detail rows (second table at bottom of page)
    const errorRows = Array.from(mainPanel.querySelectorAll('tr')).filter(r => {
      const txt = (r.innerText || '').toLowerCase();
      return r.offsetParent && (txt.includes('error') || txt.includes('message'));
    }).map(r => (r.innerText || '').trim().replace(/\s+/g, ' ')).slice(0, 10);

    return { visibleText: visibleText.slice(0, 2000), noData, txRows, errorSection: errorRows };
  });

  // ── Step 7: Determine claim status from transaction data ──────────────────
  let gateStatus = "NO_GO";
  const gateReasons = [];
  let transactionStatus = null;
  let transactionOutcome = null;

  if (txData.noData) {
    gateReasons.push("BUNDLE_NOT_FOUND_IN_ORACLE");
  } else if (txData.txRows.length > 0) {
    // Find the row that matches our bundleId (if tx data is present)
    const matchRow = txData.txRows.find(r =>
      r.transId.includes(bundleId) || r.func.toUpperCase().includes('CLAIM') ||
      r.status.length > 0
    ) || txData.txRows[0];

    transactionStatus  = matchRow?.status  || '';
    transactionOutcome = matchRow?.outcome || '';
    const errMsg       = matchRow?.errorMsg || '';

    if (transactionOutcome.toUpperCase().includes('SUCCESS') || transactionStatus.toUpperCase().includes('SUCCESS')) {
      gateStatus = "GO";
    } else if (transactionOutcome.toUpperCase().includes('ERROR') || errMsg.length > 0) {
      gateStatus = "NO_GO";
      gateReasons.push("TRANSACTION_ERROR");
      if (errMsg) gateReasons.push(errMsg.slice(0, 120));
    } else if (transactionStatus.length > 0) {
      gateStatus = "PARTIAL";
      gateReasons.push(`TRANSACTION_STATUS: ${transactionStatus}`);
    }
  } else {
    gateReasons.push("NO_TRANSACTIONS_FOUND");
  }

  const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 50 });

  return {
    bundleId: req.bundleId,
    nationalId: req.nationalId,
    serviceDate: req.serviceDate,
    patientName: req.patientName || null,
    oracleFound: !txData.noData && txData.txRows.length > 0,
    transactionStatus,
    transactionOutcome,
    txRows: txData.txRows.slice(0, 5),
    errorDetails: txData.errorSection,
    bundleIdFilled,
    viewClicked,
    gateStatus,
    gateReason: gateReasons,
    screenshot: `data:image/jpeg;base64,${screenshot}`,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - t0
  };
}

function safeUpper(value, fallback = "UNKNOWN") {
  return String(value || fallback).toUpperCase();
}

function countBy(items, selectValue) {
  const output = {};
  for (const item of items) {
    const key = selectValue(item);
    if (!key) continue;
    output[key] = (output[key] || 0) + 1;
  }
  return output;
}

function extractDominantError(errors = []) {
  if (!errors.length) return "No batch errors recorded";
  const counts = countBy(errors, (entry) => entry?.error || "Unknown batch error");
  const [message] = Object.entries(counts).sort((left, right) => right[1] - left[1])[0] || [];
  return message || "Unknown batch error";
}

function deriveBlockerIssue(blockedSubmissions, blockedServiceItems) {
  if (!blockedSubmissions.length) {
    return {
      code: null,
      affectedClaims: 0,
      affectedServiceItems: 0,
      description: "No blocker claims in the current live batch.",
    };
  }

  return {
    code: "BLOCKER_RECODE_96092-ERR",
    affectedClaims: blockedSubmissions.length,
    affectedServiceItems: blockedServiceItems,
    description: "Service code unknown in contract. Claims must be recoded before resubmission.",
  };
}

function buildBatchPortfolio(submissions, eligibleSubmissions, summary, hospitalId) {
  const blockedSubmissions = submissions.filter((submission) => !eligibleSubmissions.includes(submission));
  const appealDeadline = submissions[0]?.appealDeadline || null;
  const now = new Date();
  const deadline = appealDeadline ? new Date(appealDeadline) : null;
  const totalServiceItems = submissions.reduce((sum, submission) => sum + ((submission.rejections || []).length || 0), 0);
  const readyServiceItems = eligibleSubmissions.reduce((sum, submission) => sum + ((submission.rejections || []).length || 0), 0);
  const blockedServiceItems = totalServiceItems - readyServiceItems;
  const byPriority = countBy(submissions, (submission) => safeUpper(submission.priority, "NORMAL"));
  const byRejectionCode = {};

  for (const submission of submissions) {
    const codes = Array.from(new Set(
      (submission.rejectionCodes || submission.rejections?.map((rejection) => rejection.reason) || [])
        .filter(Boolean)
    ));
    for (const code of codes) {
      byRejectionCode[code] = (byRejectionCode[code] || 0) + 1;
    }
  }

  const criticalClaims = submissions
    .filter((submission) => safeUpper(submission.priority, "NORMAL") === "CRITICAL")
    .slice(0, 5)
    .map((submission) => ({
      bundleId: submission.bundleId,
      patientName: submission.patientName,
      focus: submission.specialNote || (submission.rejectionCodes || []).join(", ") || "Priority appeal",
      priority: safeUpper(submission.priority, "NORMAL"),
    }));

  const blockerClaims = blockedSubmissions
    .slice(0, 10)
    .map((submission) => ({
      bundleId: submission.bundleId,
      patientName: submission.patientName,
      reason: submission.specialNote || "96092-ERR recode required",
      priority: safeUpper(submission.priority, "BLOCKER"),
    }));

  return {
    batchId: submissions[0]?.batchId || summary.sourceBatchId || null,
    payer: submissions[0]?.payer || null,
    provider: submissions[0]?.provider || null,
    appealDeadline,
    withinWindow: deadline ? deadline >= now : null,
    hospital: hospitalId,
    totalClaims: submissions.length,
    readyClaims: eligibleSubmissions.length,
    blockedClaims: blockedSubmissions.length,
    byPriority,
    byRejectionCode,
    totalServiceItems,
    readyServiceItems,
    blockedServiceItems,
    blockerIssue: deriveBlockerIssue(blockedSubmissions, blockedServiceItems),
    criticalClaims,
    blockerClaims,
  };
}

function normalizeLatestBatchSummary(summary) {
  if (!summary) return null;

  return {
    runId: summary.batchId,
    sourceBatchId: summary.sourceBatchId || summary.portfolio?.batchId || null,
    hospital: summary.hospital || summary.portfolio?.hospital || null,
    totalEligible: summary.total || 0,
    processed: summary.processed || 0,
    go: summary.go || 0,
    partial: summary.partial || 0,
    noGo: summary.noGo || 0,
    errorCount: summary.errors || 0,
    dominantError: extractDominantError(summary.errorDetails),
    completedAt: summary.completedAt || null,
    durationMs: summary.durationMs || 0,
    portfolio: summary.portfolio || null,
  };
}

async function getLatestBatchSummary(env) {
  const latestPointer = await env.RESULTS.get("system:latest-batch-key");
  if (latestPointer) {
    const summary = await env.RESULTS.get(latestPointer, { type: "json" });
    if (summary) return summary;
  }

  const listed = await env.RESULTS.list({ prefix: "batch:" });
  if (!listed.keys.length) return null;

  const latestKey = listed.keys
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftValue = Number(left.match(/(\d+)$/)?.[1] || 0);
      const rightValue = Number(right.match(/(\d+)$/)?.[1] || 0);
      return rightValue - leftValue;
    })[0];

  return latestKey ? env.RESULTS.get(latestKey, { type: "json" }) : null;
}

async function getWatchlistResults(env, bundleIds) {
  const ids = Array.from(new Set(bundleIds.filter(Boolean))).slice(0, WATCHLIST_LIMIT);
  const entries = await Promise.all(ids.map(async (bundleId) => {
    const result = await env.RESULTS.get(`result:${bundleId}`, { type: "json" });
    return {
      bundleId,
      available: !!result,
      gateStatus: result?.gateStatus || "UNSEEN",
      transactionStatus: result?.transactionStatus || null,
      transactionOutcome: result?.transactionOutcome || null,
      scannedAt: result?.scannedAt || null,
      gateReason: result?.gateReason || [],
      oracleFound: !!result?.oracleFound,
      error: result?.error || null,
    };
  }));

  return entries;
}

async function getScannerStatusSnapshot(env) {
  const hospitalSessions = {};
  for (const [hospitalId, config] of Object.entries(HOSPITALS)) {
    const session = await env.SESSIONS.get(`oracle_session_${hospitalId}`, { type: "json" });
    hospitalSessions[hospitalId] = {
      name: config.name,
      baseUrl: config.baseUrl,
      session: session ? "active" : "none",
      sessionCookies: session?.length || 0,
    };
  }

  return {
    status: "ok",
    defaultHospital: env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL,
    hospitals: hospitalSessions,
    timestamp: new Date().toISOString(),
    description: "COMPLIANCELINC Multi-Hospital Oracle Claim Scanner",
  };
}

async function prepareOracleSession(browser, env, hospitalConfig) {
  const SESSION_KEY = `oracle_session_${hospitalConfig.id}`;
  const ORACLE_URL = hospitalConfig.baseUrl;
  const LOGIN_PATH = hospitalConfig.loginPath;
  const SEARCH_PATH = hospitalConfig.searchPath;

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) req.abort();
    else req.continue();
  });

  const savedCookies = await env.SESSIONS.get(SESSION_KEY, { type: "json" });
  let loggedIn = false;

  if (savedCookies?.length) {
    await page.setCookie(...savedCookies);
    // Validate session by navigating to the HOME page (not the search page which may not exist)
    await page.goto(`${ORACLE_URL}${LOGIN_PATH}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    const pageContent = await page.content();
    const onLogin  = await page.$('input[type="password"]');
    const is404    = pageContent.includes("404") && pageContent.includes("Not Found");
    loggedIn = !onLogin && !is404;
  }

  if (!loggedIn) {
    const { user: oracleUser, pass: oraclePass } = getHospitalCreds(env, hospitalConfig.id);
    if (!oracleUser || !oraclePass) throw new Error(`Credentials missing for hospital: ${hospitalConfig.id}`);

    await page.goto(`${ORACLE_URL}${LOGIN_PATH}`, { waitUntil: "domcontentloaded", timeout: 30000 });

    let attempts = 0;
    const maxAttempts = 15;
    let usernameField = null;
    
    while (attempts < maxAttempts) {
      await sleep(1500);
      attempts++;
      const pageContent = await page.content();
      const hasChallenge = pageContent.includes('challenge-platform') || pageContent.includes('cf-spinner');
      
      if (!hasChallenge) {
        for (const sel of SEL.username.split(', ')) {
          try { usernameField = await page.$(sel); if (usernameField) break; } catch {}
        }
        if (usernameField) break;
      }
    }

    if (!usernameField) throw new Error("Could not find login form (possible Cloudflare block)");

    await usernameField.click({ clickCount: 3 });
    await usernameField.type(oracleUser, { delay: 10 });

    // Fix: iterate password selectors — page.type() does not accept multi-selector strings
    let passwordTyped = false;
    for (const sel of SEL.password.split(", ")) {
      try {
        const pwField = await page.$(sel.trim());
        if (pwField) { await pwField.click(); await pwField.type(oraclePass, { delay: 10 }); passwordTyped = true; break; }
      } catch {}
    }
    if (!passwordTyped) throw new Error("Could not find password field");
    
    let loginClicked = false;
    for (const sel of SEL.loginBtn.split(', ')) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          loginClicked = true;
          break;
        }
      } catch {}
    }
    if (!loginClicked) await page.keyboard.press('Enter');

    // Oracle shows OS-572 modal dialog via Ajax — no navigation event fires.
    // Do NOT use waitForNavigation here (it would block for the full 20s timeout).
    await sleep(2500);

    // ── Handle Oracle ADF "Previous session" dialog ─────────────────────
    // OS-572: "Previous session(s) already found, Do you want to cancel it?"
    // Oracle ADF renders dialog buttons as custom elements; walk the full DOM.
    let dialogDismissed = false;
    for (let d = 0; d < 8; d++) {
      await sleep(600);
      const result = await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('*'));
        for (const el of allEls) {
          if (!el.offsetParent && el.tagName !== 'BODY') continue;
          const text = (el.innerText || el.textContent || el.value || el.getAttribute('title') || '').trim();
          if (text === 'Yes' || text === '\u2713 Yes' || text.toLowerCase() === 'yes') {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            el.click();
            return true;
          }
        }
        return false;
      });
      if (result === true) { dialogDismissed = true; break; }
    }

    if (dialogDismissed) await sleep(3000);
    else await sleep(1000);

    const stillOnLogin = await page.$('input[type="password"]');
    if (stillOnLogin) throw new Error("Oracle login failed (wrong credentials?)");

    const cookies = await page.cookies();
    await env.SESSIONS.put(SESSION_KEY, JSON.stringify(cookies), { expirationTtl: 28800 });
  }

  return { page, sessionRestored: loggedIn };
}

// ─── Single scan ──────────────────────────────────────────────────────────────
async function handleScan(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const { nationalId, bundleId, serviceDate, patientName, hospital } = body;
  if (!nationalId || !bundleId) return json({ error: "nationalId / bundleId required" }, 400);

  const hospitalId = hospital || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const { page, sessionRestored } = await prepareOracleSession(browser, env, hospitalConfig);
    
    const result = await performOracleScan(page, env, body, hospitalConfig);
    result.sessionRestored = sessionRestored;
    
    await browser.close();
    
    await updateMetrics(env, { success: true, duration: result.durationMs });
    await env.RESULTS.put(`result:${bundleId}`, JSON.stringify(result), { expirationTtl: 86400 });
    return json(result);
  } catch (e) {
    try { await browser?.close(); } catch {}
    await updateMetrics(env, { success: false, duration: 0 });
    return json({ bundleId, nationalId, error: e.message, gateStatus: "ERROR", scannedAt: new Date().toISOString() }, 500);
  }
}

// ─── Batch scan ───────────────────────────────────────────────────────────────
async function handleBatch(request, env) {
  const t0 = Date.now();
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { submissions = [], hospital } = body;
  if (!submissions.length) return json({ error: "submissions[] required" }, 400);

  const hospitalId = hospital || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);

  const eligible = submissions.filter(s => !s.requiresRecode && !s.rejectionCodes?.includes("BE-1-3"));
  const batchId = `batch-${Date.now()}`;
  const results = [];
  const errors  = [];

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const { page, sessionRestored } = await prepareOracleSession(browser, env, hospitalConfig);
    
    for (const sub of eligible) {
      try {
        const result = await performOracleScan(page, env, sub, hospitalConfig);
        result.sessionRestored = sessionRestored;
        results.push(result);
      } catch (e) {
        errors.push({ bundleId: sub.bundleId, error: e.message });
      }
    }
    
    await browser.close();
  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({ error: `Batch initialization failed: ${e.message}` }, 500);
  }

  const durationMs = Date.now() - t0;
  const summary = {
    batchId,
    sourceBatchId: body.batchId || submissions[0]?.batchId || null,
    hospital: hospitalId,
    total: eligible.length,
    processed: results.length,
    go: results.filter(r => r.gateStatus === "GO").length,
    partial: results.filter(r => r.gateStatus === "PARTIAL").length,
    noGo: results.filter(r => r.gateStatus === "NO_GO").length,
    errors: errors.length,
    errorDetails: errors,
    results,
    completedAt: new Date().toISOString(),
    durationMs,
  };

  summary.portfolio = buildBatchPortfolio(submissions, eligible, summary, hospitalId);

  await env.RESULTS.put(`batch:${batchId}`, JSON.stringify(summary), { expirationTtl: 86400 });
  await env.RESULTS.put("system:latest-batch-key", `batch:${batchId}`, { expirationTtl: 86400 });
  return json(summary);
}

// ─── Get stored result ────────────────────────────────────────────────────────
async function handleGetResult(bundleId, env) {
  const result = await env.RESULTS.get(`result:${bundleId}`, { type: "json" });
  if (!result) return json({ error: "Not found", bundleId }, 404);
  return json(result);
}

async function handleGetBatch(batchId, env) {
  const result = await env.RESULTS.get(`batch:${batchId}`, { type: "json" });
  if (!result) return json({ error: "Not found", batchId }, 404);
  return json(result);
}

async function handleLatestBatch(env) {
  const result = await getLatestBatchSummary(env);
  if (!result) return json({ error: "No live batch found" }, 404);
  return json(result);
}

// ─── Status check ─────────────────────────────────────────────────────────────
async function handleStatus(env) {
  return json(await getScannerStatusSnapshot(env));
}

// ─── Metrics tracking ─────────────────────────────────────────────────────────
async function updateMetrics(env, { success, duration }) {
  try {
    const raw = await env.RESULTS.get("system:metrics", { type: "json" }) || {
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      totalDurationMs: 0
    };
    raw.totalScans++;
    raw.totalDurationMs += duration;
    if (success) raw.successfulScans++; else raw.failedScans++;
    await env.RESULTS.put("system:metrics", JSON.stringify(raw));
  } catch (err) {
    // ignore
  }
}

// ─── Metrics endpoint ─────────────────────────────────────────────────────────
async function handleMetrics(env) {
  const metrics = await env.RESULTS.get("system:metrics", { type: "json" }) || {
    totalScans: 0,
    successfulScans: 0,
    failedScans: 0,
    totalDurationMs: 0
  };
  metrics.avgDurationMs = metrics.totalScans > 0 ? Math.round(metrics.totalDurationMs / metrics.totalScans) : 0;
  return json(metrics);
}

async function handleControlTowerClaims(request, env) {
  const url = new URL(request.url);
  const watchlist = (url.searchParams.get("watch") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const [metrics, latestBatch, scannerStatus, watchedClaims] = await Promise.all([
    env.RESULTS.get("system:metrics", { type: "json" }),
    getLatestBatchSummary(env),
    getScannerStatusSnapshot(env),
    getWatchlistResults(env, watchlist),
  ]);

  const normalizedMetrics = metrics || {
    totalScans: 0,
    successfulScans: 0,
    failedScans: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
  };
  normalizedMetrics.avgDurationMs = normalizedMetrics.totalScans > 0
    ? Math.round((normalizedMetrics.totalDurationMs || 0) / normalizedMetrics.totalScans)
    : (normalizedMetrics.avgDurationMs || 0);

  return json({
    generatedAt: new Date().toISOString(),
    metrics: normalizedMetrics,
    scannerStatus,
    latestBatch: normalizeLatestBatchSummary(latestBatch),
    watchlist: watchedClaims,
  });
}

// ─── Health endpoint ──────────────────────────────────────────────────────────
async function handleHealth(env) {
  const health = {
    kv_sessions:   "ok",
    kv_results:    "ok",
    credentials:   "ok",
    portals:       "unchecked",
    hospitals:     {},
    api_key_set:   !!env.API_KEY,
  };

  // Check KVs
  try { await env.SESSIONS.get("__health__"); } catch { health.kv_sessions = "error"; }
  try { await env.RESULTS.get("__health__");  } catch { health.kv_results  = "error"; }

  // Check credentials per hospital
  for (const hId of Object.keys(HOSPITALS)) {
    const { user, pass } = getHospitalCreds(env, hId);
    health.hospitals[hId] = user && pass ? "creds_ok" : "creds_missing";
  }
  const anyCredsOk = Object.values(health.hospitals).some(v => v === "creds_ok");
  if (!anyCredsOk) health.credentials = "missing";

  // Probe portals worker (non-fatal)
  try {
    const portalsUrl = (env.PORTALS_URL || "https://portals.elfadil.com") + "/health";
    const resp = await fetch(portalsUrl, { signal: AbortSignal.timeout(4000) });
    health.portals = resp.ok ? "ok" : `http_${resp.status}`;
  } catch (e) {
    health.portals = `error: ${e.message}`;
  }

  const ok = health.kv_sessions === "ok" && health.kv_results === "ok" && anyCredsOk;
  return json(health, ok ? 200 : 503);
}

// ─── Debug: login flow diagnostics ────────────────────────────────────────────
async function handleDebugLogin(request, env) {
  const url = new URL(request.url);
  const hospitalId = url.searchParams.get("hospital") || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);

  const { user, pass } = getHospitalCreds(env, hospitalId);
  const ORACLE_URL = hospitalConfig.baseUrl;
  const LOGIN_PATH = hospitalConfig.loginPath;

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Navigate to login page
    await page.goto(`${ORACLE_URL}${LOGIN_PATH}`, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for Cloudflare challenge to resolve
    let loginFormFound = false;
    let usernameField = null;
    for (let i = 0; i < 15; i++) {
      await sleep(1500);
      for (const sel of SEL.username.split(', ')) {
        try { usernameField = await page.$(sel); if (usernameField) break; } catch {}
      }
      if (usernameField) { loginFormFound = true; break; }
    }

    const screenshotBefore = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 55 });
    const urlBefore = page.url();
    const titleBefore = await page.title();

    // Get all form inputs on login page
    const loginInputs = await page.$$eval("input", els =>
      els.map(e => ({ id: e.id, name: e.name, type: e.type, placeholder: e.placeholder,
        value: e.type === "password" ? "***" : e.value.slice(0,30) }))
    );

    if (!loginFormFound) {
      await browser.close();
      return json({
        hospital: hospitalId,
        loginFormFound: false,
        urlBefore,
        titleBefore,
        inputs: loginInputs,
        screenshotLoginPage: `data:image/jpeg;base64,${screenshotBefore}`,
        note: "Login form not found — may be Cloudflare challenge or wrong URL"
      });
    }

    // Attempt login
    await usernameField.click({ clickCount: 3 });
    await usernameField.type(user, { delay: 10 });

    for (const sel of SEL.password.split(", ")) {
      try {
        const pwField = await page.$(sel.trim());
        if (pwField) { await pwField.click(); await pwField.type(pass, { delay: 10 }); break; }
      } catch {}
    }

    let loginClicked = false;
    for (const sel of SEL.loginBtn.split(', ')) {
      try {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); loginClicked = true; break; }
      } catch {}
    }
    if (!loginClicked) await page.keyboard.press('Enter');

    // Oracle shows OS-572 modal dialog via Ajax — no navigation event fires after Enter.
    await sleep(2500);

    // ── Handle Oracle ADF "Previous session" dialog ─────────────────────
    // Walk the full DOM to find any visible element with text "Yes".
    let dialogDismissed = false;
    let dialogButtonsInfo = [];
    for (let d = 0; d < 8; d++) {
      await sleep(600);
      const result = await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('*'));
        // Collect debug info on first pass
        const btns = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'))
          .slice(0, 15)
          .map(b => ({ tag: b.tagName, text: (b.innerText || b.textContent || '').trim().slice(0,40), id: b.id, cls: b.className.slice(0,40) }));
        for (const el of allEls) {
          if (!el.offsetParent && el.tagName !== 'BODY') continue;
          const text = (el.innerText || el.textContent || el.value || el.getAttribute('title') || '').trim();
          if (text === 'Yes' || text === '\u2713 Yes' || text.toLowerCase() === 'yes') {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            el.click();
            return { dismissed: true, clickedTag: el.tagName, clickedId: el.id, btns };
          }
        }
        return { dismissed: false, btns };
      });
      dialogButtonsInfo = result.btns || [];
      if (result.dismissed) { dialogDismissed = true; break; }
    }

    if (dialogDismissed) await sleep(3000);
    else await sleep(1500);

    const screenshotAfter = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 55 });
    const urlAfter = page.url();
    const titleAfter = await page.title();

    // Check for error messages
    const errorMessages = await page.$$eval(
      '[class*="error"], [class*="alert"], [class*="message"], [id*="error"], [id*="msg"]',
      els => els.map(e => e.innerText.trim()).filter(t => t.length > 1).slice(0, 5)
    );

    const stillOnLogin = !!(await page.$('input[type="password"]'));
    await browser.close();

    return json({
      hospital: hospitalId,
      loginFormFound: true,
      credentialsUsed: { user, pass: pass.slice(0,2) + "***" },
      loginClicked,
      urlBefore,
      titleBefore,
      urlAfter,
      titleAfter,
      stillOnLoginPage: stillOnLogin,
      loginSucceeded: !stillOnLogin,
      dialogDismissed,
      dialogButtonsInfo,
      errorMessages,
      loginInputs,
      screenshotLoginPage: `data:image/jpeg;base64,${screenshotBefore}`,
      screenshotAfterAttempt: `data:image/jpeg;base64,${screenshotAfter}`,
    });
  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({ error: e.message, hospital: hospitalId }, 500);
  }
}

// ─── Debug: screenshot Oracle home page after login ──────────────────────────
async function handleDebugPortal(request, env) {
  const url = new URL(request.url);
  const hospitalId = url.searchParams.get("hospital") || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  const searchTerm = url.searchParams.get("search") || "insurance";
  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const { page, sessionRestored } = await prepareOracleSession(browser, env, hospitalConfig);

    const currentUrl  = page.url();
    const title       = await page.title();

    // ── Step 1: Open the hamburger/navigation menu ────────────────────────
    let menuOpened = false;
    let menuOpenDebug = null;
    try {
      const clickResult = await page.evaluate(() => {
        // Use the confirmed Oracle ADF hamburger button ID
        const el = document.getElementById('pt1:OasisHedarToolBar:hamburgerBtn')
          || document.querySelector('[id$=":hamburgerBtn"]')
          || document.querySelector('.hamburger-menu-btn');
        if (el) {
          el.click();
          return { method: 'hamburgerBtn', id: el.id, cls: el.className };
        }
        return null;
      });
      menuOpenDebug = clickResult;
      if (clickResult) { await sleep(2500); menuOpened = true; }
    } catch (e2) { menuOpenDebug = { error: e2.message }; }

    const screenshotAfterHamburger = menuOpened
      ? await page.screenshot({ encoding: "base64", type: "jpeg", quality: 50 })
      : null;

    // ── Step 2: Type in the main menu search to filter items ──────────────
    const menuSearchSel = '[id="pt1:r1:0:os-mainmenu-search::content"], input[id*="os-mainmenu-search"]';
    let menuSearchUsed = false;
    try {
      const menuInput = await page.$(menuSearchSel);
      if (menuInput) {
        await menuInput.click({ clickCount: 3 });
        await menuInput.type(searchTerm, { delay: 80 });
        await sleep(2500);
        menuSearchUsed = true;
      }
    } catch {}

    const screenshotAfterSearch = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 55 });

    // ── Step 3: Collect all visible navigation menu items with hrefs ────────
    const menuNavItems = await page.evaluate(() => {
      const results = [];
      const sidebar = document.getElementById('pt1:r1') || document.body;
      const allEls = sidebar.querySelectorAll('a, li, span[role], div[role]');
      for (const el of allEls) {
        if (!el.offsetParent) continue;
        const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (text.length < 2 || text.length > 100) continue;
        const href = el.href || el.getAttribute('href') || null;
        results.push({
          tag:  el.tagName,
          text,
          href: href ? href.replace(location.origin, '') : null,
          id:   el.id.slice(0, 80),
          cls:  el.className.slice(0, 60)
        });
      }
      return results
        .filter((v, i, a) => a.findIndex(x => x.text === v.text) === i)
        .slice(0, 100);
    });

    // ── Step 4: Also collect all visible inputs ───────────────────────────
    const inputs = await page.$$eval("input:not([type='hidden'])", els =>
      els.map(e => ({ id: e.id, name: e.name, type: e.type, placeholder: e.placeholder, visible: e.offsetParent !== null }))
        .filter(e => e.visible).slice(0, 20)
    );

    await browser.close();

    return json({
      hospital: hospitalId,
      sessionRestored,
      currentUrl,
      title,
      menuOpened,
      menuOpenDebug,
      menuSearchUsed,
      searchedFor: searchTerm,
      menuNavItems,
      inputs,
      screenshotAfterHamburger: screenshotAfterHamburger ? `data:image/jpeg;base64,${screenshotAfterHamburger}` : null,
      screenshot: `data:image/jpeg;base64,${screenshotAfterSearch}`,
      note: "Try ?search=billing or ?search=claim or ?search=patient to explore menu"
    });
  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({ error: e.message, hospital: hospitalId }, 500);
  }
}

// ─── Debug: dump full sidebar nav tree after hamburger click ────────────────
// GET /debug/menu?hospital=riyadh
// Returns ALL <a> links from sidebar with text, href, and parent section labels
async function handleDebugMenu(request, env) {
  const url = new URL(request.url);
  const hospitalId = url.searchParams.get("hospital") || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);

  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };
  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const { page, sessionRestored } = await prepareOracleSession(browser, env, hospitalConfig);

    // Open hamburger
    const menuOpened = await page.evaluate(() => {
      const el = document.getElementById('pt1:OasisHedarToolBar:hamburgerBtn')
        || document.querySelector('[id$=":hamburgerBtn"]')
        || document.querySelector('.hamburger-menu-btn');
      if (el) { el.click(); return true; }
      return false;
    });
    if (!menuOpened) return json({ error: 'Hamburger not found', sessionRestored }, 500);
    await sleep(3000);

    // Dump full nav tree — capture IDs, onclick, parent chain for ADF SPANs
    const navTree = await page.evaluate(() => {
      const sidebar = document.getElementById('pt1:r1') || document.body;

      // Sidebar HTML snippet for structure inspection
      const sidebarHtml = sidebar.innerHTML.replace(/\s+/g, ' ').slice(0, 10000);

      // ALL visible leaf nodes + their closest ancestor with an ID (ADF pattern)
      const allVisible = Array.from(sidebar.querySelectorAll('*'))
        .filter(el => el.offsetParent && el.children.length === 0)
        .map(el => {
          const text = (el.innerText || el.textContent || '').trim();
          // Walk up to find ancestor with ID (the clickable ADF component)
          let anc = el.parentElement;
          let ancId = '', ancTag = '', ancOnclick = '', ancHref = '';
          while (anc && anc !== sidebar) {
            if (anc.id || anc.getAttribute('onclick') || anc.tagName === 'A') {
              ancId      = anc.id || '';
              ancTag     = anc.tagName;
              ancOnclick = (anc.getAttribute('onclick') || '').slice(0, 200);
              ancHref    = anc.tagName === 'A' ? (anc.getAttribute('href') || '') : '';
              if (ancId) break; // prefer stopping at first ID
            }
            anc = anc.parentElement;
          }
          return { tag: el.tagName, text, id: el.id, href: ancHref,
                   parentId: ancId, parentTag: ancTag, onclick: ancOnclick };
        })
        .filter(el => el.text.length > 1 && el.text.length < 120)
        .slice(0, 300);

      // Clickable elements: anything with onclick / role / ADF list styles
      const clickables = Array.from(sidebar.querySelectorAll('[onclick], [role], li, td'))
        .filter(el => el.offsetParent !== null && (el.getAttribute('onclick') || el.id))
        .map(el => ({
          tag:     el.tagName,
          id:      el.id,
          role:    el.getAttribute('role') || '',
          text:    (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
          onclick: (el.getAttribute('onclick') || '').slice(0, 300),
        }))
        .filter(x => x.text.length > 1)
        .slice(0, 150);

      // Legacy anchor scan (standard <a> links — may be empty for ADF)
      const anchors = Array.from(sidebar.querySelectorAll('a'))
        .filter(el => el.offsetParent)
        .map(el => ({
          text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' '),
          href: el.getAttribute('href') || '',
          fullHref: el.href ? el.href.replace(location.origin, '') : '',
          id: el.id, cls: el.className,
        }))
        .filter(l => l.text && l.text.length > 1);

      const sections = [];
      return { sidebarHtml, anchors, sections, allVisible, clickables };
    });

    const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });
    await browser.close();

    return json({
      hospital:       hospitalId,
      sessionRestored,
      menuOpened,
      anchorCount:    navTree.anchors.length,
      sectionCount:   navTree.sections.length,
      clickableCount: navTree.clickables.length,
      visibleCount:   navTree.allVisible.length,
      anchors:        navTree.anchors,
      sections:       navTree.sections,
      clickables:     navTree.clickables,
      allVisible:     navTree.allVisible,
      sidebarHtml:    navTree.sidebarHtml,
      screenshot:     `data:image/jpeg;base64,${screenshot}`,
      note:           "allVisible[].parentId = ADF component ID to .click(). clickables[].onclick shows JS handler."
    });
  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({ error: e.message, hospital: hospitalId }, 500);
  }
}

// ─── Debug: click a menu item by text, return resulting URL ─────────────────
// GET /debug/click?hospital=riyadh&item=Billing+Transactions
async function handleDebugClick(request, env) {
  const url = new URL(request.url);
  const hospitalId = url.searchParams.get("hospital") || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  const itemText   = url.searchParams.get("item") || "";
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);
  if (!itemText)              return json({ error: "?item= is required (menu item text to click)" }, 400);

  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };
  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const { page, sessionRestored } = await prepareOracleSession(browser, env, hospitalConfig);

    // Open hamburger
    const menuOpened = await page.evaluate(() => {
      const el = document.getElementById('pt1:OasisHedarToolBar:hamburgerBtn')
        || document.querySelector('[id$=":hamburgerBtn"]');
      if (el) { el.click(); return true; }
      return false;
    });
    if (!menuOpened) return json({ error: "Hamburger not found" }, 500);
    await sleep(3000);

    // Strategy: click by .os-treeview-item-text (ADF nav widget class — works without typing in search)
    const urlBefore = page.url();
    const clickInfo = await page.evaluate((target) => {
      const sidebar = document.getElementById('pt1:r1') || document.body;
      const targetLower = target.toLowerCase().trim();

      // Method 1: find leaf by title attribute on .os-treeview-item-text SPAN
      const byTitle = sidebar.querySelector(`.os-treeview-item-text[title="${target.toUpperCase()}"]`)
        || sidebar.querySelector(`.os-treeview-item-text[title="${target}"]`);
      if (byTitle) {
        const row = byTitle.closest('.os-treeview-item-content') || byTitle.parentElement;
        row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        const r = row.getBoundingClientRect();
        return { found: true, text: byTitle.textContent.trim(), method: 'byTitle', clickedId: row.id||'', clickedTag: row.tagName, x: r.left + r.width/2, y: r.top + r.height/2, hasRect: r.width>0 && r.height>0 };
      }

      // Method 2: find .os-treeview-item-text SPAN whose textContent matches exactly
      const allTextSpans = Array.from(sidebar.querySelectorAll('.os-treeview-item-text'));
      for (const span of allTextSpans) {
        const txt = (span.innerText || span.textContent || '').trim();
        if (txt.toLowerCase() === targetLower) {
          const row = span.closest('.os-treeview-item-content') || span.parentElement;
          row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          const r = row.getBoundingClientRect();
          const titleCode = span.getAttribute('title') || '';
          // Prefer clicking parent SPAN.os-treeview-item (which has the id like "9292-T")
          const treeItem = span.closest('.os-treeview-item');
          const clickTarget = row; // item-content DIV is the clickable row in this ADF widget
          return {
            found: true, text: txt, titleCode, method: 'byTextSpan',
            clickedId: clickTarget.id||'', clickedTag: clickTarget.tagName,
            treeItemId: treeItem ? treeItem.id : '',
            isLeaf: treeItem ? treeItem.classList.contains('os-treeview-leaf') : false,
            x: r.left + r.width/2, y: r.top + r.height/2,
            hasRect: r.width > 0 && r.height > 0,
          };
        }
      }

      // Method 3: fallback — any element whose full text matches
      const all = Array.from(sidebar.querySelectorAll('*')).filter(el => el.children.length === 0);
      for (const el of all) {
        const txt = (el.innerText || el.textContent || '').trim();
        if (txt.toLowerCase().includes(targetLower)) {
          const row = el.closest('.os-treeview-item-content') || el.closest('div') || el.parentElement;
          const clickTarget = row || el;
          clickTarget.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          const r = clickTarget.getBoundingClientRect();
          return {
            found: true, text: txt, method: 'fallback',
            clickedId: clickTarget.id||'', clickedTag: clickTarget.tagName,
            x: r.left + r.width/2, y: r.top + r.height/2,
            hasRect: r.width > 0 && r.height > 0,
          };
        }
      }
      return { found: false };
    }, itemText);

    if (!clickInfo.found) {
      await browser.close();
      return json({ error: `Menu item not found: "${itemText}"`, hospitalId, sessionRestored }, 404);
    }

    // Use Puppeteer real mouse click for ADF event delegation to fire properly
    let clicked = {
      found: true, text: clickInfo.text,
      clickedId: clickInfo.clickedId, clickedTag: clickInfo.clickedTag,
      method: clickInfo.method, titleCode: clickInfo.titleCode,
      treeItemId: clickInfo.treeItemId, isLeaf: clickInfo.isLeaf,
    };
    try {
      if (clickInfo.hasRect && clickInfo.x > 0 && clickInfo.y > 0) {
        await page.mouse.move(clickInfo.x, clickInfo.y);
        await page.mouse.down();
        await sleep(80);
        await page.mouse.up();
        clicked.method = 'mouse.down+up';
      } else {
        await page.evaluate((id, target) => {
          const el = (id && document.getElementById(id))
            || Array.from(document.querySelectorAll('li,a,[onclick]'))
                .find(e => (e.innerText || e.textContent || '').trim().toLowerCase().includes(target.toLowerCase()));
          if (el) {
            el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
            ['mousedown','mouseup','click'].forEach(ev =>
              el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }))
            );
          }
        }, clickInfo.clickedId, itemText);
        clicked.method = 'dispatchEvent.fallback';
      }
      clicked.onclick = clickInfo.onclick;
    } catch (ce) {
      clicked.clickError = ce.message;
    }

    // Wait for ADF partial-page refresh to settle (network idle preferred, then fallback sleep)
    try {
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 });
    } catch { await sleep(4000); }

    const urlAfter  = page.url();
    const pageTitle = await page.title().catch(() => '');

    // Capture visible page state — ADF headers, panels, visible text, form fields
    const pageState = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'))
        .filter(el => el.offsetParent)
        .map(el => ({ tag: el.tagName, id: el.id, name: el.name, type: el.type, placeholder: el.placeholder }))
        .slice(0, 50);
      const buttons = Array.from(document.querySelectorAll('button, a.btn, a[class*="Btn"], [class*="button"]'))
        .filter(el => el.offsetParent)
        .map(el => ({ tag: el.tagName, id: el.id, text: (el.innerText || el.value || '').trim().slice(0, 60) }))
        .slice(0, 30);
      const headers = Array.from(document.querySelectorAll('h1, h2, h3, [class*="Title"], [class*="Header"], [class*="title"], [class*="header"], .title, .header'))
        .filter(el => el.offsetParent)
        .map(el => (el.innerText || el.textContent || '').trim().slice(0, 80))
        .filter(t => t.length > 1)
        .slice(0, 15);
      // Capture visible page text in main content area (ADF panel/region)
      const mainPanel = document.getElementById('pt1:r2') || document.querySelector('[id$=":r2"]')
        || document.getElementById('pt1:pc1') || document.querySelector('.AFMaskingContent') || document.body;
      const visibleText = (mainPanel.innerText || mainPanel.textContent || '').trim().slice(0, 1500).replace(/\s+/g, ' ');
      return { inputs, buttons, headers, visibleText };
    });

    const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });
    await browser.close();

    return json({
      hospital: hospitalId, sessionRestored, menuOpened,
      clickedItem: itemText, clicked,
      urlBefore, urlAfter, pageTitle,
      urlChanged: urlBefore !== urlAfter,
      adfPartialRender: urlBefore === urlAfter, // ADF stays on same URL, content changes
      relativePath: urlAfter.replace(/^https?:\/\/[^/]+/, ''),
      pageState,
      screenshot: `data:image/jpeg;base64,${screenshot}`,
    });
  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({ error: e.message, hospital: hospitalId }, 500);
  }
}

// ─── Debug: navigate to Api Transactions and search by date/bundleId ────────
// GET /debug/api-scan?hospital=riyadh&from=01/03/2026&to=31/03/2026&bundleId=xxx
async function handleDebugApiScan(request, env) {
  const url = new URL(request.url);
  const hospitalId  = url.searchParams.get("hospital") || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  const fromDate    = url.searchParams.get("from") || "";
  const toDate      = url.searchParams.get("to") || "";
  const bundleId    = url.searchParams.get("bundleId") || "";
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);

  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };
  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const { page, sessionRestored } = await prepareOracleSession(browser, env, hospitalConfig);

    // Open hamburger
    await page.evaluate(() => {
      const el = document.getElementById('pt1:OasisHedarToolBar:hamburgerBtn')
        || document.querySelector('[id$=":hamburgerBtn"]');
      if (el) el.click();
    });
    await sleep(3000);

    // Navigate to Api Transactions
    const clickInfo = await page.evaluate(() => {
      const sidebar = document.getElementById('pt1:r1') || document.body;
      for (const span of sidebar.querySelectorAll('.os-treeview-item-text')) {
        if ((span.innerText || span.textContent || '').trim() === 'Api Transactions') {
          const row = span.closest('.os-treeview-item-content') || span.parentElement;
          row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          const r = row.getBoundingClientRect();
          return { found: true, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      return { found: false };
    });
    if (!clickInfo.found) return json({ error: 'Api Transactions not found in sidebar' }, 500);
    await page.mouse.move(clickInfo.x, clickInfo.y);
    await page.mouse.down(); await sleep(80); await page.mouse.up();
    try { await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 }); } catch { await sleep(4000); }

    // Helper to normalize date to Oracle format
    function toOracleDate(raw, eod) {
      if (!raw) return raw;
      const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m1) return `${m1[1]}-${m1[2]}-${m1[3]} ${eod ? '23:59:59' : '00:00:00'}`;
      return raw;
    }

    // Get selectors for date/bundle fields for real keyboard interaction
    const selectors = await page.evaluate(() => {
      const contentArea = document.getElementById('pt1:contrRg') || document.body;
      function getSelector(el) {
        if (!el) return null;
        // Use full id attribute as CSS selector
        return '#' + CSS.escape(el.id);
      }
      return {
        fromSel: getSelector(contentArea.querySelector('[id*="fi2:id1::content"], [id*=":id1::content"]')),
        toSel:   getSelector(contentArea.querySelector('[id*="fi3:id2::content"], [id*=":id2::content"]')),
        bundleSel: getSelector(contentArea.querySelector('textarea[id*="BUNDELID"]')),
        allInputIds: Array.from(contentArea.querySelectorAll('input, textarea, select'))
          .map(el => ({ id: el.id.slice(-60), type: el.type || el.tagName.toLowerCase() }))
      };
    });

    const fillResult = { fromFilled: false, toFilled: false, bundleFilled: false, allInputIds: selectors.allInputIds };

    // Fill From Date using real keyboard interaction
    if (selectors.fromSel && fromDate) {
      const fromVal = toOracleDate(fromDate, false);
      await page.click(selectors.fromSel, { clickCount: 3 });
      await sleep(100);
      await page.keyboard.type(fromVal, { delay: 30 });
      await page.keyboard.press('Tab');
      await sleep(300);
      fillResult.fromFilled = true;
    }

    // Fill To Date using real keyboard interaction
    if (selectors.toSel && toDate) {
      const toVal = toOracleDate(toDate, true);
      await page.click(selectors.toSel, { clickCount: 3 });
      await sleep(100);
      await page.keyboard.type(toVal, { delay: 30 });
      await page.keyboard.press('Tab');
      await sleep(300);
      fillResult.toFilled = true;
    }

    // Fill Bundle ID
    if (selectors.bundleSel && bundleId) {
      await page.click(selectors.bundleSel, { clickCount: 3 });
      await sleep(100);
      await page.keyboard.type(bundleId, { delay: 10 });
      await sleep(200);
      fillResult.bundleFilled = true;
    }

    await sleep(500);

    // Click View button
    const viewClicked = await page.evaluate(() => {
      const area = document.getElementById('pt1:contrRg') || document.body;
      for (const el of area.querySelectorAll('button, a, input[type="button"], input[type="submit"]')) {
        if (!el.offsetParent) continue;
        const txt = (el.innerText || el.value || el.getAttribute('title') || '').trim().toLowerCase();
        if (txt === 'view' || txt === 'search' || txt === 'go') {
          el.click(); return { text: txt, id: el.id };
        }
      }
      return null;
    });

    try { await page.waitForNetworkIdle({ idleTime: 1000, timeout: 12000 }); } catch { await sleep(6000); }

    // Extract results
    const txResult = await page.evaluate(() => {
      const area = document.getElementById('pt1:contrRg') || document.body;
      const visibleText = (area.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
      const noData = visibleText.toLowerCase().includes('no data to display');

      const rows = Array.from(area.querySelectorAll('tr'))
        .filter(r => r.offsetParent && r.querySelectorAll('td').length >= 5);
      const txRows = rows.slice(0, 30).map(r =>
        Array.from(r.querySelectorAll('td')).map(td => (td.innerText || '').trim().replace(/\s+/g, ' '))
      );

      return { visibleText, noData, txRows };
    });

    const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 55 });
    await browser.close();

    return json({
      hospital: hospitalId, sessionRestored, fromDate, toDate, bundleId,
      fillResult, viewClicked, noData: txResult.noData,
      txRows: txResult.txRows.slice(0, 20),
      visibleText: txResult.visibleText.slice(0, 2000),
      screenshot: `data:image/jpeg;base64,${screenshot}`
    });
  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({ error: e.message, hospital: hospitalId }, 500);
  }
}

// ─── Debug: search Manage Claims page with period dates ──────────────────────
async function handleDebugManageClaims(request, env) {
  const url = new URL(request.url);
  const hospitalId = url.searchParams.get("hospital") || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  const fromDate   = url.searchParams.get("from") || "2026-02-01";  // YYYY-MM-DD or DD-MM-YYYY
  const toDate     = url.searchParams.get("to")   || "2026-02-28";
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);

  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };

  // Normalize date to DD-MM-YYYY format for Manage Claims
  function toDDMMYYYY(raw) {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return raw; // already in target format
  }

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const { page, sessionRestored } = await prepareOracleSession(browser, env, hospitalConfig);

    // Open hamburger sidebar
    await page.evaluate(() => {
      const el = document.getElementById('pt1:OasisHedarToolBar:hamburgerBtn')
        || document.querySelector('[id$=":hamburgerBtn"]');
      if (el) el.click();
    });
    await sleep(3000);

    // Navigate to Manage Claims
    const clickInfo = await page.evaluate(() => {
      const sidebar = document.getElementById('pt1:r1') || document.body;
      for (const span of sidebar.querySelectorAll('.os-treeview-item-text')) {
        const txt = (span.innerText || span.textContent || '').trim();
        if (txt === 'Manage Claims') {
          const row = span.closest('.os-treeview-item-content') || span.parentElement;
          row.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          const r = row.getBoundingClientRect();
          return { found: true, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      return { found: false };
    });
    if (!clickInfo.found) return json({ error: 'Manage Claims not found in sidebar' }, 500);

    await page.mouse.move(clickInfo.x, clickInfo.y);
    await page.mouse.down(); await sleep(80); await page.mouse.up();
    try { await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 }); } catch { await sleep(4000); }

    // Get field selectors
    const selectors = await page.evaluate(() => {
      const area = document.getElementById('pt1:contrRg') || document.body;
      const inputs = Array.from(area.querySelectorAll('input[id*="::content"], select[id*="::content"]'));
      const result = { allIds: inputs.map(el => ({ id: el.id.slice(-70), type: el.type || el.tagName })) };
      // Period Start >= (val00), Period Start <= (val10)
      for (const el of inputs) {
        if (el.id.includes('val00')) result.fromSel = '#' + CSS.escape(el.id);
        if (el.id.includes('val10')) result.toSel   = '#' + CSS.escape(el.id);
      }
      return result;
    });

    const fromVal = toDDMMYYYY(fromDate);
    const toVal   = toDDMMYYYY(toDate);
    const fillResult = { fromFilled: false, toFilled: false, fromVal, toVal };

    // ADF date inputs: use keyboard but press Escape first to dismiss any calendar popup
    // Strategy: Tab to field, Escape to close popup, Ctrl+A to select all, type value, Tab to commit
    async function fillAdfDate(sel, val) {
      if (!sel) return false;
      try {
        // Click, Escape to dismiss calendar popup that opens on click, then select-all + type
        await page.click(sel);
        await sleep(150);
        await page.keyboard.press('Escape');
        await sleep(100);
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await sleep(50);
        await page.keyboard.type(val, { delay: 25 });
        await sleep(100);
        // Tab to next field to commit
        await page.keyboard.press('Tab');
        await sleep(400);
        return true;
      } catch { return false; }
    }

    // Get field selectors (val00=from, val10=to)
    const fromSel = selectors.fromSel;
    const toSel   = selectors.toSel;

    fillResult.fromFilled = await fillAdfDate(fromSel, fromVal);
    fillResult.toFilled   = await fillAdfDate(toSel, toVal);

    // Verify what values actually ended up in the fields
    const actualValues = await page.evaluate(() => {
      const area = document.getElementById('pt1:contrRg') || document.body;
      const vals = {};
      for (const input of area.querySelectorAll('input[id*="::content"]')) {
        if (input.id.includes('val00')) vals.fromActual = input.value;
        if (input.id.includes('val10')) vals.toActual   = input.value;
      }
      return vals;
    });
    Object.assign(fillResult, actualValues);

    await sleep(300);

    // Click View button
    const viewClicked = await page.evaluate(() => {
      const area = document.getElementById('pt1:contrRg') || document.body;
      for (const el of area.querySelectorAll('button, a, input[type="button"]')) {
        if (!el.offsetParent) continue;
        const txt = (el.innerText || el.value || el.getAttribute('title') || '').trim().toLowerCase();
        if (txt === 'view' || txt === 'search' || txt === 'find') {
          el.click(); return { text: txt, id: el.id };
        }
      }
      return null;
    });

    try { await page.waitForNetworkIdle({ idleTime: 1000, timeout: 12000 }); } catch { await sleep(6000); }

    // After Search: check if Approved link exists in right panel and click via scrollIntoView
    let approvedLink = { found: false };
    try {
      approvedLink = await page.evaluate(() => {
        const area = document.getElementById('pt1:contrRg') || document.body;
        for (const a of area.querySelectorAll('a')) {
          if (!a.offsetParent) continue;
          const t = (a.innerText || '').trim().replace(/\s+/g, ' ');
          if (/^Approved/i.test(t)) {
            a.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            return { found: true, text: t, id: a.id };
          }
        }
        return { found: false };
      });
      if (approvedLink.found) {
        await sleep(400);
        // Use evaluate to actually click it (avoids coordinate off-screen issues)
        await page.evaluate((id) => {
          const a = id ? document.getElementById(id) : null;
          if (a) { a.click(); return; }
          // fallback: search by text
          const area = document.getElementById('pt1:contrRg') || document.body;
          for (const el of area.querySelectorAll('a')) {
            if (/^Approved/i.test((el.innerText || '').trim())) { el.click(); return; }
          }
        }, approvedLink.id);
        try { await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }); } catch { await sleep(5000); }
        // Scroll down to see the claim data table that appears below the summary panel
        await page.evaluate(() => window.scrollBy(0, 600));
        await sleep(1000);
        // Scroll more to reveal data rows
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(800);
      }
    } catch(e) { approvedLink = { found: false, error: e.message }; }

    // Extract claim rows + summary panel
    const claimResult = await page.evaluate(() => {
      const area = document.getElementById('pt1:contrRg') || document.body;
      const fullText = (area.innerText || '').replace(/\s+/g, ' ').trim();
      const visibleText = fullText.slice(0, 3000);
      const noData = fullText.toLowerCase().includes('no data to display') &&
                     !fullText.match(/Approved\s+\d+|Ready\s+Since|Month\s*\+/i);
      const formError = fullText.includes('These fields are required');

      // Try to extract summary stats from right panel (numbers after "Approved", "Ready To Download", etc.)
      const summary = {};
      const approvedM = fullText.match(/Approved\s+(\d[\d,]*)/i);
      const readyM    = fullText.match(/Ready\s+To\s+Download\s+(\d[\d,]*)/i);
      const expensesM = fullText.match(/Expenses\s+([\d,.]+)/i);
      if (approvedM) summary.approved = approvedM[1];
      if (readyM)    summary.readyToDownload = readyM[1];
      if (expensesM) summary.expenses = expensesM[1];

      // Look for actual claim data rows — match rows with period/date patterns
      // Claim data rows contain: "MMM - YYYY" period, "DD-MM-YYYY" dates, numeric amounts
      const PERIOD_RE   = /^[A-Z]{3,}\s*[-–]\s*\d{4}$/;   // e.g. "SEP - 2023", "FEB - 2026"
      const DATE_RE     = /^\d{2}-\d{2}-\d{4}$/;            // DD-MM-YYYY
      const NUMERIC_RE  = /^[\d,]+(\.\d+)?$/;               // amounts
      // Calendar popup rows: cells are pure day-numbers or weekday abbrevs
      const CALENDAR_CELL_RE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat|\d{1,2})$/;

      let claimRows = [];
      for (const r of document.querySelectorAll('tr')) {
        const tds = Array.from(r.querySelectorAll('td'));
        if (tds.length < 3 || tds.length > 15) continue;
        const cells = tds.map(td => (td.innerText || '').trim().replace(/\s+/g, ' ')).filter(c => c);
        if (cells.length < 3) continue;
        // Skip calendar popup rows (weekday names or pure day numbers)
        if (cells.every(c => CALENDAR_CELL_RE.test(c))) continue;
        // Skip form label rows
        if (cells[0].includes('Period Start') || cells[0].includes('Payer') || cells[0].includes('Affiliates')) continue;
        // Skip header rows
        if (/^(Period|Start Date|End Date|Update Date|Amount|Errors|Episodes)$/i.test(cells[0])) continue;
        // Accept rows that have period or date pattern in first 3 cells
        const hasPeriodOrDate = cells.slice(0, 3).some(c => PERIOD_RE.test(c) || DATE_RE.test(c));
        if (!hasPeriodOrDate) continue;
        // Exclude rows with UI noise
        if (cells.some(c => c.length > 150)) continue;
        claimRows.push(cells);
        if (claimRows.length >= 50) break;
      }

      return { visibleText, noData, formError, summary, claimRows };
    });

    const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 55 });
    await browser.close();

    return json({
      hospital: hospitalId, sessionRestored, fromDate, toDate,
      fillResult, selectors: { fromSel: selectors.fromSel, toSel: selectors.toSel },
      viewClicked, approvedLink, noData: claimResult.noData, formError: claimResult.formError,
      summary: claimResult.summary,
      claimRows: claimResult.claimRows.slice(0, 20),
      visibleText: claimResult.visibleText.slice(0, 2000),
      screenshot: `data:image/jpeg;base64,${screenshot}`
    });
  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({ error: e.message, hospital: hospitalId }, 500);
  }
}

// ─── Debug: navigate to a specific Oracle path to discover UI ────────────────
async function handleDebugNavigate(request, env) {
  const url = new URL(request.url);
  const hospitalId = url.searchParams.get("hospital") || env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL;
  const path = url.searchParams.get("path") || "/prod/faces/Home";
  if (!HOSPITALS[hospitalId]) return json({ error: `Unknown hospital: ${hospitalId}` }, 400);

  const hospitalConfig = { id: hospitalId, ...HOSPITALS[hospitalId] };
  const ORACLE_URL = hospitalConfig.baseUrl || `https://oracle-${hospitalId}.elfadil.com`;

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const { page } = await prepareOracleSession(browser, env, hospitalConfig);

    const targetUrl = `${ORACLE_URL}${path}`;
    const resp = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => null);
    const httpStatus = resp?.status() ?? 0;
    await sleep(2000);

    const currentUrl = page.url();
    const title = await page.title();
    const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 55 });

    // Get visible links and inputs on this page
    const links = await page.$$eval("a[href]", els =>
      els.map(e => ({ text: e.innerText.trim().slice(0,60), href: e.href, id: e.id }))
        .filter(l => l.text).slice(0, 30)
    ).catch(() => []);

    const inputs = await page.$$eval("input:not([type='hidden'])", els =>
      els.filter(e => e.offsetParent).map(e => ({ id: e.id, placeholder: e.placeholder, type: e.type }))
    ).catch(() => []);

    // Get top-level anchor IDs/classes (to find hamburger button)
    const allAnchors = await page.$$eval("a", els =>
      els.map(e => ({ id: e.id, cls: e.className, text: (e.innerText||'').trim().slice(0,30), visible: !!e.offsetParent }))
        .filter(e => e.id || e.text).slice(0, 40)
    ).catch(() => []);

    await browser.close();
    return json({ hospital: hospitalId, path, targetUrl, httpStatus, currentUrl, title, links, inputs, allAnchors, screenshot: `data:image/jpeg;base64,${screenshot}` });
  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({ error: e.message, hospital: hospitalId, path }, 500);
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
