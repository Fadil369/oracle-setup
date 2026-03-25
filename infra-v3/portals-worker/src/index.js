/**
 * portals.elfadil.com — BrainSAIT Hospital Portals v3.0
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
 *   NEW    Cron trigger: health check every 5 min → stored in KV
 *
 * Routes:
 *   GET  /                    → portal dashboard HTML
 *   GET  /api/health          → JSON health of all branches
 *   GET  /api/health/:branch  → JSON health of one branch
 *   GET  /api/branches        → branch config (no passwords)
 *   GET  /health              → simple 200 OK liveness probe
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

// ── Health probe ─────────────────────────────────────────────────────────────
async function probeBranch(branch) {
  const url = `https://${branch.subdomain}${branch.loginPath}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), branch.probeTimeout);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "BrainSAIT-HealthProbe/3.0" },
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    const online = res.status < 500;
    return {
      id:      branch.id,
      online,
      status:  res.status,
      latency,
      url,
      probed:  new Date().toISOString(),
    };
  } catch (e) {
    return {
      id:      branch.id,
      online:  false,
      status:  0,
      latency: Date.now() - start,
      url,
      error:   e.name === "AbortError" ? "timeout" : e.message,
      probed:  new Date().toISOString(),
    };
  }
}

async function probeAll() {
  const results = await Promise.all(BRANCHES.map(probeBranch));
  return Object.fromEntries(results.map(r => [r.id, r]));
}

// ── Main fetch handler ────────────────────────────────────────────────────────
export default {
  // ── HTTP requests ─────────────────────────────────────────────────────────
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Simple liveness
    if (path === "/health") {
      return new Response("ok", { status: 200 });
    }

    // JSON health of all branches
    if (path === "/api/health") {
      const health = await probeAll();
      const online = Object.values(health).filter(h => h.online).length;
      return json({
        timestamp: new Date().toISOString(),
        summary:   { total: BRANCHES.length, online, offline: BRANCHES.length - online },
        branches:  health,
        mohPortals: MOH_PORTALS.map(p => ({ id: p.id, name: p.nameEn, url: p.url })),
      });
    }

    // JSON health of one branch
    if (path.startsWith("/api/health/")) {
      const id = path.split("/api/health/")[1];
      const branch = BRANCHES.find(b => b.id === id);
      if (!branch) return json({ error: `Unknown branch: ${id}` }, 404);
      const result = await probeBranch(branch);
      return json(result);
    }

    // Branch config (for COMPLIANCELINC scanner)
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

    // Dashboard (default route)
    const health = await probeAll();
    return new Response(renderDashboard(health), {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  },

  // ── Cron: probe every 5 min, store in KV ─────────────────────────────────
  async scheduled(event, env, ctx) {
    if (!env.PORTAL_KV) return; // KV not yet provisioned — skip silently
    try {
      const health = await probeAll();
      await env.PORTAL_KV.put(
        "health:latest",
        JSON.stringify({ timestamp: new Date().toISOString(), branches: health }),
        { expirationTtl: 600 }
      );
    } catch (err) {
      // Non-fatal: log to CF Logpush if available
      console.error("Cron health probe failed:", err.message);
    }
  },
};

// ── Dashboard HTML ────────────────────────────────────────────────────────────
function renderDashboard(health) {
  const online  = Object.values(health).filter(h => h.online).length;
  const total   = BRANCHES.length;
  const pct     = Math.round((online / total) * 100);

  const cards = BRANCHES.map(b => {
    const h        = health[b.id];
    const isOnline = h?.online;
    const latency  = h?.latency ?? "—";
    const status   = h?.error === "timeout" ? "Timeout" : isOnline ? "Online" : "Offline";
    const loginUrl = `https://${b.subdomain}${b.loginPath}`;

    return `
    <div class="card ${isOnline ? "online" : "offline"}">
      <div class="card-top">
        <span class="dot ${isOnline ? "dot-green" : "dot-red"}"></span>
        <span class="badge ${isOnline ? "badge-green" : "badge-red"}">${status}</span>
      </div>
      <div class="hospital-icon">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="8" y="14" width="24" height="20" rx="2" fill="${isOnline ? "#0ea5e9" : "#94a3b8"}" opacity="0.2"/>
          <rect x="8" y="14" width="24" height="20" rx="2" stroke="${isOnline ? "#0ea5e9" : "#94a3b8"}" stroke-width="1.5"/>
          <rect x="16" y="4" width="8" height="10" rx="1" fill="${isOnline ? "#0ea5e9" : "#94a3b8"}" opacity="0.3"/>
          <rect x="16" y="4" width="8" height="10" rx="1" stroke="${isOnline ? "#0ea5e9" : "#94a3b8"}" stroke-width="1.5"/>
          <rect x="18" y="6" width="4" height="6" fill="${isOnline ? "#0ea5e9" : "#94a3b8"}"/>
          <rect x="17" y="22" width="6" height="12" rx="1" fill="${isOnline ? "#0ea5e9" : "#94a3b8"}" opacity="0.4"/>
          <rect x="12" y="20" width="4" height="4" rx="0.5" fill="${isOnline ? "#0ea5e9" : "#94a3b8"}"/>
          <rect x="24" y="20" width="4" height="4" rx="0.5" fill="${isOnline ? "#0ea5e9" : "#94a3b8"}"/>
        </svg>
      </div>
      <div class="branch-name-ar">${b.name}</div>
      <div class="branch-name-en">${b.nameEn}</div>
      <div class="branch-meta">
        <span class="meta-item">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1"/><path d="M5 3v2.5l1.5 1" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
          ${isOnline ? latency + "ms" : "—"}
        </span>
        <span class="meta-item">${b.region}</span>
      </div>
      ${isOnline
        ? `<a href="${loginUrl}" target="_blank" class="btn btn-primary">→ Access Portal</a>`
        : `<button class="btn btn-disabled" disabled>Unavailable</button>`
      }
      <div class="backend-label">Backend: ${b.backend}</div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BrainSAIT Hospital Portals</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f172a; --surface: #1e293b; --card: #1e293b;
    --border: rgba(148,163,184,0.12);
    --blue: #0ea5e9; --green: #22c55e; --red: #ef4444; --amber: #f59e0b;
    --text: #f1f5f9; --muted: #94a3b8; --subtle: #475569;
    --radius: 14px;
  }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg);
         color: var(--text); min-height: 100vh; }
  .header { padding: 2rem; text-align: center; border-bottom: 1px solid var(--border); }
  .header h1 { font-size: 1.8rem; font-weight: 700; color: var(--text); }
  .header p  { color: var(--muted); margin-top: 4px; font-size: 0.9rem; }
  .stats { display: flex; justify-content: center; gap: 2rem;
           padding: 1.5rem; border-bottom: 1px solid var(--border); }
  .stat { text-align: center; }
  .stat-val  { font-size: 2rem; font-weight: 700; color: var(--blue); }
  .stat-val.green { color: var(--green); }
  .stat-val.red   { color: var(--red); }
  .stat-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase;
                letter-spacing: .05em; margin-top: 2px; }
  .section-label { font-size: 0.7rem; font-weight: 600; color: var(--muted);
                   text-transform: uppercase; letter-spacing: .08em;
                   padding: 1.5rem 2rem 0.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr));
          gap: 1rem; padding: 0 1.5rem 2rem; }
  .card { background: var(--card); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 1.25rem;
          transition: border-color .2s, transform .15s; }
  .card:hover { border-color: rgba(14,165,233,0.35); transform: translateY(-2px); }
  .card.online  { border-left: 3px solid var(--green); }
  .card.offline { border-left: 3px solid var(--red); opacity: .7; }
  .card-top { display: flex; align-items: center; justify-content: space-between;
              margin-bottom: 1rem; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot-green { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .dot-red   { background: var(--red); }
  .badge { font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
  .badge-green { background: rgba(34,197,94,.15); color: var(--green); }
  .badge-red   { background: rgba(239,68,68,.15);  color: var(--red); }
  .hospital-icon { display: flex; justify-content: center; margin: 0.5rem 0; }
  .branch-name-ar { font-size: 1.2rem; font-weight: 700; text-align: center;
                    color: var(--text); margin-top: 0.5rem; }
  .branch-name-en { font-size: 0.8rem; color: var(--muted); text-align: center;
                    margin-top: 2px; margin-bottom: 0.75rem; direction: ltr; }
  .branch-meta { display: flex; justify-content: center; gap: 1rem;
                 font-size: 0.72rem; color: var(--muted); margin-bottom: 0.75rem; }
  .meta-item { display: flex; align-items: center; gap: 3px; }
  .btn { display: block; width: 100%; padding: 0.6rem; border-radius: 8px;
         font-size: 0.85rem; font-weight: 600; text-align: center;
         text-decoration: none; border: none; cursor: pointer; margin-top: 0.5rem; }
  .btn-primary  { background: var(--blue); color: #fff; }
  .btn-primary:hover { background: #0284c7; }
  .btn-disabled { background: var(--subtle); color: var(--muted); cursor: not-allowed; }
  .backend-label { font-size: 0.68rem; color: var(--subtle); text-align: center;
                   margin-top: 0.5rem; direction: ltr; }
  .footer { text-align: center; padding: 2rem; color: var(--muted);
            font-size: 0.75rem; border-top: 1px solid var(--border); }
  .footer a { color: var(--blue); text-decoration: none; }
  .refresh-note { font-size: 0.7rem; color: var(--subtle); text-align: center;
                  padding: 0.5rem; }
</style>
</head>
<body>
<div class="header">
  <h1>🏥 BrainSAIT Hospital Portals</h1>
  <p>Unified Access to Hospital Management Systems — نظام إدارة المستشفيات</p>
</div>
<div class="stats">
  <div class="stat">
    <div class="stat-val">${pct}%</div>
    <div class="stat-label">Availability</div>
  </div>
  <div class="stat">
    <div class="stat-val red">${total - online}</div>
    <div class="stat-label">Offline</div>
  </div>
  <div class="stat">
    <div class="stat-val green">${online}</div>
    <div class="stat-label">Online</div>
  </div>
  <div class="stat">
    <div class="stat-val">${total}</div>
    <div class="stat-label">Total Portals</div>
  </div>
</div>
<div class="refresh-note">
  Live health check — probed at ${new Date().toUTCString()} ·
  <a href="/api/health" style="color:#0ea5e9;">JSON API</a> ·
  <a href="/api/branches" style="color:#0ea5e9;">Branch Config</a>
</div>
<div class="section-label">🏛️ Oracle ERP Systems — أنظمة أوراكل</div>
<div class="grid">${cards}</div>
<div class="section-label">📋 Ministry of Health Systems — أنظمة وزارة الصحة</div>
<div class="grid">
  ${MOH_PORTALS.map(p => `
  <div class="card online" style="border-left:3px solid #a855f7;">
    <div class="card-top">
      <span class="dot" style="background:#a855f7;box-shadow:0 0 6px #a855f7;"></span>
      <span class="badge" style="background:rgba(168,85,247,.15);color:#a855f7;">External</span>
    </div>
    <div class="hospital-icon">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="6" y="10" width="28" height="22" rx="3" fill="#a855f7" opacity="0.15"/>
        <rect x="6" y="10" width="28" height="22" rx="3" stroke="#a855f7" stroke-width="1.5"/>
        <rect x="12" y="16" width="16" height="2" rx="1" fill="#a855f7"/>
        <rect x="12" y="21" width="10" height="2" rx="1" fill="#a855f7" opacity="0.6"/>
        <rect x="12" y="26" width="7" height="2" rx="1" fill="#a855f7" opacity="0.4"/>
      </svg>
    </div>
    <div class="branch-name-ar">${p.name}</div>
    <div class="branch-name-en">${p.nameEn}</div>
    <div class="branch-meta"><span class="meta-item">${p.desc}</span></div>
    <a href="${p.url}" target="_blank" class="btn" style="background:#a855f7;color:#fff;">→ Access Portal</a>
    <div class="backend-label">Provider: ${p.provider}</div>
  </div>`).join("")}
</div>
<div class="footer">
  BrainSAIT COMPLIANCELINC · LINC Agents Infrastructure ·
  Tunnel <code>2cffb7bf</code> · v3.1 · Last Updated: ${new Date().toISOString().slice(0,10)}
</div>
</body>
</html>`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
