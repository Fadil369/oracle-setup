/**
 * portals.elfadil.com — BrainSAIT Healthcare Control Tower v3.3
 * Cloudflare Worker
 *
 * FIXES from v2:
 *   FIX-1  Madinah shown as "Offline" → now live-probed (it's online)
 *   FIX-2  Khamis subdomain added (oracle-khamis.elfadil.com)
 *   FIX-3  Correct login paths per branch (Madinah/Abha use /Oasis/...)
 *   FIX-4  Health check is now LIVE (probes each tunnel URL on every request)
 *   FIX-5  Jizan: probe timeout set to 8s (it's slow, not dead)
 *   FIX-6  Added /api/health JSON endpoint for COMPLIANCELINC scanner
 *   FIX-7  Added /api/scan/:branch proxy for oracle-claim-scanner Worker
 *   FIX-8  API key auth enforced on /api/control-tower and /api/scan/:branch
 *   FIX-9  CORS preflight (OPTIONS) handler added
 *   FIX-10 Error boundary on dashboard route (503 fallback on crash)
 *   NEW    Cron trigger: health check every 5 min → stored in KV
 *
 * Routes:
 *   GET      /                     → portal dashboard HTML
 *   GET      /api/control-tower/summary → redacted lightweight snapshot (public)
 *   GET      /api/control-tower/details → redacted detailed snapshot (public)
 *   GET      /api/control-tower    → combined snapshot with internals (requires API key)
 *   GET      /api/runbooks         → runbook index for the action queue
 *   GET      /api/runbooks/:id     → runbook JSON detail
 *   GET/POST /api/scan/:branch     → proxy to oracle-claim-scanner Worker (requires X-API-Key)
 *   GET      /api/health           → JSON health of all branches (public)
 *   GET      /api/health/:branch   → JSON health of one branch (public)
 *   GET      /api/branches         → branch config, no passwords (public)
 *   GET      /runbooks/:id         → operator-facing runbook page
 *   GET      /health               → simple 200 OK liveness probe
 *   OPTIONS  /*                    → CORS preflight
 */

// ── MOH external portals (simple HTTP probe, no login required) ──────────────
const MOH_PORTALS = [
  {
    id:       "moh-claims",
    name:     "بوابة المطالبات",
    nameEn:   "MOH Claims Portal",
    desc:     "E-Claims System",
    url:      "https://moh-claims.elfadil.com/",
    provider: "GlobeMed Saudi Arabia",
  },
  {
    id:       "moh-approval",
    name:     "بوابة الموافقات",
    nameEn:   "MOH Approval Portal",
    desc:     "Purchasing Program System",
    url:      "https://moh-approval.elfadil.com/",
    provider: "Ministry of Health",
  },
  {
    id:       "nphies",
    name:     "بوابة نفيس",
    nameEn:   "NPHIES Portal",
    desc:     "National Platform for Health Insurance Exchange & Services",
    url:      "https://nphies.sa/",
    provider: "NPHIES",
  },
];

const CONTROL_TOWER_LAYERS = [
  {
    label: "Layer 1",
    title: "Hospital Systems",
    detail: "Oracle ERP, HIS, LIS, RIS, and branch workflows remain the operational source of truth.",
    outcome: "Capture data where care and billing actually happen.",
  },
  {
    label: "Layer 2",
    title: "Integration Gateway",
    detail: "FHIR APIs, adapters, and secure hospital connectors normalize legacy systems into modern services.",
    outcome: "Create one dependable interface across hospitals.",
  },
  {
    label: "Layer 3",
    title: "BrainSAIT Intelligence",
    detail: "AI agents monitor claims, infrastructure, compliance, and clinical signals in one coordinated fabric.",
    outcome: "Move from visibility to guided action.",
  },
  {
    label: "Layer 4",
    title: "Control Tower Dashboard",
    detail: "Leadership-grade monitoring, alerting, and operational automation live here on portals.elfadil.com.",
    outcome: "Operate the healthcare network as a single system.",
  },
];

const CLAIMS_WORKFLOW = [
  {
    title: "Hospital ERP",
    detail: "Claims, coding, and encounter events originate inside each branch.",
  },
  {
    title: "BrainSAIT Adapter",
    detail: "FHIR and data adapters transform Oracle and hospital payloads into clean APIs.",
  },
  {
    title: "NPHIES Service",
    detail: "Eligibility, submission, tracking, and reconciliation are executed through one claims gateway.",
  },
  {
    title: "Insurance Payer",
    detail: "External insurers process approvals, rejections, and payment decisions.",
  },
  {
    title: "Payment Return",
    detail: "Financial outcomes flow back to the dashboard for action and reporting.",
  },
];

const AGENT_BLUEPRINT = [
  {
    title: "Clinical Agent",
    mission: "Summarize records and flag abnormal patterns across encounters and labs.",
  },
  {
    title: "Claims Agent",
    mission: "Watch NPHIES throughput, detect coding errors, and surface delayed claims before they age.",
  },
  {
    title: "Infrastructure Agent",
    mission: "Monitor tunnel health, latency, and service availability across every hospital.",
  },
  {
    title: "Compliance Agent",
    mission: "Enforce FHIR, NPHIES, and Saudi healthcare policy alignment before issues spread.",
  },
];

const AUTOMATION_PLAYBOOKS = [
  {
    title: "Rejected Claim Recovery",
    detail: "When a payer rejects a claim, notify the hospital team, attach the reason, and queue remediation.",
  },
  {
    title: "Eligibility Pre-check",
    detail: "Run validation before submission so low-quality claims never enter the main flow.",
  },
  {
    title: "Latency Escalation",
    detail: "If a branch slows down or drops, trigger an infrastructure incident path through n8n.",
  },
  {
    title: "Daily Executive Digest",
    detail: "Publish hospital performance, claim movement, and tunnel health into one morning report.",
  },
];

const SECURITY_GUARDRAILS = [
  {
    title: "Zero Trust Access",
    detail: "Cloudflare Zero Trust, SSO, and device verification for every privileged workflow.",
  },
  {
    title: "API Protection",
    detail: "JWT authentication, API keys, rate limiting, and explicit service-to-service boundaries.",
  },
  {
    title: "Private Network Design",
    detail: "mTLS, internal Docker networks, and no direct exposure of private hospital infrastructure.",
  },
];

const DATA_PRODUCTS = [
  {
    title: "Claims Analytics",
    detail: "Approval rates, rejection trends, and insurance delay patterns by hospital and payer.",
  },
  {
    title: "Operational Telemetry",
    detail: "API logs, uptime, tunnel stability, and latency history for the full estate.",
  },
  {
    title: "Patient Statistics",
    detail: "Anonymized healthcare indicators prepared for network-wide benchmarking and intelligence.",
  },
  {
    title: "Hospital Scorecards",
    detail: "Branch-level performance snapshots for leadership, finance, and operations teams.",
  },
];

const CLAIM_REJECTION_CODES = {
  "BE-1-4": { name: "No Prior Authorization", severity: "high" },
  "MN-1-1": { name: "Medical Necessity Not Met", severity: "medium" },
  "CV-1-3": { name: "Coverage or Benefits Limitation", severity: "high" },
  "BE-1-3": { name: "Service Code Not in Contract", severity: "critical" },
  "AD-1-4": { name: "Diagnosis Procedure Mismatch", severity: "medium" },
  "SE-1-6": { name: "Missing Investigation Results", severity: "high" },
  "CV-1-9": { name: "Follow-up Within Restricted Days", severity: "medium" },
  "AD-3-7": { name: "Administrative Coding Error", severity: "high" },
  "AD-2-4": { name: "Incomplete Clinical Documentation", severity: "medium" },
};

const CLAIMS_BASELINE = {
  referenceDate: "2026-03-25",
  batchId: "BAT-2026-NB-00004295-OT",
  payer: "Al Rajhi Takaful",
  provider: "Hayat National Hospital - Riyadh",
  appealDeadline: "2026-04-06",
  totalClaims: 73,
  readyClaims: 63,
  blockedClaims: 10,
  withinWindow: true,
  byPriority: {
    CRITICAL: 3,
    HIGH: 8,
    NORMAL: 52,
    BLOCKER: 10,
  },
  byRejectionCode: {
    "BE-1-4": 43,
    "MN-1-1": 17,
    "CV-1-3": 13,
    "BE-1-3": 10,
    "AD-1-4": 5,
    "CV-1-9": 3,
    "AD-3-7": 2,
    "SE-1-6": 2,
    "AD-2-4": 1,
  },
  totalServiceItems: 189,
  readyServiceItems: 168,
  blockedServiceItems: 21,
  avgItemsPerClaim: 2.589,
  blockerIssue: {
    code: "BLOCKER_RECODE_96092-ERR",
    affectedClaims: 10,
    affectedServiceItems: 21,
    description: "Service code unknown in contract. Claims must be recoded before resubmission.",
  },
  criticalClaims: [
    {
      bundleId: "f5cb6933-d93b-4d98-9cd9-bbfcfceaa8cb",
      patientName: "سوده عبدا ناصر خالد",
      focus: "Chemotherapy prior authorization appeal",
    },
    {
      bundleId: "6e067c99-1029-4dda-8753-8020f7746c5d",
      patientName: "SARA YEHIA ALI TALEB",
      focus: "Biologic therapy prior authorization",
    },
    {
      bundleId: "480e919e-7743-4107-845e-9db81b192b7a",
      patientName: "HAYAT DARWISH A",
      focus: "Cardiology and diabetes medication appeal",
    },
  ],
  blockerClaims: [
    {
      bundleId: "976d0320-625b-4ae0-aede-d7f67859c3dc",
      patientName: "OMAR MAHMOUD DEEB A",
      reason: "96092-ERR recode required",
    },
    {
      bundleId: "9c155a7d-5874-4c3c-817b-61dbd0b318c1",
      patientName: "MALAK SAEED NAJI MUSLEH",
      reason: "96092-ERR recode required",
    },
    {
      bundleId: "478c8637-d1e4-4e9a-852c-754771e5752f",
      patientName: "MOHAMED MOSAD ABDELGAWAD ATIA",
      reason: "96092-ERR recode required",
    },
    {
      bundleId: "df8a2d79-cba6-4f3b-b187-bd6c8f38f939",
      patientName: "AHMED REDA MOHAMED DAKOUS",
      reason: "96092-ERR recode required",
    },
    {
      bundleId: "8d1d7c07-019c-4a5d-a423-6786db95aea9",
      patientName: "REEMA MASRI",
      reason: "96092-ERR recode plus coverage review",
    },
  ],
  latestScanBatch: {
    sourceFile: "scan_results_1774398418316.json",
    totalEligible: 63,
    processed: 0,
    go: 0,
    partial: 0,
    noGo: 0,
    errorCount: 7,
    skippedBlockers: 10,
    completedAt: "2026-03-25T00:26:57.153Z",
    dominantError: "HTTP 404 across chunks 1-7",
  },
};

