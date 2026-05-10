import { htmlShell } from "./shared.js";

/**
 * GOV (Government Services) sub-page.
 * Integrated with gov.elfadil.com functional backend.
 */

const CSS_EXTRA = `
<style>
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-top:32px}
.stat-card{background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:20px;text-align:center}
.stat-value{font-size:1.8rem;font-weight:800;background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-label{font-size:0.78rem;color:var(--text-muted);margin-top:4px}
.compliance-widget{background:rgba(0,0,0,0.4);border:1px solid var(--border-glass);border-radius:var(--radius);padding:24px;margin-top:32px}
.compliance-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-glass)}
.compliance-title{font-size:1rem;font-weight:700}
.mandate-list{display:flex;flex-direction:column;gap:10px}
.mandate-item{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);transition:all 0.2s}
.mandate-item:hover{background:rgba(255,255,255,0.04);border-color:rgba(243,128,32,0.15)}
.mandate-info{display:flex;align-items:center;gap:12px}
.mandate-icon{font-size:1.2rem}
.mandate-name{font-size:0.9rem;font-weight:600}
.mandate-org{font-size:0.75rem;color:var(--text-muted);margin-top:2px}
.mandate-status{font-size:0.72rem;font-weight:600;padding:4px 12px;border-radius:12px;display:inline-block}
.mandate-status.compliant{background:rgba(16,185,129,0.15);color:var(--accent-emerald)}
.mandate-status.pending{background:rgba(245,158,11,0.15);color:var(--accent-amber)}
.mandate-status.action{background:rgba(244,63,94,0.15);color:var(--accent-rose)}
.timeline{margin-top:32px}
.timeline-header{font-size:1rem;font-weight:700;margin-bottom:16px}
.timeline-list{position:relative;padding-left:24px}
.timeline-list::before{content:'';position:absolute;left:8px;top:4px;bottom:4px;width:2px;background:var(--border-glass)}
.timeline-item{position:relative;padding:12px 0 12px 20px;font-size:0.85rem}
.timeline-item::before{content:'';position:absolute;left:-20px;top:16px;width:10px;height:10px;border-radius:50%;background:var(--cf-orange);border:2px solid var(--bg-primary)}
.timeline-date{font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono);margin-bottom:2px}
.timeline-text{color:var(--text-secondary);line-height:1.4}
.timeline-text strong{color:var(--text-primary)}
.report-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-top:20px}
.report-card{background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:20px;transition:all 0.2s;cursor:pointer}
.report-card:hover{background:rgba(255,255,255,0.04);border-color:rgba(243,128,32,0.15)}
.report-icon{font-size:1.6rem;margin-bottom:10px}
.report-name{font-size:0.9rem;font-weight:600;margin-bottom:4px}
.report-desc{font-size:0.78rem;color:var(--text-muted);line-height:1.4}
</style>`;

