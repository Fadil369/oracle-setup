/**
 * COMPLIANCELINC — oracle-claim-scanner
 * Cloudflare Worker with Browser Rendering binding
 *
 * Replaces oracle-scanner.mjs on INMARCMREJ3.
 * Runs entirely on Cloudflare — no Windows machine, no Playwright, no admin.
 *
 * Deploy: wrangler deploy
 * Trigger: POST https://oracle-claim-scanner.brainsait.workers.dev/scan
 *
 * wrangler.toml required bindings:
 *   [[browser]]
 *   binding = "BROWSER"
 *
 *   [[kv_namespaces]]
 *   binding = "SESSIONS"      # stores Oracle session cookies
 *
 *   [[kv_namespaces]]
 *   binding = "RESULTS"       # stores scan results per bundleId
 *
 *   [vars]
 *   ORACLE_URL = "https://oracle-riyadh.elfadil.com"
 */

import puppeteer from "@cloudflare/puppeteer";

// ── Oracle Oasis+ selectors ────────────────────────────────────────────────
// Captured from live screenshot of oracle-riyadh.elfadil.com/prod/faces/Home
const SEL = {
  username:    'input[id*="username"], input[placeholder*="user" i], #j_username',
  password:    'input[type="password"], #j_password',
  loginBtn:    'input[type="submit"], button[type="submit"], #loginButton, .login-btn',
  searchInput: 'input[id*="search"], input[id*="national"], input[placeholder*="national" i]',
  patientRow:  'tr[id*="patient"], tr.patientRow, tbody tr',
  docLinks:    'a[href*="document"], a[href*="invoice"], a[href*="report"], a[href*="pdf"]',
};

const ORACLE_LOGIN_PATH = "/prod/faces/Home";
const ORACLE_SEARCH_PATH = "/prod/faces/PatientSearch";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    // ── Route: DELETE /session ────────────────────────────────────────────
    if (request.method === "DELETE" && url.pathname === "/session") {
      await env.SESSIONS.delete("oracle_session");
      return json({ cleared: true });
    }

    return json({ error: "Not found", routes: [
      "POST /scan        — scan single claim {nationalId, bundleId, serviceDate}",
      "POST /scan-batch  — scan multiple claims {submissions:[...]}",
      "GET  /result/:id  — get stored result for bundleId",
      "GET  /status      — check session + KV health",
      "DELETE /session   — clear stored session (force re-login)",
    ]}, 404);
  },
};