const RUNBOOKS = {
  "hospital-connectivity": {
    id: "hospital-connectivity",
    title: "Restore hospital portal connectivity",
    owner: "Infrastructure Agent",
    summary: "Bring an unreachable Oracle portal back online by checking the tunnel, WAN path, and backend endpoint.",
    steps: [
      "Validate that the Cloudflare tunnel process is running for the affected branch.",
      "Check whether the hospital WAN path and internal Oracle host are responding.",
      "Confirm the Oracle login path still resolves and has not changed.",
      "Once restored, re-run the branch probe and confirm the portal is reachable from the control tower.",
    ],
    escalation: {
      label: "Escalate to Infrastructure Lead",
      team: "Infrastructure Agent",
      when: "Escalate if the branch remains offline for more than 15 minutes or the Oracle host is unreachable internally.",
    },
  },
  "hospital-latency": {
    id: "hospital-latency",
    title: "Reduce hospital portal latency",
    owner: "Infrastructure Agent",
    summary: "Stabilize a slow but reachable branch before operator throughput or login reliability degrade.",
    steps: [
      "Inspect Cloudflare tunnel throughput and recent reconnect behavior for the branch.",
      "Check Oracle host load, session count, and backend response time.",
      "Validate WAN quality and packet loss from the branch site.",
      "Keep the branch on the watch list until probe latency returns below the control threshold.",
    ],
    escalation: {
      label: "Escalate WAN investigation",
      team: "Infrastructure Agent",
      when: "Escalate if latency remains above the threshold across two refresh cycles or users report portal timeouts.",
    },
  },
  "external-service-availability": {
    id: "external-service-availability",
    title: "Handle external healthcare service outage",
    owner: "Integration Gateway",
    summary: "Protect operators and queues when an external payer or approval service becomes unreachable.",
    steps: [
      "Verify the service is down from the control tower and not only blocked by a single probe method.",
      "Pause any automation path that depends on the unavailable service.",
      "Notify operators to use the fallback manual workflow until the provider recovers.",
      "Resume normal flow only after the external service probe returns stable state.",
    ],
    escalation: {
      label: "Escalate to Integration Gateway",
      team: "Integration Gateway",
      when: "Escalate immediately if the service outage blocks claims approval, payer workflow, or operator access.",
    },
  },
  "external-service-latency": {
    id: "external-service-latency",
    title: "Monitor degraded external service",
    owner: "Integration Gateway",
    summary: "Keep a slow external healthcare service from becoming an unplanned outage.",
    steps: [
      "Confirm operator workflows are still completing despite slow responses.",
      "Reduce concurrency or defer non-urgent background jobs if needed.",
      "Watch the service for one refresh window and compare with hospital-side latency.",
      "Escalate to the service owner if latency continues to rise or operators begin timing out.",
    ],
    escalation: {
      label: "Escalate degradation",
      team: "Integration Gateway",
      when: "Escalate if degraded response persists across multiple cycles or starts affecting claims work.",
    },
  },
  "nphies-availability": {
    id: "nphies-availability",
    title: "Stabilize NPHIES availability",
    owner: "Claims Agent",
    summary: "Protect claim submission and reconciliation when the NPHIES portal is unavailable or degraded.",
    steps: [
      "Confirm whether NPHIES is fully unreachable or only slow from the control tower location.",
      "Pause queued submissions and reconciliation jobs to avoid partial or duplicate actions.",
      "Notify claims operators to preserve appeal-ready bundles until the platform stabilizes.",
      "Resume submissions only after NPHIES returns to a stable probe state and manual validation succeeds.",
    ],
    escalation: {
      label: "Escalate NPHIES outage",
      team: "Claims Agent",
      when: "Escalate immediately if NPHIES downtime blocks time-sensitive appeals or payment reconciliation.",
    },
  },
  "claims-recode-96092": {
    id: "claims-recode-96092",
    title: "Clear 96092-ERR blocker claims",
    owner: "Claims Coding",
    summary: "Resolve BE-1-3 service-code blockers so blocked claims can move back into the appeal-ready queue.",
    steps: [
      "Open the original invoice and supporting clinical documentation for the blocked bundle.",
      "Confirm the contracted SBS or NPHIES code against the provider-payer contract schedule.",
      "Correct the service code in Oracle and regenerate the claim or appeal package.",
      "Re-run dry-run validation before re-adding the claim to the ready-for-submission queue.",
    ],
    escalation: {
      label: "Escalate to Claims Coding Lead",
      team: "Claims Coding",
      when: "Escalate if the correct contracted code cannot be identified within two hours or contract mapping is disputed.",
    },
  },
  "claims-deadline-submission": {
    id: "claims-deadline-submission",
    title: "Move ready claims before appeal deadline",
    owner: "Revenue Recovery",
    summary: "Use the remaining appeal window to move ready claims into NPHIES or Etimad submission flow before value is lost.",
    steps: [
      "Sort ready claims by CRITICAL, HIGH, then NORMAL priority.",
      "Validate attachments and appeal letters are complete for each ready claim.",
      "Submit ready bundles through the NPHIES communication path and track confirmations.",
      "Escalate any claims still not submitted as the deadline approaches.",
    ],
    escalation: {
      label: "Escalate deadline risk",
      team: "Revenue Recovery",
      when: "Escalate if any CRITICAL or HIGH claims remain unsubmitted inside the final seven days of the appeal window.",
    },
  },
  "claims-prior-auth": {
    id: "claims-prior-auth",
    title: "Work the prior authorization appeal queue",
    owner: "Claims Agent",
    summary: "Prioritize BE-1-4 and chemo or biologic cases that need authorization evidence before resubmission.",
    steps: [
      "Group claims with BE-1-4 and identify chemotherapy, biologic, or specialist medication cases first.",
      "Confirm prior authorization documents, oncology or specialty notes, and treatment plans are attached.",
      "Rebuild the appeal packet and mark the claim ready only after documentation is complete.",
      "Track unresolved prior-auth cases separately so they do not miss the appeal deadline.",
    ],
    escalation: {
      label: "Escalate prior-auth backlog",
      team: "Claims Agent",
      when: "Escalate if critical therapy cases remain unresolved or authorization evidence is missing for more than one day.",
    },
  },
  "scanner-http-404": {
    id: "scanner-http-404",
    title: "Repair Oracle scan batch HTTP 404 failures",
    owner: "Integration Gateway",
    summary: "Resolve scanner batch failures when the Oracle scanner returns HTTP 404 and processes zero eligible claims.",
    steps: [
      "Verify the scanner worker route, deployment, and expected /scan-batch path are live.",
      "Confirm the portal and scanner share the correct base URL and API key configuration.",
      "Run a single-claim scan test before re-running the full batch.",
      "Only reopen the batch workflow after the scanner returns processed claims instead of route errors.",
    ],
    escalation: {
      label: "Escalate scanner failure",
      team: "Integration Gateway",
      when: "Escalate immediately if one full eligible batch returns zero processed claims or repeated HTTP 404 chunk failures.",
    },
  },
};

// ── Branch registry (single source of truth) ───────────────────────────────
const BRANCHES = [
  {
    id:          "riyadh",
    name:        "الرياض",
    nameEn:      "Riyadh Hospital",
    subdomain:   "oracle-riyadh.elfadil.com",
    backend:     "https://128.1.1.185",
    loginPath:   "/prod/faces/Home",
    tls:         true,
    probeTimeout: 8000,
    region:      "Riyadh",
  },
  {
    id:          "madinah",
    name:        "المدينة المنورة",
    nameEn:      "Madinah Hospital",
    subdomain:   "oracle-madinah.elfadil.com",
    backend:     "http://172.25.11.26",
    loginPath:   "/Oasis/faces/Login.jsf",   // FIX-1+3: was wrong path + wrong status
    tls:         false,
    probeTimeout: 8000,
    region:      "Madinah",
  },
  {
    id:          "unaizah",
    name:        "عنيزة",
    nameEn:      "Unaizah Hospital",
    subdomain:   "oracle-unaizah.elfadil.com",
    backend:     "http://10.0.100.105",
    loginPath:   "/prod/faces/Login.jsf",
    tls:         false,
    probeTimeout: 8000,
    region:      "Qassim",
  },
  {
    id:          "khamis",
    name:        "خميس مشيط",
    nameEn:      "Khamis Mushait Hospital",
    subdomain:   "oracle-khamis.elfadil.com",  // FIX-2: dedicated subdomain
    backend:     "http://172.30.0.77",
    loginPath:   "/prod/faces/Login.jsf",
    tls:         false,
    probeTimeout: 8000,
    region:      "Asir",
  },
  {
    id:          "jizan",
    name:        "جازان",
    nameEn:      "Jizan Hospital",
    subdomain:   "oracle-jizan.elfadil.com",
    backend:     "http://172.17.4.84",
    loginPath:   "/prod/faces/Login.jsf",
    tls:         false,
    probeTimeout: 12000,  // FIX-5: Jizan is slow — 12s probe timeout
    region:      "Jizan",
  },
  {
    id:          "abha",
    name:        "أبها",
    nameEn:      "Abha Hospital",
    subdomain:   "oracle-abha.elfadil.com",
    backend:     "http://172.19.1.1",
    loginPath:   "/Oasis/faces/Home",   // FIX-3: Abha uses /Oasis/faces/Home
    tls:         false,
    probeTimeout: 8000,
    region:      "Asir",
  },
];

const AUTO_REFRESH_INTERVAL_MS = 60_000;
const BRANCH_WATCH_THRESHOLD_MS = 5_000;
const EXTERNAL_WATCH_THRESHOLD_MS = 3_500;
const ACTION_SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, info: 3 };

// ── Health probes ────────────────────────────────────────────────────────────
async function probeUrl(url, timeoutMs, userAgent) {
  const start = Date.now();

  const runRequest = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": userAgent },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await runRequest("HEAD");
    if (res.status === 405 || res.status === 501) {
      res = await runRequest("GET");
    }

    return {
      online: res.status < 500,
      status: res.status,
      latency: Date.now() - start,
      url,
      probed: new Date().toISOString(),
    };
  } catch (error) {
    return {
      online: false,
      status: 0,
      latency: Date.now() - start,
      url,
      error: error.name === "AbortError" ? "timeout" : error.message,
      probed: new Date().toISOString(),
    };
  }
}

async function probeBranch(branch) {
  const url = `https://${branch.subdomain}${branch.loginPath}`;
  return {
    id: branch.id,
    ...(await probeUrl(url, branch.probeTimeout, "BrainSAIT-HealthProbe/3.2")),
  };
}

async function probeExternalPortal(portal) {
  return {
    id: portal.id,
    ...(await probeUrl(portal.url, portal.probeTimeout || 9_000, "BrainSAIT-ExternalProbe/3.2")),
  };
}

async function probeAllBranches() {
  const results = await Promise.all(BRANCHES.map(probeBranch));
  return Object.fromEntries(results.map(result => [result.id, result]));
}

async function probeAllExternalPortals() {
  const results = await Promise.all(MOH_PORTALS.map(probeExternalPortal));
  return Object.fromEntries(results.map(result => [result.id, result]));
}

function evaluateProbe(probe, watchThresholdMs, options = {}) {
  if (!probe?.online) {
    return {
      tone: "critical",
      label: probe?.error === "timeout" ? "Timed Out" : (options.offlineLabel || "Offline"),
      signal: probe?.error === "timeout"
        ? (options.timeoutSignal || "Probe exceeded the response threshold.")
        : (options.offlineSignal || "Connectivity investigation required."),
    };
  }

  if ((probe.latency || 0) > watchThresholdMs) {
    return {
      tone: "watch",
      label: options.watchLabel || "Degraded",
      signal: options.watchSignal || "The service is reachable but slower than the target operating threshold.",
    };
  }

  return {
    tone: "stable",
    label: options.stableLabel || "Operational",
    signal: options.stableSignal || "The service is healthy for operators.",
  };
}

function summarizeServices(items) {
  const onlineItems = items.filter(item => item.online);
  return {
    total: items.length,
    online: onlineItems.length,
    offline: items.filter(item => !item.online).length,
    degraded: items.filter(item => item.tone === "watch").length,
    critical: items.filter(item => item.tone === "critical").length,
    availabilityPct: items.length ? Math.round((onlineItems.length / items.length) * 100) : 0,
    avgLatencyMs: onlineItems.length
      ? Math.round(onlineItems.reduce((sum, item) => sum + (item.latency || 0), 0) / onlineItems.length)
      : null,
  };
}

function enrichHospital(branch, probe) {
  const evaluation = evaluateProbe(probe, BRANCH_WATCH_THRESHOLD_MS, {
    stableLabel: "Operational",
    watchLabel: "High Latency",
    stableSignal: "Stable for operator access.",
    watchSignal: "Live but slower than expected for daily operations.",
    offlineSignal: "Operators cannot reach the Oracle portal.",
    timeoutSignal: "The tunnel responded too slowly for the branch threshold.",
  });

  return {
    id: branch.id,
    kind: "hospital",
    name: branch.name,
    nameEn: branch.nameEn,
    region: branch.region,
    subdomain: branch.subdomain,
    backend: branch.backend,
    backendHost: branch.backend.replace(/^https?:\/\//, ""),
    loginPath: branch.loginPath,
    url: `https://${branch.subdomain}${branch.loginPath}`,
    online: !!probe?.online,
    statusCode: probe?.status || 0,
    latency: probe?.latency ?? null,
    error: probe?.error || null,
    probedAt: probe?.probed || null,
    tone: evaluation.tone,
    healthLabel: evaluation.label,
    signal: evaluation.signal,
  };
}

function redactHospitalInternals(hospital) {
  const safe = { ...hospital };
  delete safe.backend;
  delete safe.backendHost;
  return safe;
}

function redactActionInternals(action) {
  const scrubbedRecommendation = String(action.recommendation || "")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[internal-origin]");
  return {
    ...action,
    recommendation: scrubbedRecommendation,
  };
}

function enrichExternalService(portal, probe) {
  const evaluation = evaluateProbe(probe, EXTERNAL_WATCH_THRESHOLD_MS, {
    stableLabel: "Reachable",
    watchLabel: "Degraded",
    stableSignal: "External service is reachable for operators.",
    watchSignal: "External service is reachable but slower than expected.",
    offlineSignal: "External service is unavailable from the control tower.",
    timeoutSignal: "External service exceeded the monitoring threshold.",
  });

  return {
    id: portal.id,
    kind: "external",
    name: portal.name,
    nameEn: portal.nameEn,
    provider: portal.provider,
    description: portal.desc,
    url: portal.url,
    online: !!probe?.online,
    statusCode: probe?.status || 0,
    latency: probe?.latency ?? null,
    error: probe?.error || null,
    probedAt: probe?.probed || null,
    tone: evaluation.tone,
    healthLabel: evaluation.label,
    signal: evaluation.signal,
  };
}

function normalizeUrl(baseUrl, path = "") {
  return `${String(baseUrl || "").replace(/\/+$/, "")}${path}`;
}

function computeDaysRemaining(appealDeadline) {
  if (!appealDeadline) return null;
  const deadline = new Date(appealDeadline);
  const now = new Date();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / millisecondsPerDay));
}

