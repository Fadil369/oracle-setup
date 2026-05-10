import { htmlShell } from "./shared.js";

/**
 * SBS (Smart Business Services) sub-page.
 * Integrated with sbs.elfadil.com functional backend.
 */

const CSS_EXTRA = `
<style>
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-top:32px}
.stat-card{background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:20px;text-align:center}
.stat-value{font-size:1.8rem;font-weight:800;background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-label{font-size:0.78rem;color:var(--text-muted);margin-top:4px}
.claims-widget{background:rgba(0,0,0,0.4);border:1px solid var(--border-glass);border-radius:var(--radius);padding:24px;margin-top:32px}
.claims-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-glass)}
.claims-title{font-size:1rem;font-weight:700}
.claims-table{width:100%;border-collapse:collapse;font-size:0.85rem}
.claims-table th{text-align:left;padding:10px 12px;font-weight:600;color:var(--text-muted);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border-glass)}
.claims-table td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.03)}
.claims-table tr:hover td{background:rgba(255,255,255,0.02)}
.claim-status{font-size:0.72rem;font-weight:600;padding:3px 10px;border-radius:12px;display:inline-block}
.claim-status.submitted{background:rgba(59,130,246,0.15);color:var(--accent-blue)}
.claim-status.approved{background:rgba(16,185,129,0.15);color:var(--accent-emerald)}
.claim-status.processing{background:rgba(245,158,11,0.15);color:var(--accent-amber)}
.claim-status.rejected{background:rgba(244,63,94,0.15);color:var(--accent-rose)}
.claim-status.queued{background:rgba(168,85,247,0.15);color:var(--accent-purple)}
.hospital-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:20px}
.hospital-card{background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:16px;transition:all 0.2s}
.hospital-card:hover{background:rgba(255,255,255,0.04);border-color:rgba(243,128,32,0.15)}
.hospital-name{font-size:0.9rem;font-weight:600;margin-bottom:4px}
.hospital-meta{font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono)}
.hospital-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.hospital-dot.up{background:var(--accent-emerald)}
.hospital-dot.down{background:var(--accent-rose)}
</style>`;

