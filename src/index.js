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

// ── API key guard ───────────────────────────────────────────────────────────
function requireApiKey(request, env) {
  // If no API_KEY secret is configured, skip auth (dev/unset)
  if (!env.API_KEY) return null;
  const auth = request.headers.get("Authorization") ?? "";
  const key  = auth.startsWith("Bearer ") ? auth.slice(7) : (new URL(request.url).searchParams.get("key") ?? "");
  if (key !== env.API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" },
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
  const { nationalId, patientName } = req;
  const ORACLE_URL = hospitalConfig.baseUrl;
  const HOME_PATH  = hospitalConfig.loginPath;   // Use the login/home path (always valid)

  // ── Step 3: Navigate to the Oracle home/search page ───────────────────────
  // Try the home page with ?action=search hint, then fall back to plain home page.
  // Oracle Oasis+ installations often expose search directly on the home page.
  let navigated = false;
  for (const candidate of [
    `${ORACLE_URL}${HOME_PATH}?action=search`,
    `${ORACLE_URL}${HOME_PATH}`,
  ]) {
    try {
      const resp = await page.goto(candidate, { waitUntil: "domcontentloaded", timeout: 30000 });
      const status = resp?.status() ?? 0;
      if (status < 400) { navigated = true; break; }
    } catch { /* try next */ }
  }
  if (!navigated) throw new Error("Could not navigate to Oracle search page");

  const searchSelectors = [
    SEL.searchInput,
    'input[id*="NationalID"]',
    'input[id*="national_id"]',
    'input[name*="nationalId"]',
    'input[placeholder*="ID"]',
  ];

  let searched = false;
  for (const sel of searchSelectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click({ clickCount: 3 });
      await el.type(nationalId, { delay: 10 });
      await page.keyboard.press("Enter");
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 })
        .catch(() => {});
      searched = true;
      break;
    }
  }

  if (!searched && patientName) {
    const nameInput = await page.$('input[id*="name"], input[placeholder*="Name" i]');
    if (nameInput) {
      await nameInput.type(patientName.split(" ")[0], { delay: 10 });
      await page.keyboard.press("Enter");
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 })
        .catch(() => {});
    }
  }

  // ── Step 4: Extract patient record ────────────────────────────────────
  const patientRows = await page.$$(SEL.patientRow);
  let mrn = null;
  let patientFound = false;
  let extractedName = null;

  for (const row of patientRows.slice(0, 5)) {
    const text = await row.evaluate(el => el.innerText).catch(() => "");
    if (text.includes(nationalId)) {
      patientFound = true;
      const mrnMatch = text.match(/\b([0-9]{5,8})\b/);
      if (mrnMatch) mrn = mrnMatch[1];
      extractedName = text.split("\n")[0]?.trim();
      break;
    }
  }

  // ── Step 5: Retrieve document links ───────────────────────────────────
  const docs = [];
  if (patientFound) {
    const links = await page.$$(SEL.docLinks);
    for (const link of links.slice(0, 5)) {
      const href  = await link.evaluate(el => el.href).catch(() => "");
      const label = await link.evaluate(el => el.innerText.trim()).catch(() => "");
      if (href) {
        let type = "DOCUMENT";
        if (/invoice|فاتورة/i.test(label + href))    type = "INVOICE";
        else if (/lab|تحليل/i.test(label + href))     type = "LAB_RESULT";
        else if (/xray|أشعة|radiol/i.test(label+href)) type = "XRAY";
        else if (/note|ملاحظ/i.test(label + href))    type = "CLINICAL_NOTES";
        else if (/report|تقرير/i.test(label + href))  type = "MEDICAL_REPORT";
        docs.push({ type, label, href });
      }
    }
  }

  // ── Step 6: Screenshot for audit ─────────────────────────────────────
  const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 50 });

  return {
    bundleId: req.bundleId,
    nationalId: req.nationalId,
    serviceDate: req.serviceDate,
    patientName: extractedName || req.patientName || null,
    mrn,
    oracleFound: patientFound,
    docs,
    docCount: docs.length,
    gateStatus: patientFound && docs.length > 0 ? "GO" : patientFound ? "PARTIAL" : "NO_GO",
    gateReason: patientFound ? docs.length === 0 ? ["NO_DOCS_FOUND"] : [] : ["PATIENT_NOT_FOUND"],
    screenshot: `data:image/jpeg;base64,${screenshot}`,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - t0
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
    batchId, total: eligible.length, processed: results.length,
    go: results.filter(r => r.gateStatus === "GO").length,
    partial: results.filter(r => r.gateStatus === "PARTIAL").length,
    noGo: results.filter(r => r.gateStatus === "NO_GO").length,
    errors: errors.length, errorDetails: errors,
    results, completedAt: new Date().toISOString(), durationMs
  };

  await env.RESULTS.put(`batch:${batchId}`, JSON.stringify(summary), { expirationTtl: 86400 });
  return json(summary);
}