function buildTopReasons(byRejectionCode) {
  return Object.entries(byRejectionCode || {})
    .map(([code, count]) => ({
      code,
      count,
      name: CLAIM_REJECTION_CODES[code]?.name || code,
      severity: CLAIM_REJECTION_CODES[code]?.severity || "medium",
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function buildClaimsWatchlistIds() {
  return Array.from(new Set([
    ...CLAIMS_BASELINE.criticalClaims.map((claim) => claim.bundleId),
    ...CLAIMS_BASELINE.blockerClaims.map((claim) => claim.bundleId),
  ]));
}

function mergeLiveClaimState(referenceClaims, watchlistEntries) {
  const watchlistMap = new Map((watchlistEntries || []).map((entry) => [entry.bundleId, entry]));
  return referenceClaims.map((claim) => {
    const liveEntry = watchlistMap.get(claim.bundleId);
    return {
      ...claim,
      liveStatus: liveEntry?.gateStatus || "UNSEEN",
      liveStatusLabel: liveEntry?.available ? (liveEntry.gateStatus || "UNSEEN") : "Awaiting live scan",
      liveScannedAt: liveEntry?.scannedAt || null,
      liveOutcome: liveEntry?.transactionOutcome || null,
      liveReason: Array.isArray(liveEntry?.gateReason) ? liveEntry.gateReason.join(" | ") : null,
      liveAvailable: !!liveEntry?.available,
    };
  });
}

function buildServiceSignal(service) {
  return service
    ? {
        online: !!service.online,
        tone: service.tone,
        label: service.healthLabel,
        latency: service.latency,
      }
    : {
        online: false,
        tone: "critical",
        label: "Unavailable",
        latency: null,
      };
}

async function fetchScannerClaimsFeed(env) {
  if (!env?.SCANNER_SERVICE && !env?.SCANNER_URL) {
    return {
      available: false,
      source: null,
      error: "scanner_url_not_configured",
    };
  }

  const watchQuery = buildClaimsWatchlistIds().join(",");
  const scannerUrl = new URL(normalizeUrl(env.SCANNER_URL || "https://oracle-scanner.elfadil.com", "/control-tower/claims"));
  scannerUrl.searchParams.set("watch", watchQuery);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = env.SCANNER_SERVICE
      ? await env.SCANNER_SERVICE.fetch(`https://scanner.internal/control-tower/claims?watch=${encodeURIComponent(watchQuery)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        })
      : await fetch(scannerUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    return {
      available: true,
      source: env.SCANNER_SERVICE ? "service-binding:oracle-claim-scanner" : scannerUrl.toString(),
      statusCode: response.status,
      metrics: payload.metrics || null,
      latestBatch: payload.latestBatch || null,
      scannerStatus: payload.scannerStatus || null,
      watchlist: payload.watchlist || [],
    };
  } catch (error) {
    if (env.SCANNER_SERVICE && env.SCANNER_URL) {
      try {
        const fallbackResponse = await fetch(scannerUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!fallbackResponse.ok) {
          return {
            available: false,
            source: scannerUrl.toString(),
            statusCode: fallbackResponse.status,
            error: `HTTP ${fallbackResponse.status}`,
          };
        }

        const payload = await fallbackResponse.json();
        return {
          available: true,
          source: scannerUrl.toString(),
          statusCode: fallbackResponse.status,
          metrics: payload.metrics || null,
          latestBatch: payload.latestBatch || null,
          scannerStatus: payload.scannerStatus || null,
          watchlist: payload.watchlist || [],
        };
      } catch (fallbackError) {
        return {
          available: false,
          source: scannerUrl.toString(),
          error: fallbackError.name === "AbortError" ? "timeout" : fallbackError.message,
        };
      }
    }

    return {
      available: false,
      source: env.SCANNER_SERVICE ? "service-binding:oracle-claim-scanner" : scannerUrl.toString(),
      error: error.name === "AbortError" ? "timeout" : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildClaimsSnapshot(scannerFeed, externalHealth) {
  const livePortfolio = scannerFeed?.latestBatch?.portfolio || null;
  const batchId = livePortfolio?.batchId || scannerFeed?.latestBatch?.sourceBatchId || CLAIMS_BASELINE.batchId;
  const appealDeadline = livePortfolio?.appealDeadline || CLAIMS_BASELINE.appealDeadline;
  const byPriority = livePortfolio?.byPriority || CLAIMS_BASELINE.byPriority;
  const byRejectionCode = livePortfolio?.byRejectionCode || CLAIMS_BASELINE.byRejectionCode;
  const totalClaims = livePortfolio?.totalClaims ?? CLAIMS_BASELINE.totalClaims;
  const readyClaims = livePortfolio?.readyClaims ?? CLAIMS_BASELINE.readyClaims;
  const blockedClaims = livePortfolio?.blockedClaims ?? CLAIMS_BASELINE.blockedClaims;
  const totalServiceItems = livePortfolio?.totalServiceItems ?? CLAIMS_BASELINE.totalServiceItems;
  const readyServiceItems = livePortfolio?.readyServiceItems ?? CLAIMS_BASELINE.readyServiceItems;
  const blockedServiceItems = livePortfolio?.blockedServiceItems ?? CLAIMS_BASELINE.blockedServiceItems;
  const criticalClaims = mergeLiveClaimState(
    livePortfolio?.criticalClaims?.length ? livePortfolio.criticalClaims : CLAIMS_BASELINE.criticalClaims,
    scannerFeed?.watchlist
  );
  const blockerClaims = mergeLiveClaimState(
    livePortfolio?.blockerClaims?.length ? livePortfolio.blockerClaims : CLAIMS_BASELINE.blockerClaims,
    scannerFeed?.watchlist
  );
  const daysRemaining = computeDaysRemaining(appealDeadline);
  const nphiesSignal = buildServiceSignal(externalHealth?.nphies);
  const approvalSignal = buildServiceSignal(externalHealth?.["moh-approval"]);
  const claimsPortalSignal = buildServiceSignal(externalHealth?.["moh-claims"]);
  const latestBatch = scannerFeed?.latestBatch
    ? {
        sourceBatchId: scannerFeed.latestBatch.sourceBatchId || batchId,
        totalEligible: scannerFeed.latestBatch.totalEligible || readyClaims,
        processed: scannerFeed.latestBatch.processed || 0,
        go: scannerFeed.latestBatch.go || 0,
        partial: scannerFeed.latestBatch.partial || 0,
        noGo: scannerFeed.latestBatch.noGo || 0,
        errorCount: scannerFeed.latestBatch.errorCount || 0,
        completedAt: scannerFeed.latestBatch.completedAt || null,
        dominantError: scannerFeed.latestBatch.dominantError || "No batch errors recorded",
      }
    : CLAIMS_BASELINE.latestScanBatch;
  const sourceMode = livePortfolio
    ? "live-batch"
    : (scannerFeed?.available ? "watchlist-live" : "fallback-reference");
  const liveWatchHits = (scannerFeed?.watchlist || []).filter((entry) => entry.available).length;
  const sourceSummary = sourceMode === "live-batch"
    ? `Live scanner batch ${batchId} from ${scannerFeed.latestBatch?.completedAt || "latest KV state"}.`
    : sourceMode === "watchlist-live"
      ? `Live scanner watchlist is active for ${liveWatchHits} watched claims; portfolio totals still use the current reference batch.`
      : "Scanner claims feed is unavailable. Showing the current reference batch until the upstream recovers.";

  return {
    batchId,
    payer: livePortfolio?.payer || CLAIMS_BASELINE.payer,
    provider: livePortfolio?.provider || CLAIMS_BASELINE.provider,
    appealDeadline,
    withinWindow: typeof livePortfolio?.withinWindow === "boolean" ? livePortfolio.withinWindow : CLAIMS_BASELINE.withinWindow,
    daysRemaining,
    sourceMode,
    sourceSummary,
    summary: {
      totalClaims,
      readyClaims,
      blockedClaims,
      readyPct: totalClaims ? Math.round((readyClaims / totalClaims) * 100) : 0,
      blockedPct: totalClaims ? Math.round((blockedClaims / totalClaims) * 100) : 0,
    },
    approvals: {
      priorAuthClaims: byRejectionCode["BE-1-4"] || 0,
      criticalTherapyClaims: byPriority.CRITICAL || 0,
      coverageReviewClaims: byRejectionCode["CV-1-3"] || 0,
      medicalNecessityClaims: byRejectionCode["MN-1-1"] || 0,
    },
    rejections: {
      topReasons: buildTopReasons(byRejectionCode),
      blockerIssue: livePortfolio?.blockerIssue || CLAIMS_BASELINE.blockerIssue,
      blockerClaims,
    },
    payments: {
      disputedServiceItems: totalServiceItems,
      recoverableServiceItems: readyServiceItems,
      blockedServiceItems,
      recoverablePct: totalServiceItems ? Math.round((readyServiceItems / totalServiceItems) * 100) : 0,
      readyRecoveryClaims: readyClaims,
      blockedRecoveryClaims: blockedClaims,
      amountMetricsAvailable: false,
      note: sourceMode === "live-batch"
        ? "Live payment recovery volume is derived from the latest scanner batch payload. SAR amount fields are still not available upstream."
        : "No SAR amount fields exist in the live upstream feed yet, so payment recovery is tracked by claim and service-item volume.",
    },
    scanner: {
      latestBatch,
      liveSystem: scannerFeed?.available
        ? {
            available: true,
            totalScans: scannerFeed.metrics?.totalScans || 0,
            successfulScans: scannerFeed.metrics?.successfulScans || 0,
            failedScans: scannerFeed.metrics?.failedScans || 0,
            avgDurationMs: scannerFeed.metrics?.avgDurationMs || 0,
          }
        : {
            available: false,
            totalScans: 0,
            successfulScans: 0,
            failedScans: 0,
            avgDurationMs: 0,
          },
      watchlist: scannerFeed?.watchlist || [],
      hospitalSessions: scannerFeed?.scannerStatus?.hospitals || {},
    },
    upstreams: {
      nphies: nphiesSignal,
      mohApproval: approvalSignal,
      mohClaims: claimsPortalSignal,
    },
    byPriority,
    criticalClaims,
  };
}

function buildRunbookIndex() {
  return Object.values(RUNBOOKS).map((runbook) => ({
    id: runbook.id,
    title: runbook.title,
    owner: runbook.owner,
    summary: runbook.summary,
    href: `/runbooks/${runbook.id}`,
    escalationHref: `/runbooks/${runbook.id}#escalation`,
  }));
}

function attachRunbook(action, runbookId) {
  const runbook = RUNBOOKS[runbookId];
  if (!runbook) return action;

  return {
    ...action,
    runbookId,
    runbookTitle: runbook.title,
    runbookHref: `/runbooks/${runbookId}`,
    runbookSummary: runbook.summary,
    escalationLabel: runbook.escalation.label,
    escalationHref: `/runbooks/${runbookId}#escalation`,
  };
}

function buildPriorityActions(hospitals, externalServices, claims) {
  const actions = [];

  for (const hospital of hospitals) {
    if (hospital.tone === "critical") {
      actions.push(attachRunbook({
        id: `hospital-${hospital.id}-restore`,
        severity: "critical",
        owner: "Infrastructure Agent",
        target: hospital.nameEn,
        scope: "Hospital",
        title: `Restore ${hospital.nameEn} connectivity`,
        description: `${hospital.nameEn} is ${hospital.healthLabel.toLowerCase()} at ${hospital.subdomain}. Operators cannot reach the Oracle portal.`,
        recommendation: "Check Cloudflare tunnel health, branch network path, and the mapped Oracle origin endpoint.",
        href: hospital.url,
        hrefLabel: "Open branch portal",
        tone: hospital.tone,
        latency: hospital.latency,
      }, "hospital-connectivity"));
    } else if (hospital.tone === "watch") {
      actions.push(attachRunbook({
        id: `hospital-${hospital.id}-latency`,
        severity: "high",
        owner: "Infrastructure Agent",
        target: hospital.nameEn,
        scope: "Hospital",
        title: `Reduce latency for ${hospital.nameEn}`,
        description: `${hospital.nameEn} is online but responding in ${hospital.latency} ms, above the expected operating threshold.`,
        recommendation: "Review tunnel throughput, WAN quality, and Oracle backend saturation before users feel the slowdown.",
        href: hospital.url,
        hrefLabel: "Open branch portal",
        tone: hospital.tone,
        latency: hospital.latency,
      }, "hospital-latency"));
    }
  }

  for (const service of externalServices) {
    if (service.tone === "critical") {
      const isNphies = service.id === "nphies";
      actions.push(attachRunbook({
        id: `external-${service.id}-availability`,
        severity: isNphies ? "critical" : "high",
        owner: isNphies ? "Claims Agent" : "Integration Gateway",
        target: service.nameEn,
        scope: "External Service",
        title: `Investigate ${service.nameEn} availability`,
        description: `${service.nameEn} is ${service.healthLabel.toLowerCase()} from the control tower and may affect claims flow or operator access.`,
        recommendation: isNphies
          ? "Validate NPHIES connectivity immediately before submission and reconciliation queues begin to grow."
          : "Validate provider reachability and prepare an operator fallback path while the service recovers.",
        href: service.url,
        hrefLabel: "Open external service",
        tone: service.tone,
        latency: service.latency,
      }, isNphies ? "nphies-availability" : "external-service-availability"));
    } else if (service.tone === "watch") {
      actions.push(attachRunbook({
        id: `external-${service.id}-latency`,
        severity: "medium",
        owner: service.id === "nphies" ? "Claims Agent" : "Integration Gateway",
        target: service.nameEn,
        scope: "External Service",
        title: `Watch degraded response on ${service.nameEn}`,
        description: `${service.nameEn} is reachable but slower than expected at ${service.latency} ms.`,
        recommendation: "Track the service closely and verify that staff can continue their claims or approval workflow without delay.",
        href: service.url,
        hrefLabel: "Open external service",
        tone: service.tone,
        latency: service.latency,
      }, service.id === "nphies" ? "nphies-availability" : "external-service-latency"));
    }
  }

  if (claims.summary.blockedClaims > 0) {
    actions.push(attachRunbook({
      id: "claims-blocker-recode",
      severity: "critical",
      owner: "Claims Coding",
      target: claims.batchId,
      scope: "Claims",
      title: `Clear ${claims.summary.blockedClaims} blocker claims before resubmission`,
      description: `${claims.summary.blockedClaims} claims and ${claims.payments.blockedServiceItems} disputed service items are blocked by ${claims.rejections.blockerIssue.code}.`,
      recommendation: "Recode blocked bundles first so they can re-enter the ready-for-submission queue before the appeal window closes.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "critical",
      latency: null,
    }, "claims-recode-96092"));
  }

  if (claims.summary.readyClaims > 0 && claims.daysRemaining <= 14) {
    actions.push(attachRunbook({
      id: "claims-deadline-window",
      severity: "high",
      owner: "Revenue Recovery",
      target: claims.batchId,
      scope: "Claims",
      title: `Move ${claims.summary.readyClaims} ready claims inside the ${claims.daysRemaining}-day window`,
      description: `${claims.summary.readyClaims} claims are ready for appeal submission, covering ${claims.payments.recoverableServiceItems} disputed service items still recoverable in the current window.`,
      recommendation: "Push CRITICAL and HIGH bundles through NPHIES and Etimad communication paths before time-at-risk converts into lost recovery.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "watch",
      latency: null,
    }, "claims-deadline-submission"));
  }

  if (claims.approvals.priorAuthClaims > 0) {
    actions.push(attachRunbook({
      id: "claims-prior-auth-backlog",
      severity: claims.approvals.criticalTherapyClaims > 0 ? "high" : "medium",
      owner: "Claims Agent",
      target: claims.batchId,
      scope: "Approvals",
      title: `Resolve prior-authorization backlog across ${claims.approvals.priorAuthClaims} claims`,
      description: `${claims.approvals.criticalTherapyClaims} critical therapy bundles and ${claims.approvals.coverageReviewClaims} coverage-review bundles still depend on approval-quality documentation.`,
      recommendation: "Prioritize chemo, biologic, and specialist medication bundles so missing authorization evidence does not stall payment recovery.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "watch",
      latency: null,
    }, "claims-prior-auth"));
  }

  if ((claims.scanner.latestBatch.errorCount || 0) > 0) {
    actions.push(attachRunbook({
      id: "scanner-batch-errors",
      severity: "high",
      owner: "Integration Gateway",
      target: claims.batchId,
      scope: "Scanner",
      title: `Repair scanner batch failure after ${claims.scanner.latestBatch.errorCount} route errors`,
      description: `The latest scan batch processed ${claims.scanner.latestBatch.processed} of ${claims.scanner.latestBatch.totalEligible} eligible claims and failed with ${claims.scanner.latestBatch.dominantError}.`,
      recommendation: "Fix the worker route path or scanner deployment first, then rerun a single scan before reopening the batch workflow.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "critical",
      latency: null,
    }, "scanner-http-404"));
  }

  if (!actions.length) {
    actions.push(attachRunbook({
      id: "all-clear",
      severity: "info",
      owner: "Control Tower",
      target: "Network",
      scope: "Operations",
      title: "No urgent actions in queue",
      description: "All monitored hospitals and external healthcare services are operating within the expected thresholds.",
      recommendation: "Continue automatic refresh and use this window to validate new integrations and claims telemetry.",
      href: "/api/control-tower",
      hrefLabel: "Open control-tower API",
      tone: "stable",
      latency: null,
    }, "claims-deadline-submission"));
  }

  return actions
    .sort((left, right) => {
      const severityDiff = ACTION_SEVERITY_ORDER[left.severity] - ACTION_SEVERITY_ORDER[right.severity];
      if (severityDiff !== 0) return severityDiff;
      return (right.latency || 0) - (left.latency || 0);
    })
    .slice(0, 8)
    .map((action, index) => ({ ...action, rank: index + 1 }));
}

function summarizeActions(actions) {
  const actionable = actions.filter(action => action.severity !== "info");
  return {
    total: actionable.length,
    critical: actions.filter(action => action.severity === "critical").length,
    high: actions.filter(action => action.severity === "high").length,
    medium: actions.filter(action => action.severity === "medium").length,
    info: actions.filter(action => action.severity === "info").length,
  };
}

function createControlTowerSnapshot(branchHealth, externalHealth, claims, options = {}) {
  const includeInternals = options.includeInternals === true;
  const includeDetails = options.includeDetails !== false;
  const hospitals = BRANCHES.map(branch => enrichHospital(branch, branchHealth[branch.id]));
  const externalServices = MOH_PORTALS.map(portal => enrichExternalService(portal, externalHealth[portal.id]));
  const priorityActions = buildPriorityActions(hospitals, externalServices, claims);
  const hospitalSummary = summarizeServices(hospitals);
  const externalSummary = summarizeServices(externalServices);
  const allResponsive = [...hospitals, ...externalServices].filter(item => item.online);

  const snapshot = {
    timestamp: new Date().toISOString(),
    meta: {
      refreshIntervalMs: AUTO_REFRESH_INTERVAL_MS,
    },
    summary: {
      hospitals: hospitalSummary,
      externalServices: externalSummary,
      claims: claims.summary,
      actions: summarizeActions(priorityActions),
      overall: {
        monitoredEndpoints: hospitals.length + externalServices.length,
        avgLatencyMs: allResponsive.length
          ? Math.round(allResponsive.reduce((sum, item) => sum + (item.latency || 0), 0) / allResponsive.length)
          : null,
      },
    },
    hospitals,
    externalServices,
    claims,
    runbooks: buildRunbookIndex(),
    priorityActions,
  };

  if (!includeInternals) {
    snapshot.hospitals = snapshot.hospitals.map(redactHospitalInternals);
    snapshot.priorityActions = snapshot.priorityActions.map(redactActionInternals);
  }

  if (!includeDetails) {
    return {
      timestamp: snapshot.timestamp,
      meta: snapshot.meta,
      summary: snapshot.summary,
      hospitals: snapshot.hospitals.map((hospital) => ({
        id: hospital.id,
        kind: hospital.kind,
        name: hospital.name,
        nameEn: hospital.nameEn,
        region: hospital.region,
        subdomain: hospital.subdomain,
        loginPath: hospital.loginPath,
        url: hospital.url,
        online: hospital.online,
        statusCode: hospital.statusCode,
        latency: hospital.latency,
        error: hospital.error,
        probedAt: hospital.probedAt,
        tone: hospital.tone,
        healthLabel: hospital.healthLabel,
        signal: hospital.signal,
      })),
      externalServices: snapshot.externalServices,
      priorityActions: snapshot.priorityActions.map((action) => ({
        id: action.id,
        severity: action.severity,
        owner: action.owner,
        target: action.target,
        scope: action.scope,
        title: action.title,
        description: action.description,
        tone: action.tone,
        rank: action.rank,
        latency: action.latency,
      })),
    };
  }

  return snapshot;
}

async function buildControlTowerSnapshot(env, options = {}) {
  const [branchHealth, externalHealth, scannerFeed] = await Promise.all([
    probeAllBranches(),
    probeAllExternalPortals(),
    fetchScannerClaimsFeed(env),
  ]);

  const claims = buildClaimsSnapshot(scannerFeed, externalHealth);
  return createControlTowerSnapshot(branchHealth, externalHealth, claims, options);
}

// ── API key guard helper ──────────────────────────────────────────────────────
function requireApiKey(request, env, url) {
  const allowUnauthenticated = env.ALLOW_UNAUTHENTICATED === "1" || env.ALLOW_UNAUTHENTICATED === "true";
  if (!env.API_KEY && !allowUnauthenticated) {
    return json({ error: "Server misconfigured: API_KEY is required" }, 503);
  }
  if (!env.API_KEY) return null;

  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const provided =
    bearer ||
    request.headers.get("X-API-Key") ||
    request.headers.get("x-api-key") ||
    url.searchParams.get("api_key") ||
    url.searchParams.get("key");

  if (provided !== env.API_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

// ── Main fetch handler ────────────────────────────────────────────────────────
export default {
  // ── HTTP requests ─────────────────────────────────────────────────────────
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Simple liveness
    if (path === "/health") {
      return new Response("ok", { status: 200 });
    }

    if (path === "/api/runbooks") {
      return json(buildRunbookIndex());
    }

    if (path.startsWith("/api/runbooks/")) {
      const runbookId = path.split("/api/runbooks/")[1];
      const runbook = RUNBOOKS[runbookId];
      if (!runbook) return json({ error: `Unknown runbook: ${runbookId}` }, 404);
      return json({
        ...runbook,
        href: `/runbooks/${runbook.id}`,
        escalationHref: `/runbooks/${runbook.id}#escalation`,
      });
    }

    if (path.startsWith("/runbooks/")) {
      const runbookId = path.split("/runbooks/")[1];
      const runbook = RUNBOOKS[runbookId];
      if (!runbook) {
        return new Response("Runbook not found", { status: 404 });
      }
      return new Response(renderRunbookPage(runbook), {
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (path === "/api/control-tower/summary") {
      const summarySnapshot = await buildControlTowerSnapshot(env, {
        includeInternals: false,
        includeDetails: false,
      });
      return json(summarySnapshot);
    }

    if (path === "/api/control-tower/details") {
      const detailSnapshot = await buildControlTowerSnapshot(env, {
        includeInternals: false,
        includeDetails: true,
      });
      return json({
        timestamp: detailSnapshot.timestamp,
        meta: detailSnapshot.meta,
        summary: {
          claims: detailSnapshot.summary.claims,
          actions: detailSnapshot.summary.actions,
        },
        claims: detailSnapshot.claims,
        runbooks: detailSnapshot.runbooks,
        priorityActions: detailSnapshot.priorityActions,
      });
    }

    if (path === "/api/control-tower") {
      const denied = requireApiKey(request, env, url);
      if (denied) return denied;
      const snapshot = await buildControlTowerSnapshot(env, {
        includeInternals: true,
        includeDetails: true,
      });
      return json(snapshot);
    }

    // Proxy /api/scan/:branch → oracle-claim-scanner Worker (FIX-7)
    if (path.startsWith("/api/scan/")) {
      const denied = requireApiKey(request, env, url);
      if (denied) return denied;
      const branchId = path.split("/api/scan/")[1];
      const branch = BRANCHES.find(b => b.id === branchId);
      if (!branch) return json({ error: `Unknown branch: ${branchId}` }, 404);

      const scanPath = `/scan?branch=${encodeURIComponent(branchId)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = env.SCANNER_SERVICE
          ? await env.SCANNER_SERVICE.fetch(`https://scanner.internal${scanPath}`, {
              method: request.method === "POST" ? "POST" : "GET",
              headers: { Accept: "application/json" },
            })
          : await fetch(
              normalizeUrl(env.SCANNER_URL || "https://oracle-scanner.elfadil.com", scanPath),
              {
                method: request.method === "POST" ? "POST" : "GET",
                headers: { Accept: "application/json" },
                signal: controller.signal,
              }
            );

        const body = await response.text();
        return new Response(body, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        return json(
          {
            error: error.name === "AbortError" ? "timeout" : error.message,
            branch: branchId,
          },
          502
        );
      } finally {
        clearTimeout(timer);
      }
    }

    // JSON health of all branches (public — used by COMPLIANCELINC scanner)
    if (path === "/api/health") {
      const health = await probeAllBranches();
      const online = Object.values(health).filter(h => h.online).length;
      return json({
        timestamp: new Date().toISOString(),
        summary:   { total: BRANCHES.length, online, offline: BRANCHES.length - online },
        branches:  health,
        mohPortals: MOH_PORTALS.map(p => ({ id: p.id, name: p.nameEn, url: p.url })),
      });
    }

    // JSON health of one branch (public)
    if (path.startsWith("/api/health/")) {
      const id = path.split("/api/health/")[1];
      const branch = BRANCHES.find(b => b.id === id);
      if (!branch) return json({ error: `Unknown branch: ${id}` }, 404);
      const result = await probeBranch(branch);
      return json(result);
    }

    // Branch config (public — used by COMPLIANCELINC scanner)
    if (path === "/api/branches") {
      return json(BRANCHES.map(b => ({
        id:       b.id,
        name:     b.name,
        nameEn:   b.nameEn,
        region:   b.region,
        url:      `https://${b.subdomain}${b.loginPath}`,
        subdomain: b.subdomain,
        loginPath: b.loginPath,
      })));
    }

    // Dashboard (default route) — error boundary prevents Worker crash
    try {
      const snapshot = await buildControlTowerSnapshot(env, {
        includeInternals: false,
        includeDetails: true,
      });
      return new Response(renderDashboard(snapshot), {
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      console.error("Dashboard render failed:", err.message);
      return new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unavailable</title></head>` +
        `<body style="font-family:sans-serif;padding:2rem"><h1>Dashboard temporarily unavailable</h1>` +
        `<p>${escapeHtmlBasic(err.message)}</p><a href="/">Retry</a></body></html>`,
        { status: 503, headers: { "Content-Type": "text/html;charset=utf-8" } }
      );
    }
  },

  // ── Cron: probe every 5 min, store in KV ─────────────────────────────────
  async scheduled(event, env, ctx) {
    if (!env.PORTAL_KV) return; // KV not yet provisioned — skip silently
    try {
      const [branchHealth, externalHealth] = await Promise.all([
        probeAllBranches(),
        probeAllExternalPortals(),
      ]);
      const claims = buildClaimsSnapshot(await fetchScannerClaimsFeed(env), externalHealth);
      const snapshot = createControlTowerSnapshot(branchHealth, externalHealth, claims, {
        includeInternals: true,
        includeDetails: true,
      });
      const summarySnapshot = createControlTowerSnapshot(branchHealth, externalHealth, claims, {
        includeInternals: false,
        includeDetails: false,
      });
      const detailSnapshot = createControlTowerSnapshot(branchHealth, externalHealth, claims, {
        includeInternals: false,
        includeDetails: true,
      });
      await env.PORTAL_KV.put(
        "health:latest",
        JSON.stringify({ timestamp: snapshot.timestamp, branches: branchHealth }),
        { expirationTtl: 600 }
      );
      await env.PORTAL_KV.put(
        "control-tower:latest",
        JSON.stringify(snapshot),
        { expirationTtl: 600 }
      );
      await env.PORTAL_KV.put(
        "control-tower:summary:latest",
        JSON.stringify(summarySnapshot),
        { expirationTtl: 600 }
      );
      await env.PORTAL_KV.put(
        "control-tower:details:latest",
        JSON.stringify({
          timestamp: detailSnapshot.timestamp,
          meta: detailSnapshot.meta,
          summary: {
            claims: detailSnapshot.summary.claims,
            actions: detailSnapshot.summary.actions,
          },
          claims: detailSnapshot.claims,
          runbooks: detailSnapshot.runbooks,
          priorityActions: detailSnapshot.priorityActions,
        }),
        { expirationTtl: 600 }
      );
    } catch (err) {
      // Non-fatal: log to CF Logpush if available
      console.error("Cron health probe failed:", err.message);
    }
  },
};

// ── Dashboard HTML ────────────────────────────────────────────────────────────
function renderRunbookPage(runbook) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${runbook.title}</title>
<style>
  @import url("https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap");

  :root {
    --bg: #08141a;
    --panel: rgba(9, 27, 33, 0.9);
    --line: rgba(125, 169, 173, 0.2);
    --text: #edf8f6;
    --muted: #96b4b0;
    --cyan: #4ed6c5;
    --amber: #f2b766;
    --radius: 24px;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: "Sora", sans-serif;
    color: var(--text);
    background: linear-gradient(180deg, #071116 0%, #09161c 100%);
  }

  .page {
    width: min(920px, calc(100% - 32px));
    margin: 0 auto;
    padding: 28px 0 48px;
  }

  .panel {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    padding: 28px;
    margin-bottom: 20px;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--cyan);
    font-size: 0.72rem;
    margin: 0 0 12px;
  }

  h1, h2 { margin: 0; }
  p, li { color: var(--muted); line-height: 1.7; }
  ol { margin: 18px 0 0; padding-left: 20px; }
  li + li { margin-top: 10px; }
  .pill {
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(242, 183, 102, 0.12);
    color: var(--amber);
    font-size: 0.74rem;
    margin-right: 8px;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 20px;
  }

  .links a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 16px;
    border-radius: 999px;
    text-decoration: none;
    border: 1px solid var(--line);
    color: var(--text);
    background: rgba(255,255,255,0.03);
  }
  .links a.primary {
    background: linear-gradient(135deg, var(--cyan), #1da88f);
    color: #062029;
    border: none;
  }
</style>
</head>
<body>
  <main class="page">
    <section class="panel">
      <p class="eyebrow">Runbook</p>
      <h1>${runbook.title}</h1>
      <p>${runbook.summary}</p>
      <div style="margin-top:18px;">
        <span class="pill">Owner: ${runbook.owner}</span>
      </div>
      <div class="links">
        <a class="primary" href="/">Return to control tower</a>
        <a href="/api/runbooks/${runbook.id}" target="_blank" rel="noopener noreferrer">Open JSON</a>
      </div>
    </section>
    <section class="panel">
      <p class="eyebrow">Remediation path</p>
      <h2>Steps</h2>
      <ol>
        ${runbook.steps.map((step) => `<li>${step}</li>`).join("")}
      </ol>
    </section>
    <section class="panel" id="escalation">
      <p class="eyebrow">Escalation</p>
      <h2>${runbook.escalation.label}</h2>
      <p>${runbook.escalation.when}</p>
      <p>Escalation owner: ${runbook.escalation.team}</p>
    </section>
  </main>
</body>
</html>`;
}

function serializeForInlineScript(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function renderDashboard(snapshot) {
  const renderedAt = new Date(snapshot.timestamp);
  const serializedSnapshot = serializeForInlineScript(snapshot);

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BrainSAIT Healthcare Control Tower</title>
<style>
  @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&display=swap");

  *, *::before, *::after { box-sizing: border-box; }

  :root {
    --bg: #08141a;
    --panel: rgba(9, 27, 33, 0.82);
    --panel-strong: rgba(7, 20, 25, 0.96);
    --line: rgba(125, 169, 173, 0.18);
    --line-strong: rgba(125, 169, 173, 0.32);
    --text: #edf8f6;
    --muted: #96b4b0;
    --cyan: #4ed6c5;
    --teal: #1da88f;
    --lime: #8ddf6d;
    --amber: #f2b766;
    --coral: #ef7d64;
    --shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
    --radius-xl: 30px;
    --radius-lg: 22px;
  }

  html { scroll-behavior: smooth; }

  body {
    margin: 0;
    min-height: 100vh;
    font-family: "Sora", sans-serif;
    color: var(--text);
    background:
      radial-gradient(circle at top left, rgba(78, 214, 197, 0.18), transparent 28%),
      radial-gradient(circle at 85% 10%, rgba(242, 183, 102, 0.12), transparent 24%),
      linear-gradient(180deg, #071116 0%, #09161c 40%, #071116 100%);
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.65), transparent 92%);
  }

  a { color: inherit; }

  .page {
    width: min(1280px, calc(100% - 32px));
    margin: 0 auto;
    padding: 24px 0 64px;
    position: relative;
    z-index: 1;
  }

  .hero {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-xl);
    padding: 32px;
    background:
      linear-gradient(135deg, rgba(29, 168, 143, 0.16), rgba(8, 20, 26, 0.94) 46%),
      linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
    box-shadow: var(--shadow);
  }

  .hero::after {
    content: "";
    position: absolute;
    width: 320px;
    height: 320px;
    right: -80px;
    top: -90px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(78, 214, 197, 0.28), transparent 70%);
    filter: blur(8px);
  }

  .hero-grid,
  .detail-grid,
  .footer-grid {
    display: grid;
    gap: 24px;
  }

  .hero-grid {
    grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.95fr);
    position: relative;
    z-index: 1;
  }

  .eyebrow {
    margin: 0 0 12px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--cyan);
    font-size: 0.72rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 6vw, 4.8rem);
    line-height: 0.98;
    max-width: 10ch;
  }

  h2 {
    margin: 0;
    font-size: 1.18rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .hero p,
  .section-shell p,
  .note-card p,
  .metric-panel p,
  .action-card p,
  .hospital-card p,
  .service-card p,
  .vision-panel p,
  .layer-card p,
  .flow-step p,
  .agent-card p,
  .security-card p,
  .playbook-card p,
  .data-card p {
    margin: 0;
    max-width: 64ch;
    color: var(--muted);
    font-size: 0.95rem;
    line-height: 1.7;
  }

  .stack,
  .hero-actions,
  .hero-notes,
  .stats-grid,
  .layer-grid,
  .hospital-grid,
  .service-grid,
  .agent-grid,
  .playbook-grid,
  .data-grid,
  .flow-strip,
  .toolbar,
  .toolbar-meta,
  .action-list {
    display: grid;
    gap: 16px;
  }

  .stack {
    margin-top: 22px;
    gap: 22px;
  }

  .hero-actions {
    grid-template-columns: repeat(auto-fit, minmax(180px, max-content));
    margin-top: 26px;
  }

  .hero-actions a,
  .hero-actions button,
  .primary-link,
  .secondary-link,
  .disabled-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border-radius: 999px;
    padding: 13px 18px;
    text-decoration: none;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }

  .hero-actions a:hover,
  .hero-actions button:hover,
  .primary-link:hover,
  .secondary-link:hover { transform: translateY(-1px); }

  .primary-action,
  .primary-link {
    background: linear-gradient(135deg, var(--cyan), var(--teal));
    color: #062029;
  }

  .secondary-action,
  .secondary-link {
    background: rgba(255,255,255,0.03);
    color: var(--text);
    border-color: var(--line-strong);
  }

  .secondary-action[disabled] {
    opacity: 0.65;
    cursor: wait;
  }

  .disabled-link {
    border: 1px dashed rgba(239, 125, 100, 0.4);
    background: rgba(239, 125, 100, 0.08);
    color: rgba(255, 255, 255, 0.72);
    cursor: not-allowed;
  }

  .hero-notes,
  .stats-grid,
  .toolbar-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .note-card,
  .metric-panel,
  .layer-card,
  .section-shell,
  .hospital-card,
  .service-card,
  .agent-card,
  .security-card,
  .playbook-card,
  .data-card,
  .stat-card,
  .flow-step,
  .vision-panel,
  .action-card,
  .mini-stat {
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    backdrop-filter: blur(16px);
  }

  .note-card,
  .metric-panel,
  .layer-card,
  .hospital-card,
  .service-card,
  .agent-card,
  .security-card,
  .playbook-card,
  .data-card,
  .stat-card,
  .flow-step,
  .vision-panel,
  .action-card,
  .mini-stat {
    padding: 20px;
  }

  .metric-panel {
    display: grid;
    gap: 14px;
    align-content: start;
    background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  }

  .refresh-strip,
  .toolbar-status,
  .action-meta,
  .service-meta,
  .hospital-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: rgba(255,255,255,0.68);
    font-size: 0.8rem;
  }

  .refresh-error {
    color: var(--coral);
  }

  .stat-card strong,
  .mini-stat strong {
    display: block;
    font-size: 2.1rem;
    line-height: 1;
    margin-bottom: 8px;
  }

  .stat-card span,
  .mini-stat span {
    display: block;
    color: var(--muted);
    font-size: 0.84rem;
  }

  .stat-card small {
    display: block;
    margin-top: 14px;
    color: rgba(255,255,255,0.64);
    font-size: 0.75rem;
  }

  .section-shell {
    padding: 24px;
    background: var(--panel-strong);
  }

  .section-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
  }

  .section-header p { max-width: 62ch; }

  .layer-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .hospital-grid,
  .service-grid,
  .claims-grid,
  .reason-grid,
  .agent-grid,
  .playbook-grid,
  .data-grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .flow-strip { grid-template-columns: repeat(5, minmax(0, 1fr)); }

  .layer-card span,
  .flow-step span,
  .severity-badge,
  .status-chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .layer-card span,
  .flow-step span {
    margin-bottom: 14px;
    color: var(--cyan);
  }

  .flow-step { position: relative; min-height: 170px; }

  .flow-step::after {
    content: "→";
    position: absolute;
    right: -11px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(255,255,255,0.22);
    font-size: 1.25rem;
  }

  .flow-step:last-child::after { display: none; }

  .hospital-card,
  .service-card,
  .action-card,
  .vision-panel { position: relative; overflow: hidden; }

  .hospital-card::before,
  .service-card::before,
  .action-card::before,
  .vision-panel::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
    opacity: 0.22;
  }

  .hospital-card.tone-stable,
  .service-card.tone-stable,
  .action-card.severity-info { box-shadow: inset 0 0 0 1px rgba(78, 214, 197, 0.05); }

  .hospital-card.tone-watch,
  .service-card.tone-watch,
  .action-card.severity-medium,
  .action-card.severity-high { box-shadow: inset 0 0 0 1px rgba(242, 183, 102, 0.14); }

  .hospital-card.tone-critical,
  .service-card.tone-critical,
  .action-card.severity-critical { box-shadow: inset 0 0 0 1px rgba(239, 125, 100, 0.14); }

  .hospital-top,
  .service-top,
  .action-top {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
  }

  .arabic-name {
    margin-top: 6px;
    font-family: "IBM Plex Sans Arabic", sans-serif;
    color: rgba(237, 248, 246, 0.82);
    font-size: 0.9rem;
  }

  .status-chip,
  .severity-badge {
    padding: 7px 11px;
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .status-chip.stable,
  .severity-badge.info {
    background: rgba(141, 223, 109, 0.12);
    color: var(--lime);
    border-color: rgba(141, 223, 109, 0.2);
  }

  .status-chip.watch,
  .severity-badge.medium,
  .severity-badge.high {
    background: rgba(242, 183, 102, 0.14);
    color: var(--amber);
    border-color: rgba(242, 183, 102, 0.2);
  }

  .status-chip.critical,
  .severity-badge.critical {
    background: rgba(239, 125, 100, 0.14);
    color: var(--coral);
    border-color: rgba(239, 125, 100, 0.2);
  }

  .owner-pill,
  .provider-pill {
    display: inline-flex;
    align-items: center;
    padding: 7px 11px;
    border-radius: 999px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.74);
    font-size: 0.74rem;
  }

  .hospital-metrics,
  .service-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 18px 0 16px;
  }

  .hospital-metrics div,
  .service-metrics div {
    padding: 12px;
    border-radius: 14px;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.05);
  }

  .metric-label {
    display: block;
    color: rgba(255,255,255,0.58);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }

  .hospital-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 18px;
  }

  .hospital-tags span {
    border-radius: 999px;
    padding: 7px 10px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.68);
    font-size: 0.74rem;
  }

  .toolbar {
    grid-template-columns: minmax(240px, 1.2fr) minmax(0, 1fr) minmax(220px, 0.8fr);
    align-items: end;
  }

  .search-box span {
    display: block;
    margin-bottom: 8px;
    color: rgba(255,255,255,0.68);
    font-size: 0.82rem;
  }

  .search-box input {
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: rgba(255,255,255,0.03);
    color: var(--text);
    padding: 14px 16px;
    font: inherit;
  }

  .search-box input:focus {
    outline: none;
    border-color: rgba(78, 214, 197, 0.46);
    box-shadow: 0 0 0 3px rgba(78, 214, 197, 0.12);
  }

  .filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .filter-pill {
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 11px 14px;
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.74);
    font: inherit;
    cursor: pointer;
  }

  .filter-pill.active {
    background: rgba(78, 214, 197, 0.14);
    color: var(--cyan);
    border-color: rgba(78, 214, 197, 0.28);
  }

  .mini-stat { padding: 16px 18px; }

  .action-list { grid-template-columns: 1fr; }

  .claims-grid,
  .reason-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .action-recommendation {
    margin-top: 14px;
    padding: 14px;
    border-radius: 14px;
    background: rgba(255,255,255,0.035);
  }

  .action-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
  }

  .metric-note {
    margin-top: 12px;
    color: rgba(255,255,255,0.6);
    font-size: 0.8rem;
  }

  .reason-pill {
    display: inline-flex;
    align-items: center;
    margin-top: 12px;
    padding: 7px 11px;
    border-radius: 999px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.74);
    font-size: 0.74rem;
  }

  .empty-state {
    padding: 24px;
    border: 1px dashed var(--line-strong);
    border-radius: 18px;
    color: rgba(255,255,255,0.62);
    text-align: center;
    background: rgba(255,255,255,0.02);
  }

  .vision-panel {
    padding: 24px;
    background:
      linear-gradient(135deg, rgba(78, 214, 197, 0.08), rgba(239, 125, 100, 0.06)),
      rgba(9, 27, 33, 0.82);
  }

  .footer-bar {
    margin-top: 24px;
    padding: 16px 18px;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.68);
    font-size: 0.8rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 10px;
  }

  .fade-up {
    opacity: 0;
    transform: translateY(18px);
    animation: fadeUp 0.7s ease forwards;
  }

  .delay-1 { animation-delay: 0.08s; }
  .delay-2 { animation-delay: 0.16s; }
  .delay-3 { animation-delay: 0.24s; }
  .delay-4 { animation-delay: 0.32s; }

  @keyframes fadeUp {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 1080px) {
    .hero-grid,
    .detail-grid,
    .footer-grid,
    .layer-grid,
    .flow-strip,
    .toolbar {
      grid-template-columns: 1fr;
    }

    .flow-step::after { display: none; }
  }

  @media (max-width: 720px) {
    .page { width: min(100% - 18px, 1280px); padding-top: 10px; }
    .hero,
    .section-shell,
    .vision-panel { padding: 18px; }
    .hero-notes,
    .stats-grid,
    .toolbar-meta,
    .hospital-metrics,
    .service-metrics { grid-template-columns: 1fr; }
    .section-header,
    .footer-bar {
      flex-direction: column;
      align-items: start;
    }
  }