// ─── Single scan ──────────────────────────────────────────────────────────────
async function handleScan(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { nationalId, bundleId, serviceDate, patientName } = body;
  if (!nationalId || !bundleId) {
    return json({ error: "nationalId and bundleId are required" }, 400);
  }

  const ORACLE_URL = env.ORACLE_URL || "https://oracle-riyadh.elfadil.com";

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page  = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // ── Step 1: Restore or create session ──────────────────────────────────
    const savedCookies = await env.SESSIONS.get("oracle_session", { type: "json" });
    let loggedIn = false;

    if (savedCookies?.length) {
      await page.setCookie(...savedCookies);
      await page.goto(`${ORACLE_URL}${ORACLE_SEARCH_PATH}`, {
        waitUntil: "domcontentloaded", timeout: 30000
      });
      // If we're still on the login page, session expired
      const onLogin = await page.$('input[type="password"]');
      loggedIn = !onLogin;
    }

    if (!loggedIn) {
      // ── Step 2: Login ─────────────────────────────────────────────────────
      if (!env.ORACLE_USER || !env.ORACLE_PASS) {
        await browser.close();
        return json({ error: "ORACLE_USER and ORACLE_PASS secrets required" }, 500);
      }

      await page.goto(`${ORACLE_URL}${ORACLE_LOGIN_PATH}`, {
        waitUntil: "domcontentloaded", timeout: 30000
      });

      await page.waitForSelector(SEL.username, { timeout: 10000 });
      await page.type(SEL.username, env.ORACLE_USER, { delay: 50 });
      await page.type(SEL.password, env.ORACLE_PASS, { delay: 50 });
      await page.click(SEL.loginBtn);
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 });

      // Verify login succeeded
      const stillOnLogin = await page.$('input[type="password"]');
      if (stillOnLogin) {
        await browser.close();
        return json({ error: "Oracle login failed — check ORACLE_USER / ORACLE_PASS secrets" }, 401);
      }

      // Save session cookies (valid ~8h)
      const cookies = await page.cookies();
      await env.SESSIONS.put("oracle_session", JSON.stringify(cookies), {
        expirationTtl: 28800 // 8 hours
      });
    }

    // ── Step 3: Search by national ID ─────────────────────────────────────
    await page.goto(`${ORACLE_URL}${ORACLE_SEARCH_PATH}`, {
      waitUntil: "domcontentloaded", timeout: 30000
    });

    // Try national ID field — Oracle Oasis+ uses different IDs per version
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
        await el.type(nationalId, { delay: 40 });
        await page.keyboard.press("Enter");
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 })
          .catch(() => {}); // Some Oracle versions don't navigate
        searched = true;
        break;
      }
    }

    if (!searched) {
      // Fallback: try patient name search
      const nameInput = await page.$('input[id*="name"], input[placeholder*="Name" i]');
      if (nameInput && patientName) {
        await nameInput.type(patientName.split(" ")[0], { delay: 40 });
        await page.keyboard.press("Enter");
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 })
          .catch(() => {});
      }
    }

    // ── Step 4: Extract patient record ────────────────────────────────────
    const patientRows = await page.$$(SEL.patientRow);
    let mrn = null;
    let patientFound = false;
    let extractedName = null;

    for (const row of patientRows.slice(0, 10)) {
      const text = await row.evaluate(el => el.innerText).catch(() => "");
      if (text.includes(nationalId)) {
        patientFound = true;
        // Extract MRN — typically first numeric column
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
          // Classify
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
    const screenshot = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });

    await browser.close();

    // ── Step 7: Build result ───────────────────────────────────────────────
    const result = {
      bundleId,
      nationalId,
      serviceDate,
      patientName:     extractedName || patientName || null,
      mrn,
      oracleFound:     patientFound,
      sessionRestored: !!savedCookies?.length,
      docs,
      docCount:        docs.length,
      gateStatus:      patientFound && docs.length > 0 ? "GO" : patientFound ? "PARTIAL" : "NO_GO",
      gateReason:      patientFound
                         ? docs.length === 0 ? ["NO_DOCS_FOUND"] : []
                         : ["PATIENT_NOT_FOUND"],
      screenshot:      `data:image/jpeg;base64,${screenshot}`,
      scannedAt:       new Date().toISOString(),
    };

    // Store in KV
    await env.RESULTS.put(`result:${bundleId}`, JSON.stringify(result), {
      expirationTtl: 86400 // 24h
    });

    return json(result);

  } catch (e) {
    try { await browser?.close(); } catch {}
    return json({
      bundleId,
      nationalId,
      error:      e.message,
      gateStatus: "ERROR",
      scannedAt:  new Date().toISOString(),
    }, 500);
  }
}

// ─── Batch scan (processes up to 10 at a time, returns job token) ─────────────
async function handleBatch(request, env) {
  let body;
  try { body = await request.json(); } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { submissions = [] } = body;
  if (!submissions.length) return json({ error: "submissions[] required" }, 400);

  // Filter out blockers
  const eligible = submissions.filter(s =>
    !s.requiresRecode && !s.rejectionCodes?.includes("BE-1-3")
  );

  const batchId = `batch-${Date.now()}`;
  const results = [];
  const errors  = [];

  // Process in sequence (Browser Rendering has concurrency limits)
  for (const sub of eligible.slice(0, 10)) {
    try {
      const resp = await handleScan(new Request(request.url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          nationalId:  sub.nationalId,
          bundleId:    sub.bundleId,
          serviceDate: sub.serviceDate,
          patientName: sub.patientName,
        }),
      }), env);
      const data = await resp.json();
      results.push(data);
    } catch (e) {
      errors.push({ bundleId: sub.bundleId, error: e.message });
    }
  }

  const summary = {
    batchId,
    total:    eligible.length,
    processed: results.length,
    skippedBlockers: submissions.length - eligible.length,
    go:      results.filter(r => r.gateStatus === "GO").length,
    partial: results.filter(r => r.gateStatus === "PARTIAL").length,
    noGo:    results.filter(r => r.gateStatus === "NO_GO").length,
    errors:  errors.length,
    results,
    errors,
    completedAt: new Date().toISOString(),
  };

  await env.RESULTS.put(`batch:${batchId}`, JSON.stringify(summary), {
    expirationTtl: 86400
  });

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
  const session = await env.SESSIONS.get("oracle_session", { type: "json" });
  return json({
    status:        "ok",
    oracle_url:    env.ORACLE_URL || "https://oracle-riyadh.elfadil.com",
    session:       session ? "active" : "none",
    sessionCookies: session?.length || 0,
    timestamp:     new Date().toISOString(),
    description:   "COMPLIANCELINC Oracle Claim Scanner — Cloudflare Worker",
  });
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