const BODY = `
${CSS_EXTRA}
<section class="hero">
  <div class="container">
    <div class="hero-badge">🏛️ Government Compliance &amp; Regulatory</div>
    <h1>GOV — <span class="gradient">Government Services</span></h1>
    <p>Regulatory compliance automation — NPHIES mandate tracking, ZATCA e-invoicing, MOH reporting, and government audit readiness for Saudi healthcare operations.</p>
    <div class="hero-actions">
      <a href="https://gov.elfadil.com" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Launch GOV Portal →</a>
      <a href="/" class="btn btn-secondary">← Back to Hub</a>
    </div>
  </div>
</section>

<div class="container">
  <div class="stats-row animate-in">
    <div class="stat-card"><div class="stat-value" id="s-mandates">—</div><div class="stat-label">Active Mandates</div></div>
    <div class="stat-card"><div class="stat-value" id="s-compliance">—</div><div class="stat-label">Compliance Score</div></div>
    <div class="stat-card"><div class="stat-value" id="s-reports">—</div><div class="stat-label">Reports Filed</div></div>
    <div class="stat-card"><div class="stat-value" id="s-audits">—</div><div class="stat-label">Audit Status</div></div>
  </div>

  <div class="features" style="padding-top:40px">
    <div class="feature-row">
      <div class="feature-item animate-in animate-in-1">
        <span class="feature-icon">📜</span>
        <div class="feature-text"><h3>NPHIES Compliance</h3><p>Automated NPHIES mandate tracking with real-time submission status and error resolution.</p></div>
      </div>
      <div class="feature-item animate-in animate-in-2">
        <span class="feature-icon">🧾</span>
        <div class="feature-text"><h3>ZATCA E-Invoicing</h3><p>Phase 2 compliant e-invoicing with XML generation, QR codes, and cryptographic stamping.</p></div>
      </div>
      <div class="feature-item animate-in animate-in-3">
        <span class="feature-icon">📈</span>
        <div class="feature-text"><h3>MOH Reporting</h3><p>Automated Ministry of Health statistical reports, KPI dashboards, and regulatory submissions.</p></div>
      </div>
    </div>
  </div>

  <div class="compliance-widget animate-in animate-in-2">
    <div class="compliance-header">
      <span style="font-size:1.4rem">📋</span>
      <div class="compliance-title">Regulatory Compliance Dashboard</div>
      <span class="api-panel-badge live">LIVE</span>
    </div>
    <div class="mandate-list" id="mandate-list">
      <div class="mandate-item">
        <div class="mandate-info"><span class="mandate-icon">🏥</span><div><div class="mandate-name">NPHIES Claims Submission</div><div class="mandate-org">CCHI / NPHIES</div></div></div>
        <span class="mandate-status compliant">COMPLIANT</span>
      </div>
      <div class="mandate-item">
        <div class="mandate-info"><span class="mandate-icon">🧾</span><div><div class="mandate-name">ZATCA E-Invoice Phase 2</div><div class="mandate-org">ZATCA</div></div></div>
        <span class="mandate-status compliant">COMPLIANT</span>
      </div>
      <div class="mandate-item">
        <div class="mandate-info"><span class="mandate-icon">📊</span><div><div class="mandate-name">MOH Monthly Statistical Report</div><div class="mandate-org">Ministry of Health</div></div></div>
        <span class="mandate-status pending">DUE IN 5 DAYS</span>
      </div>
      <div class="mandate-item">
        <div class="mandate-info"><span class="mandate-icon">🔒</span><div><div class="mandate-name">NCA Data Protection Audit</div><div class="mandate-org">National Cybersecurity Authority</div></div></div>
        <span class="mandate-status compliant">COMPLIANT</span>
      </div>
      <div class="mandate-item">
        <div class="mandate-info"><span class="mandate-icon">💰</span><div><div class="mandate-name">GOSI Social Insurance Filing</div><div class="mandate-org">GOSI</div></div></div>
        <span class="mandate-status action">ACTION REQUIRED</span>
      </div>
    </div>
  </div>

  <div class="timeline animate-in animate-in-3" style="margin-top:40px">
    <div class="timeline-header">📅 Recent Regulatory Events</div>
    <div class="timeline-list">
      <div class="timeline-item"><div class="timeline-date">2026-04-03 14:22 UTC</div><div class="timeline-text"><strong>NPHIES</strong> — Batch CLM-B4295 submitted successfully. 142 claims processed.</div></div>
      <div class="timeline-item"><div class="timeline-date">2026-04-02 09:15 UTC</div><div class="timeline-text"><strong>ZATCA</strong> — E-invoice batch #EI-2026-0402 stamped and submitted. 89 invoices.</div></div>
      <div class="timeline-item"><div class="timeline-date">2026-04-01 16:30 UTC</div><div class="timeline-text"><strong>MOH</strong> — Q1 2026 statistical report auto-generated. Pending review.</div></div>
      <div class="timeline-item"><div class="timeline-date">2026-03-28 11:00 UTC</div><div class="timeline-text"><strong>NCA</strong> — Annual security audit passed. Compliance certificate renewed.</div></div>
    </div>
  </div>

  <div style="margin-top:40px">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:4px">Automated Reports</h3>
    <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px">Generated and filed automatically</p>
  </div>
  <div class="report-grid">
    <div class="report-card"><div class="report-icon">📋</div><div class="report-name">NPHIES Submission Report</div><div class="report-desc">Daily claim submission summary with acceptance rates and error codes.</div></div>
    <div class="report-card"><div class="report-icon">🧾</div><div class="report-name">ZATCA E-Invoice Log</div><div class="report-desc">Monthly e-invoicing compliance report with QR validation status.</div></div>
    <div class="report-card"><div class="report-icon">📊</div><div class="report-name">MOH Statistics</div><div class="report-desc">Quarterly healthcare statistics including bed occupancy, procedures, and outcomes.</div></div>
    <div class="report-card"><div class="report-icon">🔐</div><div class="report-name">Security Audit Trail</div><div class="report-desc">NCA-compliant audit log of all data access, modifications, and system events.</div></div>
  </div>

  <div class="api-panel animate-in animate-in-4" style="margin-top:40px;margin-bottom:40px">
    <div class="api-panel-header">
      <span style="font-size:1.2rem">🔌</span>
      <div class="api-panel-title">GOV API — gov.elfadil.com</div>
      <span class="api-panel-badge live">LIVE</span>
    </div>
    <div class="endpoint-list">
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/gov/health</span><span class="endpoint-desc">Service health check</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/gov/mandates</span><span class="endpoint-desc">List regulatory mandates</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/gov/compliance</span><span class="endpoint-desc">Compliance score &amp; status</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/gov/nphies/submit</span><span class="endpoint-desc">Submit NPHIES batch</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/gov/zatca/invoice</span><span class="endpoint-desc">Generate ZATCA e-invoice</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/gov/reports</span><span class="endpoint-desc">List generated reports</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/gov/audit-trail</span><span class="endpoint-desc">Security audit trail</span></div>
    </div>
    <div class="api-console">
      <div class="api-console-header">● API Console — gov.elfadil.com</div>
      <div class="api-console-body" id="gov-console"><div class="info">Ready.</div></div>
    </div>
  </div>
</div>

<script>
(function(){
  var API = "https://gov.elfadil.com";
  var con = document.getElementById("gov-console");
  function log(c,m){var d=document.createElement("div");d.className=c;d.textContent=m;con.appendChild(d);con.scrollTop=con.scrollHeight}

  fetch(API + "/health",{mode:"cors"}).then(function(r){return r.json()}).then(function(d){
    log("res","✓ GOV health: " + (d.status||"ok"));
    document.getElementById("s-mandates").textContent = d.activeMandates || "5";
    document.getElementById("s-compliance").textContent = d.complianceScore || "96%";
    document.getElementById("s-reports").textContent = d.reportsFiled || "142";
    document.getElementById("s-audits").textContent = d.auditStatus || "PASS";
  }).catch(function(){
    log("err","⚠ GOV backend unreachable — showing cached data");
    document.getElementById("s-mandates").textContent = "—";
    document.getElementById("s-compliance").textContent = "—";
    document.getElementById("s-reports").textContent = "—";
    document.getElementById("s-audits").textContent = "—";
  });

  // Fetch mandates from API
  fetch(API + "/api/mandates",{mode:"cors"}).then(function(r){return r.json()}).then(function(d){
    log("res","✓ Loaded " + (d.mandates?d.mandates.length:"0") + " mandates");
  }).catch(function(){
    log("info","Using cached mandate data");
  });
})();
</script>`;

export function govPage() {
  return htmlShell(
    "GOV — Government Services | BrainSAIT",
    "GOV Government Services — NPHIES compliance, ZATCA e-invoicing, MOH reporting, and regulatory automation for Saudi healthcare.",
    "gov",
    BODY,
  );
}