// ─── Get stored result ────────────────────────────────────────────────────────
async function handleGetResult(bundleId, env) {
  const result = await env.RESULTS.get(`result:${bundleId}`, { type: "json" });
  if (!result) return json({ error: "Not found", bundleId }, 404);
  return json(result);
}

// ─── Status check ─────────────────────────────────────────────────────────────
async function handleStatus(env) {
  // Check sessions for all hospitals
  const hospitalSessions = {};
  for (const [hospitalId, config] of Object.entries(HOSPITALS)) {
    const session = await env.SESSIONS.get(`oracle_session_${hospitalId}`, { type: "json" });
    hospitalSessions[hospitalId] = {
      name: config.name,
      baseUrl: config.baseUrl,
      session: session ? "active" : "none",
      sessionCookies: session?.length || 0
    };
  }
  
  return json({
    status:        "ok",
    defaultHospital: env.DEFAULT_HOSPITAL || DEFAULT_HOSPITAL,
    hospitals:     hospitalSessions,
    timestamp:     new Date().toISOString(),
    description:   "COMPLIANCELINC Multi-Hospital Oracle Claim Scanner",
  });
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

    // Find and click the menu item matching itemText
    const urlBefore = page.url();
    const clicked = await page.evaluate((target) => {
      const sidebar = document.getElementById('pt1:r1') || document.body;
      const targetLower = target.toLowerCase();
      // Walk every leaf text node looking for a match
      const all = Array.from(sidebar.querySelectorAll('*'))
        .filter(el => el.children.length === 0);
      for (const el of all) {
        const txt = (el.innerText || el.textContent || '').trim();
        if (txt.toLowerCase() === targetLower || txt.toLowerCase().includes(targetLower)) {
          // Walk up to find the first clickable ancestor
          let anc = el;
          while (anc && anc !== sidebar) {
            if (anc.tagName === 'A' || anc.getAttribute('onclick') || anc.id) {
              anc.click();
              return { found: true, text: txt, clickedId: anc.id, clickedTag: anc.tagName };
            }
            anc = anc.parentElement;
          }
          // fallback: click the span itself
          el.click();
          return { found: true, text: txt, clickedId: el.id, clickedTag: el.tagName };
        }
      }
      return { found: false };
    }, itemText);

    if (!clicked.found) {
      await browser.close();
      return json({ error: `Menu item not found: "${itemText}"`, hospitalId, sessionRestored }, 404);
    }

    // Wait for ADF navigation (no full page reload — URL changes or ADF partialSubmit)
    await sleep(4000);
    const urlAfter  = page.url();
    const pageTitle = await page.title().catch(() => '');

    // Grab all form fields + buttons on the new page
    const pageState = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'))
        .filter(el => el.offsetParent)
        .map(el => ({ tag: el.tagName, id: el.id, name: el.name, type: el.type, placeholder: el.placeholder }))
        .slice(0, 50);
      const buttons = Array.from(document.querySelectorAll('button, a.btn, a[class*="btn"], input[type=submit]'))
        .filter(el => el.offsetParent)
        .map(el => ({ tag: el.tagName, id: el.id, text: (el.innerText || el.value || '').trim().slice(0, 60) }))
        .slice(0, 30);
      const headers = Array.from(document.querySelectorAll('h1, h2, h3, [class*="title"], [class*="header"]'))
        .filter(el => el.offsetParent)
        .map(el => (el.innerText || el.textContent || '').trim().slice(0, 80))
        .filter(t => t.length > 1)
        .slice(0, 15);
      return { inputs, buttons, headers, bodyHtml: document.body.innerHTML.slice(0, 3000) };
    });

    const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });
    await browser.close();

    return json({
      hospital: hospitalId, sessionRestored, menuOpened,
      clickedItem: itemText, clicked,
      urlBefore, urlAfter, pageTitle,
      urlChanged: urlBefore !== urlAfter,
      relativePath: urlAfter.replace(/^https?:\/\/[^/]+/, ''),
      pageState,
      screenshot: `data:image/jpeg;base64,${screenshot}`,
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