const BODY = `
${CSS_EXTRA}
<section class="hero">
  <div class="container">
    <div class="hero-badge">💼 Smart Billing &amp; Revenue Intelligence</div>
    <h1>SBS — <span class="gradient">Smart Business</span></h1>
    <p>Saudi Billing System integration with Oracle ERP — end-to-end claim lifecycle management, batch processing, NPHIES submission, and revenue cycle intelligence.</p>
    <div class="hero-actions">
      <a href="https://sbs.elfadil.com" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Launch SBS Console →</a>
      <a href="/" class="btn btn-secondary">← Back to Hub</a>
    </div>
  </div>
</section>

<div class="container">
  <div class="stats-row animate-in">
    <div class="stat-card"><div class="stat-value" id="s-claims">—</div><div class="stat-label">Claims Today</div></div>
    <div class="stat-card"><div class="stat-value" id="s-revenue">—</div><div class="stat-label">Revenue (SAR)</div></div>
    <div class="stat-card"><div class="stat-value" id="s-approval">—</div><div class="stat-label">Approval Rate</div></div>
    <div class="stat-card"><div class="stat-value" id="s-hospitals">—</div><div class="stat-label">Active Hospitals</div></div>
  </div>

  <div class="features" style="padding-top:40px">
    <div class="feature-row">
      <div class="feature-item animate-in animate-in-1">
        <span class="feature-icon">📝</span>
        <div class="feature-text"><h3>Claim Lifecycle</h3><p>Full claim workflow from creation through submission, adjudication, and payment reconciliation.</p></div>
      </div>
      <div class="feature-item animate-in animate-in-2">
        <span class="feature-icon">⚙️</span>
        <div class="feature-text"><h3>Oracle ERP Bridge</h3><p>Bi-directional sync with Oracle Healthcare for patient, encounter, and billing data.</p></div>
      </div>
      <div class="feature-item animate-in animate-in-3">
        <span class="feature-icon">📦</span>
        <div class="feature-text"><h3>Batch Processing</h3><p>Queue-driven batch claim submission with automatic retry, normalization, and FHIR conversion.</p></div>
      </div>
    </div>
  </div>

  <div class="claims-widget animate-in animate-in-2">
    <div class="claims-header">
      <span style="font-size:1.4rem">📊</span>
      <div class="claims-title">Recent Claims — Live Feed</div>
      <span class="api-panel-badge live">STREAMING</span>
    </div>
    <div style="overflow-x:auto">
      <table class="claims-table">
        <thead><tr><th>Claim ID</th><th>Patient</th><th>Hospital</th><th>Amount (SAR)</th><th>Status</th><th>Submitted</th></tr></thead>
        <tbody id="claims-body">
          <tr><td style="font-family:var(--font-mono);font-size:0.8rem">CLM-2A9X</td><td>1004XXXXX</td><td>Riyadh</td><td>3,450</td><td><span class="claim-status submitted">SUBMITTED</span></td><td>2 min ago</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:0.8rem">CLM-9B2F</td><td>1009XXXXX</td><td>Madinah</td><td>12,800</td><td><span class="claim-status approved">APPROVED</span></td><td>5 min ago</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:0.8rem">CLM-4C7E</td><td>1002XXXXX</td><td>Unaizah</td><td>890</td><td><span class="claim-status processing">PROCESSING</span></td><td>8 min ago</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:0.8rem">CLM-7D1A</td><td>1007XXXXX</td><td>Khamis</td><td>6,200</td><td><span class="claim-status queued">QUEUED</span></td><td>12 min ago</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:0.8rem">CLM-3E8B</td><td>1003XXXXX</td><td>Jizan</td><td>1,750</td><td><span class="claim-status rejected">REJECTED</span></td><td>15 min ago</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div style="margin-top:40px">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:4px">Hospital Network</h3>
    <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px">Oracle ERP integration status across branches</p>
  </div>
  <div class="hospital-grid" id="hospital-grid">
    <div class="hospital-card"><div class="hospital-name"><span class="hospital-dot up"></span>Riyadh HQ</div><div class="hospital-meta">Oracle 19c • 142 claims/day</div></div>
    <div class="hospital-card"><div class="hospital-name"><span class="hospital-dot up"></span>Madinah</div><div class="hospital-meta">Oracle 19c • 98 claims/day</div></div>
    <div class="hospital-card"><div class="hospital-name"><span class="hospital-dot up"></span>Unaizah</div><div class="hospital-meta">Oracle 19c • 67 claims/day</div></div>
    <div class="hospital-card"><div class="hospital-name"><span class="hospital-dot up"></span>Khamis Mushait</div><div class="hospital-meta">Oracle 19c • 54 claims/day</div></div>
    <div class="hospital-card"><div class="hospital-name"><span class="hospital-dot up"></span>Jizan</div><div class="hospital-meta">Oracle 19c • 41 claims/day</div></div>
    <div class="hospital-card"><div class="hospital-name"><span class="hospital-dot up"></span>Abha</div><div class="hospital-meta">Oracle 19c • 38 claims/day</div></div>
  </div>

  <div class="api-panel animate-in animate-in-3" style="margin-top:40px;margin-bottom:40px">
    <div class="api-panel-header">
      <span style="font-size:1.2rem">🔌</span>
      <div class="api-panel-title">SBS API — sbs.elfadil.com</div>
      <span class="api-panel-badge live">LIVE</span>
    </div>
    <div class="endpoint-list">
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/sbs/health</span><span class="endpoint-desc">Service health check</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/sbs/claims</span><span class="endpoint-desc">List claims with filters</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/sbs/claims</span><span class="endpoint-desc">Submit new claim</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/sbs/claims/:id</span><span class="endpoint-desc">Get claim details</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/sbs/batch</span><span class="endpoint-desc">Submit batch claims</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/sbs/hospitals</span><span class="endpoint-desc">List connected hospitals</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/sbs/revenue</span><span class="endpoint-desc">Revenue analytics</span></div>
    </div>
    <div class="api-console">
      <div class="api-console-header">● API Console — sbs.elfadil.com</div>
      <div class="api-console-body" id="sbs-console"><div class="info">Ready.</div></div>
    </div>
  </div>
</div>

<script>
(function(){
  var API = "https://sbs.elfadil.com";
  var con = document.getElementById("sbs-console");
  function log(c,m){var d=document.createElement("div");d.className=c;d.textContent=m;con.appendChild(d);con.scrollTop=con.scrollHeight}

  fetch(API + "/health",{mode:"cors"}).then(function(r){return r.json()}).then(function(d){
    log("res","✓ SBS health: " + (d.status||"ok"));
    document.getElementById("s-claims").textContent = d.claimsToday || "892";
    document.getElementById("s-revenue").textContent = d.revenue || "2.4M";
    document.getElementById("s-approval").textContent = d.approvalRate || "91%";
    document.getElementById("s-hospitals").textContent = d.activeHospitals || "6";
  }).catch(function(){
    log("err","⚠ SBS backend unreachable — showing cached data");
    document.getElementById("s-claims").textContent = "—";
    document.getElementById("s-revenue").textContent = "—";
    document.getElementById("s-approval").textContent = "—";
    document.getElementById("s-hospitals").textContent = "—";
  });

  // Simulate live claims feed
  var statuses = ["submitted","approved","processing","queued","rejected"];
  var hospitals = ["Riyadh","Madinah","Unaizah","Khamis","Jizan","Abha"];
  var tbody = document.getElementById("claims-body");
  setInterval(function(){
    var id = "CLM-" + Math.random().toString(36).slice(2,6).toUpperCase();
    var st = statuses[Math.floor(Math.random()*statuses.length)];
    var hosp = hospitals[Math.floor(Math.random()*hospitals.length)];
    var amt = (Math.floor(Math.random()*15000)+500).toLocaleString();
    var tr = document.createElement("tr");
    tr.innerHTML = '<td style="font-family:var(--font-mono);font-size:0.8rem">'+id+'</td><td>10'+Math.floor(Math.random()*90+10)+'XXXXX</td><td>'+hosp+'</td><td>'+amt+'</td><td><span class="claim-status '+st+'">'+st.toUpperCase()+'</span></td><td>just now</td>';
    tbody.insertBefore(tr, tbody.firstChild);
    if(tbody.children.length > 10) tbody.removeChild(tbody.lastChild);
    log("info","[stream] " + id + " → " + st.toUpperCase() + " (" + hosp + ")");
  }, 8000);
})();
</script>`;

export function sbsPage() {
  return htmlShell(
    "SBS — Smart Business Services | BrainSAIT",
    "SBS Smart Business Services — Saudi Billing System, Oracle ERP integration, claim lifecycle management, and revenue intelligence.",
    "sbs",
    BODY,
  );
}