</style>
</head>
<body>
  <main class="page">
    <section class="hero fade-up">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">BrainSAIT Healthcare Control Tower</p>
          <h1>Operate hospitals, NPHIES, and infrastructure as one network.</h1>
          <p>
            This version turns portals.elfadil.com into a live command surface. Hospital probes, external healthcare services, and computed priority actions are now combined into one operational snapshot that can refresh continuously without reloading the page.
          </p>
          <p>
            Search, filter, and real action queue handling now sit beside the architectural roadmap, so the portal acts like an actual control tower instead of a static gateway page.
          </p>
          <div class="hero-actions">
            <a href="#network" class="primary-action">View live hospital network</a>
            <a href="/api/control-tower/summary" target="_blank" rel="noopener noreferrer" class="secondary-action">Open summary API</a>
            <button type="button" id="refreshNow" class="secondary-action">Refresh live data</button>
          </div>
          <div class="hero-notes">
            <div class="note-card fade-up delay-1">
              <p class="eyebrow">Operational gain</p>
              <p>External services are monitored, branches are filterable, and action priorities are computed from real endpoint state.</p>
            </div>
            <div class="note-card fade-up delay-2">
              <p class="eyebrow">Business telemetry live</p>
              <p>The claims command now prefers live scanner batch telemetry and live NPHIES endpoint state, while keeping the current appeal portfolio as an explicit fallback reference.</p>
            </div>
          </div>
        </div>
        <aside class="metric-panel fade-up delay-1">
          <p class="eyebrow">Live operations snapshot</p>
          <h2>Current network posture</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <strong id="statAvailabilityPct">${snapshot.summary.hospitals.availabilityPct}%</strong>
              <span>Hospital portal availability</span>
              <small id="statAvailabilityMeta">${snapshot.summary.hospitals.online} online / ${snapshot.summary.hospitals.offline} offline</small>
            </div>
            <div class="stat-card">
              <strong id="statAvgLatency">${snapshot.summary.overall.avgLatencyMs ? `${snapshot.summary.overall.avgLatencyMs} ms` : "N/A"}</strong>
              <span>Average live latency</span>
              <small id="statLatencyMeta">${snapshot.summary.hospitals.degraded} degraded hospitals / ${snapshot.summary.externalServices.degraded} degraded external services</small>
            </div>
            <div class="stat-card">
              <strong id="statMonitored">${snapshot.summary.overall.monitoredEndpoints}</strong>
              <span>Monitored endpoints</span>
              <small id="statMonitoredMeta">${snapshot.summary.hospitals.total} hospitals + ${snapshot.summary.externalServices.total} external services</small>
            </div>
            <div class="stat-card">
              <strong id="statActionCount">${snapshot.summary.actions.total}</strong>
              <span>Priority actions open</span>
              <small id="statActionMeta">${snapshot.summary.actions.critical} critical / ${snapshot.summary.actions.high} high</small>
            </div>
          </div>
          <div class="refresh-strip">
            <span id="refreshState">Live snapshot ready</span>
            <span id="refreshCountdown">Next refresh in ${Math.round(snapshot.meta.refreshIntervalMs / 1000)}s</span>
            <span id="lastUpdated">Last probe: ${renderedAt.toUTCString()}</span>
            <span id="refreshError" class="refresh-error" hidden></span>
          </div>
        </aside>
      </div>
    </section>

    <section class="section-shell stack fade-up delay-1">
      <div class="section-header">
        <div>
          <p class="eyebrow">Architecture blueprint</p>
          <h2>The four layers of the BrainSAIT platform</h2>
        </div>
        <p>The UI is now live, but the roadmap remains visible so operators and stakeholders can connect each monitoring surface to the larger healthcare platform architecture.</p>
      </div>
      <div class="layer-grid">
        ${CONTROL_TOWER_LAYERS.map(layer => `
        <article class="layer-card fade-up delay-2">
          <span>${layer.label}</span>
          <h3>${layer.title}</h3>
          <p>${layer.detail}</p>
          <p>${layer.outcome}</p>
        </article>`).join("")}
      </div>
    </section>

    <section class="section-shell stack fade-up delay-2" id="network">
      <div class="section-header">
        <div>
          <p class="eyebrow">Hospital network</p>
          <h2>Live Oracle and branch connectivity</h2>
        </div>
        <p>Search hospitals, filter by operational state, and refresh in place. This grid is rendered from the control-tower snapshot rather than fixed HTML.</p>
      </div>
      <div class="toolbar">
        <label class="search-box">
          <span>Search hospitals</span>
          <input id="hospitalSearch" type="search" placeholder="Search by hospital, region, Arabic name, or subdomain">
        </label>
        <div class="filter-group" id="statusFilters">
          <button type="button" class="filter-pill active" data-filter="all">All</button>
          <button type="button" class="filter-pill" data-filter="stable">Operational</button>
          <button type="button" class="filter-pill" data-filter="watch">Watch</button>
          <button type="button" class="filter-pill" data-filter="critical">Critical</button>
        </div>
        <div class="toolbar-meta">
          <div class="mini-stat">
            <strong id="visibleHospitalCount">${snapshot.hospitals.length}</strong>
            <span>Visible branches</span>
          </div>
          <div class="mini-stat">
            <strong id="visibleActionCount">${snapshot.summary.actions.total}</strong>
            <span>Open actions</span>
          </div>
        </div>
      </div>
      <div class="toolbar-status" id="filterSummary">Showing all monitored hospital branches.</div>
      <div class="hospital-grid" id="hospitalGrid">
        <div class="empty-state">Loading live hospital cards...</div>
      </div>
    </section>

    <section class="detail-grid stack fade-up delay-2" id="claims-command">
      <section class="section-shell">
        <div class="section-header">
          <div>
            <p class="eyebrow">Claims command</p>
            <h2>Live claims, approvals, rejection, and payment recovery metrics</h2>
          </div>
          <p>The current appeal batch is now part of the control-tower snapshot, so operators can see business flow pressure and not just connectivity state.</p>
        </div>
        <div class="claims-grid" id="claimsSummaryGrid">
          <div class="empty-state">Loading claims metrics...</div>
        </div>
        <div class="reason-grid" id="rejectionReasonGrid" style="margin-top:16px;">
          <div class="empty-state">Loading rejection profile...</div>
        </div>
      </section>

      <section class="section-shell">
        <div class="section-header">
          <div>
            <p class="eyebrow">Recovery and scan health</p>
            <h2>Deadline risk, payment recovery, and scanner status</h2>
          </div>
          <p>Payment recovery is tracked by claim and service-item volume because the current batch files do not contain SAR amount fields.</p>
        </div>
        <div class="claims-grid" id="paymentSummaryGrid">
          <div class="empty-state">Loading payment recovery metrics...</div>
        </div>
        <div class="toolbar-status" id="scannerMeta">Loading scanner health...</div>
      </section>
    </section>

    <section class="detail-grid stack fade-up delay-3">
      <section class="section-shell">
        <div class="section-header">
          <div>
            <p class="eyebrow">Action queue</p>
            <h2>Priority actions for offline or degraded services</h2>
          </div>
          <p>The queue is generated from real hospital and external endpoint state, with severity and ownership assigned automatically.</p>
        </div>
        <div class="toolbar-status" id="actionQueueMeta">Computing live action queue...</div>
        <div class="action-list" id="actionQueue">
          <div class="empty-state">Loading action queue...</div>
        </div>
      </section>

      <section class="section-shell">
        <div class="section-header">
          <div>
            <p class="eyebrow">Monitored services</p>
            <h2>External healthcare service health</h2>
          </div>
          <p>MOH and NPHIES links are now treated as monitored services, not just static shortcuts.</p>
        </div>
        <div class="toolbar-status" id="externalServiceMeta">Monitoring external healthcare services in real time.</div>
        <div class="service-grid" id="externalGrid">
          <div class="empty-state">Loading monitored services...</div>
        </div>
      </section>
    </section>

    <section class="section-shell stack fade-up delay-2">
      <div class="section-header">
        <div>
          <p class="eyebrow">Claims lane</p>
          <h2>NPHIES and insurance command flow</h2>
        </div>
        <p>This lane remains the operating sequence behind the live metrics above: branch data, adapter validation, NPHIES submission, payer decision, and payment return.</p>
      </div>
      <div class="flow-strip">
        ${CLAIMS_WORKFLOW.map((step, index) => `
        <article class="flow-step fade-up delay-${Math.min(index + 1, 4)}">
          <span>Step ${index + 1}</span>
          <h3>${step.title}</h3>
          <p>${step.detail}</p>
        </article>`).join("")}
      </div>
    </section>

    <section class="detail-grid stack">
      <section class="section-shell fade-up delay-3">
        <div class="section-header">
          <div>
            <p class="eyebrow">Agent mesh</p>
            <h2>AI agents that run the network</h2>
          </div>
        </div>
        <div class="agent-grid">
          ${AGENT_BLUEPRINT.map(agent => `
          <article class="agent-card">
            <h3>${agent.title}</h3>
            <p>${agent.mission}</p>
          </article>`).join("")}
        </div>
      </section>

      <section class="section-shell fade-up delay-3">
        <div class="section-header">
          <div>
            <p class="eyebrow">Security model</p>
            <h2>Guardrails for sensitive healthcare operations</h2>
          </div>
        </div>
        <div class="agent-grid">
          ${SECURITY_GUARDRAILS.map(item => `
          <article class="security-card">
            <h3>${item.title}</h3>
            <p>${item.detail}</p>
          </article>`).join("")}
        </div>
      </section>
    </section>

    <section class="detail-grid stack">
      <section class="section-shell fade-up delay-3">
        <div class="section-header">
          <div>
            <p class="eyebrow">Automation</p>
            <h2>n8n playbooks for operational response</h2>
          </div>
        </div>
        <div class="playbook-grid">
          ${AUTOMATION_PLAYBOOKS.map(playbook => `
          <article class="playbook-card">
            <h3>${playbook.title}</h3>
            <p>${playbook.detail}</p>
          </article>`).join("")}
        </div>
      </section>

      <section class="section-shell fade-up delay-3">
        <div class="section-header">
          <div>
            <p class="eyebrow">Data intelligence</p>
            <h2>The analytics layer that follows the integrations</h2>
          </div>
        </div>
        <div class="data-grid">
          ${DATA_PRODUCTS.map(product => `
          <article class="data-card">
            <h3>${product.title}</h3>
            <p>${product.detail}</p>
          </article>`).join("")}
        </div>
      </section>
    </section>

    <section class="footer-grid stack fade-up delay-4">
      <section class="vision-panel">
        <p class="eyebrow">Strategic outcome</p>
        <h3>From portal gateway to Saudi healthcare interoperability layer</h3>
        <p>
          With a live snapshot model in place, this page can now accept real claims telemetry, external payer status, FHIR adapter health, and agent-driven recommendations without changing its architectural role.
        </p>
        <p>
          That is the leverage point: one control tower for network health, claims operations, integrations, and executive insight.
        </p>
      </section>
    </section>

    <div class="footer-bar fade-up delay-4">
      <span>Live probe time: ${renderedAt.toUTCString()}</span>
      <span><a href="/api/branches" target="_blank" rel="noopener noreferrer">Branch config API</a> · <a href="/api/health" target="_blank" rel="noopener noreferrer">Health JSON</a> · <a href="/api/control-tower/summary" target="_blank" rel="noopener noreferrer">Summary JSON</a> · <a href="/api/control-tower/details" target="_blank" rel="noopener noreferrer">Details JSON</a></span>
      <span>BrainSAIT COMPLIANCELINC · portals.elfadil.com · ${renderedAt.toISOString().slice(0, 10)}</span>
    </div>
  </main>

  <script>
    const initialSnapshot = ${serializedSnapshot};

    (() => {
      const state = {
        snapshot: initialSnapshot,
        filter: "all",
        search: "",
        refreshing: false,
        error: "",
        nextRefreshAt: Date.now() + ((initialSnapshot.meta && initialSnapshot.meta.refreshIntervalMs) || ${AUTO_REFRESH_INTERVAL_MS}),
        detailRefreshCounter: 0,
      };

      const refs = {};
      const refreshIntervalMs = (initialSnapshot.meta && initialSnapshot.meta.refreshIntervalMs) || ${AUTO_REFRESH_INTERVAL_MS};

      const init = () => {
        refs.refreshButton = document.getElementById("refreshNow");
        refs.search = document.getElementById("hospitalSearch");
        refs.filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
        refs.hospitalGrid = document.getElementById("hospitalGrid");
        refs.externalGrid = document.getElementById("externalGrid");
        refs.actionQueue = document.getElementById("actionQueue");
        refs.claimsSummaryGrid = document.getElementById("claimsSummaryGrid");
        refs.rejectionReasonGrid = document.getElementById("rejectionReasonGrid");
        refs.paymentSummaryGrid = document.getElementById("paymentSummaryGrid");
        refs.scannerMeta = document.getElementById("scannerMeta");
        refs.filterSummary = document.getElementById("filterSummary");
        refs.actionQueueMeta = document.getElementById("actionQueueMeta");
        refs.externalServiceMeta = document.getElementById("externalServiceMeta");
        refs.visibleHospitalCount = document.getElementById("visibleHospitalCount");
        refs.visibleActionCount = document.getElementById("visibleActionCount");
        refs.statAvailabilityPct = document.getElementById("statAvailabilityPct");
        refs.statAvailabilityMeta = document.getElementById("statAvailabilityMeta");
        refs.statAvgLatency = document.getElementById("statAvgLatency");
        refs.statLatencyMeta = document.getElementById("statLatencyMeta");
        refs.statMonitored = document.getElementById("statMonitored");
        refs.statMonitoredMeta = document.getElementById("statMonitoredMeta");
        refs.statActionCount = document.getElementById("statActionCount");
        refs.statActionMeta = document.getElementById("statActionMeta");
        refs.refreshState = document.getElementById("refreshState");
        refs.refreshCountdown = document.getElementById("refreshCountdown");
        refs.lastUpdated = document.getElementById("lastUpdated");
        refs.refreshError = document.getElementById("refreshError");

        refs.search.addEventListener("input", (event) => {
          state.search = event.target.value || "";
          renderHospitals();
        });

        refs.filterButtons.forEach((button) => {
          button.addEventListener("click", () => {
            state.filter = button.dataset.filter || "all";
            renderHospitals();
            updateFilterButtons();
          });
        });

        refs.refreshButton.addEventListener("click", () => refreshSnapshot(true));

        render();
        window.setInterval(() => refreshSnapshot(false), refreshIntervalMs);
        window.setInterval(updateRefreshStrip, 1000);
      };

      function escapeHtml(value) {
        return String(value || "").replace(/[&<>\"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[char]));
      }

      function severityLabel(severity) {
        const labels = {
          critical: "Critical",
          high: "High",
          medium: "Medium",
          info: "Stable",
        };
        return labels[severity] || severity;
      }

      function formatLatency(latency) {
        return typeof latency === "number" ? latency + " ms" : "No response";
      }

      function formatStatus(statusCode, error) {
        return statusCode ? "HTTP " + statusCode : (error || "Unavailable");
      }

      function renderHospitalCard(item) {
        return [
          '<article class="hospital-card tone-', escapeHtml(item.tone), '">',
            '<div class="hospital-top">',
              '<div>',
                '<p class="eyebrow">', escapeHtml(item.region), '</p>',
                '<h3>', escapeHtml(item.nameEn), '</h3>',
                '<div class="arabic-name">', escapeHtml(item.name), '</div>',
              '</div>',
              '<span class="status-chip ', escapeHtml(item.tone), '">', escapeHtml(item.healthLabel), '</span>',
            '</div>',
            '<p>', escapeHtml(item.signal), '</p>',
            '<div class="hospital-metrics">',
              '<div><span class="metric-label">Latency</span><strong>', escapeHtml(formatLatency(item.latency)), '</strong></div>',
              '<div><span class="metric-label">Status</span><strong>', escapeHtml(formatStatus(item.statusCode, item.error)), '</strong></div>',
            '</div>',
            '<div class="hospital-tags">',
              '<span>', escapeHtml(item.subdomain), '</span>',
              '<span>', escapeHtml(item.loginPath), '</span>',
            '</div>',
            item.online
              ? '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" class="primary-link">Open Oracle Portal</a>'
              : '<span class="primary-link disabled-link">Portal unavailable</span>',
          '</article>'
        ].join('');
      }

      function renderExternalCard(item) {
        return [
          '<article class="service-card tone-', escapeHtml(item.tone), '">',
            '<div class="service-top">',
              '<div>',
                '<p class="eyebrow">External service</p>',
                '<h3>', escapeHtml(item.nameEn), '</h3>',
                '<div class="arabic-name">', escapeHtml(item.name), '</div>',
              '</div>',
              '<span class="status-chip ', escapeHtml(item.tone), '">', escapeHtml(item.healthLabel), '</span>',
            '</div>',
            '<p>', escapeHtml(item.description), '</p>',
            '<p>', escapeHtml(item.signal), '</p>',
            '<div class="service-metrics">',
              '<div><span class="metric-label">Latency</span><strong>', escapeHtml(formatLatency(item.latency)), '</strong></div>',
              '<div><span class="metric-label">Status</span><strong>', escapeHtml(formatStatus(item.statusCode, item.error)), '</strong></div>',
            '</div>',
            '<div class="service-meta">',
              '<span class="provider-pill">', escapeHtml(item.provider), '</span>',
              '<span>', escapeHtml(item.url), '</span>',
            '</div>',
            '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">Open service</a>',
          '</article>'
        ].join('');
      }

      function renderActionCard(action) {
        return [
          '<article class="action-card severity-', escapeHtml(action.severity), '">',
            '<div class="action-top">',
              '<div>',
                '<span class="severity-badge ', escapeHtml(action.severity), '">', escapeHtml(severityLabel(action.severity)), '</span>',
                '<h3 style="margin-top:12px;">#', escapeHtml(action.rank), ' ', escapeHtml(action.title), '</h3>',
              '</div>',
              '<span class="owner-pill">', escapeHtml(action.owner), '</span>',
            '</div>',
            '<p>', escapeHtml(action.description), '</p>',
            '<div class="action-meta">',
              '<span>', escapeHtml(action.scope), '</span>',
              '<span>', escapeHtml(action.target), '</span>',
            '</div>',
            '<div class="action-recommendation">', escapeHtml(action.recommendation), '</div>',
            (action.runbookSummary ? '<p class="metric-note">Runbook: ' + escapeHtml(action.runbookSummary) + '</p>' : ''),
            '<div class="action-links">',
              '<a href="' + escapeHtml(action.href) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">', escapeHtml(action.hrefLabel), '</a>',
              (action.runbookHref ? '<a href="' + escapeHtml(action.runbookHref) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">Open runbook</a>' : ''),
              (action.escalationHref ? '<a href="' + escapeHtml(action.escalationHref) + '" target="_blank" rel="noopener noreferrer" class="secondary-link">' + escapeHtml(action.escalationLabel || 'Escalate') + '</a>' : ''),
            '</div>',
          '</article>'
        ].join('');
      }

      function renderClaimsSummaryCard(title, value, detail, note) {
        return [
          '<article class="stat-card">',
            '<strong>', escapeHtml(value), '</strong>',
            '<span>', escapeHtml(title), '</span>',
            '<small>', escapeHtml(detail), '</small>',
            (note ? '<div class="metric-note">' + escapeHtml(note) + '</div>' : ''),
          '</article>'
        ].join('');
      }

      function renderReasonCard(reason) {
        return [
          '<article class="service-card tone-', escapeHtml(reason.severity === 'critical' ? 'critical' : (reason.severity === 'high' ? 'watch' : 'stable')), '">',
            '<div class="service-top">',
              '<div>',
                '<p class="eyebrow">Rejection reason</p>',
                '<h3>', escapeHtml(reason.code), '</h3>',
              '</div>',
              '<span class="status-chip ', escapeHtml(reason.severity === 'critical' ? 'critical' : (reason.severity === 'high' ? 'watch' : 'stable')), '">', escapeHtml(reason.count + ' claims'), '</span>',
            '</div>',
            '<p>', escapeHtml(reason.name), '</p>',
            '<span class="reason-pill">', escapeHtml(reason.severity), ' priority</span>',
          '</article>'
        ].join('');
      }

      function updateFilterButtons() {
        refs.filterButtons.forEach((button) => {
          button.classList.toggle("active", button.dataset.filter === state.filter);
        });
      }

      function getVisibleHospitals() {
        const search = state.search.trim().toLowerCase();
        return state.snapshot.hospitals.filter((item) => {
          const matchesFilter = state.filter === "all" || item.tone === state.filter;
          if (!matchesFilter) return false;
          if (!search) return true;

          const haystack = [item.nameEn, item.name, item.region, item.subdomain]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        });
      }

      function renderSummary() {
        const summary = state.snapshot.summary;
        const claims = state.snapshot.claims;
        refs.statAvailabilityPct.textContent = summary.hospitals.availabilityPct + "%";
        refs.statAvailabilityMeta.textContent = summary.hospitals.online + " online / " + summary.hospitals.offline + " offline";
        refs.statAvgLatency.textContent = summary.overall.avgLatencyMs ? summary.overall.avgLatencyMs + " ms" : "N/A";
        refs.statLatencyMeta.textContent = summary.hospitals.degraded + " degraded hospitals / " + summary.externalServices.degraded + " degraded external services";
        refs.statMonitored.textContent = summary.overall.monitoredEndpoints;
        refs.statMonitoredMeta.textContent = summary.hospitals.total + " hospitals + " + summary.externalServices.total + " external services";
        refs.statActionCount.textContent = summary.actions.total;
        refs.statActionMeta.textContent = summary.actions.critical + " critical / " + summary.actions.high + " high";
        refs.visibleActionCount.textContent = summary.actions.total;
        refs.actionQueueMeta.textContent = summary.actions.total
          ? summary.actions.critical + " critical, " + summary.actions.high + " high, and " + summary.actions.medium + " medium actions are open."
          : "No urgent actions are open. The queue is clear right now.";
        refs.externalServiceMeta.textContent = summary.externalServices.online + " of " + summary.externalServices.total + " external services reachable, " + summary.externalServices.degraded + " degraded.";
        refs.scannerMeta.textContent = claims.scanner.liveSystem && claims.scanner.liveSystem.available
          ? claims.sourceSummary + " Scanner metrics: " + claims.scanner.liveSystem.totalScans + " total scans, " + claims.scanner.liveSystem.failedScans + " failures, avg " + claims.scanner.liveSystem.avgDurationMs + " ms. NPHIES is " + claims.upstreams.nphies.label.toLowerCase() + "."
          : claims.sourceSummary + " Latest known batch: " + claims.scanner.latestBatch.errorCount + " route errors, processed " + claims.scanner.latestBatch.processed + " of " + claims.scanner.latestBatch.totalEligible + " eligible claims.";
        refs.lastUpdated.textContent = "Last probe: " + new Date(state.snapshot.timestamp).toUTCString();
      }

      function renderHospitals() {
        const hospitals = getVisibleHospitals();
        refs.visibleHospitalCount.textContent = hospitals.length;
        refs.filterSummary.textContent = hospitals.length
          ? "Showing " + hospitals.length + " of " + state.snapshot.hospitals.length + " monitored hospital branches."
          : "No hospitals match the current search and filter.";
        refs.hospitalGrid.innerHTML = hospitals.length
          ? hospitals.map(renderHospitalCard).join("")
          : '<div class="empty-state">No hospitals match the current search or operational filter.</div>';
      }

      function renderExternalServices() {
        refs.externalGrid.innerHTML = state.snapshot.externalServices.length
          ? state.snapshot.externalServices.map(renderExternalCard).join("")
          : '<div class="empty-state">No external healthcare services are configured.</div>';
      }

      function renderClaims() {
        const claims = state.snapshot.claims;
        refs.claimsSummaryGrid.innerHTML = [
          renderClaimsSummaryCard("Claims in current appeal batch", String(claims.summary.totalClaims), claims.payer + " · " + claims.provider, claims.sourceSummary),
          renderClaimsSummaryCard("Ready for submission", String(claims.summary.readyClaims), claims.summary.readyPct + "% of batch is appeal-ready", claims.daysRemaining + " days remain in window"),
          renderClaimsSummaryCard("Blocked by recode", String(claims.summary.blockedClaims), claims.rejections.blockerIssue.code + " across " + claims.rejections.blockerIssue.affectedServiceItems + " service items", claims.rejections.blockerIssue.description),
          renderClaimsSummaryCard("Approval-sensitive claims", String(claims.approvals.priorAuthClaims), claims.approvals.criticalTherapyClaims + " critical therapy bundles and " + claims.approvals.coverageReviewClaims + " coverage reviews", "Approval portal: " + claims.upstreams.mohApproval.label + " · NPHIES: " + claims.upstreams.nphies.label),
        ].join("");

        refs.paymentSummaryGrid.innerHTML = [
          renderClaimsSummaryCard("Recoverable service items", String(claims.payments.recoverableServiceItems), claims.payments.recoverablePct + "% of disputed items are on ready claims", claims.payments.note),
          renderClaimsSummaryCard("Blocked service items", String(claims.payments.blockedServiceItems), "Held by recode blockers", "Move blocker claims first to protect payment recovery."),
          renderClaimsSummaryCard("Latest scan eligible claims", String(claims.scanner.latestBatch.totalEligible), claims.scanner.latestBatch.errorCount + " route errors in latest batch", (claims.scanner.latestBatch.sourceBatchId || claims.batchId) + " · " + claims.scanner.latestBatch.dominantError),
          renderClaimsSummaryCard("Critical claims", String(claims.criticalClaims.length), claims.criticalClaims.map((claim) => claim.bundleId.slice(0, 8) + ":" + claim.liveStatus).join(", "), "Live watchlist status for high-risk claims"),
        ].join("");

        refs.rejectionReasonGrid.innerHTML = claims.rejections.topReasons.length
          ? claims.rejections.topReasons.map(renderReasonCard).join("")
          : '<div class="empty-state">No rejection reasons available.</div>';
      }

      function renderActionQueue() {
        refs.actionQueue.innerHTML = state.snapshot.priorityActions.length
          ? state.snapshot.priorityActions.map(renderActionCard).join("")
          : '<div class="empty-state">No actions are currently queued.</div>';
      }

      function updateRefreshStrip() {
        refs.refreshButton.disabled = state.refreshing;
        refs.refreshButton.textContent = state.refreshing ? "Refreshing..." : "Refresh live data";
        refs.refreshState.textContent = state.refreshing ? "Refreshing live snapshot..." : "Auto refresh is active";
        const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
        refs.refreshCountdown.textContent = state.refreshing ? "Please wait" : "Next refresh in " + seconds + "s";
        refs.refreshError.textContent = state.error ? "Refresh error: " + state.error : "";
        refs.refreshError.hidden = !state.error;
      }

      async function refreshSummary() {
        const response = await fetch("/api/control-tower/summary?ts=" + Date.now(), {
          cache: "no-store",
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }

        const summarySnapshot = await response.json();
        state.snapshot = {
          ...state.snapshot,
          ...summarySnapshot,
          hospitals: summarySnapshot.hospitals,
          externalServices: summarySnapshot.externalServices,
          priorityActions: summarySnapshot.priorityActions,
          summary: {
            ...state.snapshot.summary,
            ...summarySnapshot.summary,
          },
        };
      }

      async function refreshDetails() {
        const response = await fetch("/api/control-tower/details?ts=" + Date.now(), {
          cache: "no-store",
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }

        const detailSnapshot = await response.json();
        state.snapshot = {
          ...state.snapshot,
          timestamp: detailSnapshot.timestamp || state.snapshot.timestamp,
          meta: detailSnapshot.meta || state.snapshot.meta,
          claims: detailSnapshot.claims || state.snapshot.claims,
          runbooks: detailSnapshot.runbooks || state.snapshot.runbooks,
          priorityActions: detailSnapshot.priorityActions || state.snapshot.priorityActions,
          summary: {
            ...state.snapshot.summary,
            ...(detailSnapshot.summary || {}),
            actions: detailSnapshot.summary?.actions || state.snapshot.summary?.actions,
            claims: detailSnapshot.summary?.claims || state.snapshot.summary?.claims,
          },
        };
      }

      async function refreshSnapshot(manual) {
        if (state.refreshing) return;
        state.refreshing = true;
        updateRefreshStrip();

        try {
          await refreshSummary();
          state.detailRefreshCounter += 1;
          if (manual || state.detailRefreshCounter % 3 === 0) {
            await refreshDetails();
          }
          state.error = "";
          state.nextRefreshAt = Date.now() + (((state.snapshot.meta && state.snapshot.meta.refreshIntervalMs) || refreshIntervalMs));
          render();
        } catch (error) {
          state.error = error.message || "Unable to refresh control-tower snapshot";
          state.nextRefreshAt = Date.now() + refreshIntervalMs;
        } finally {
          state.refreshing = false;
          updateRefreshStrip();
        }
      }

      function render() {
        renderSummary();
        renderHospitals();
        renderExternalServices();
        renderClaims();
        renderActionQueue();
        updateFilterButtons();
        updateRefreshStrip();
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        init();
      }
    })();
  </script>
</body>
</html>`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtmlBasic(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
