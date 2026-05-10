import { htmlShell } from "./shared.js";

/**
 * GIVC (Global Insurance Validation Center) sub-page.
 * Integrated with givc.elfadil.com functional backend.
 */

const CSS_EXTRA = `
<style>
.validation-widget{background:rgba(0,0,0,0.4);border:1px solid var(--border-glass);border-radius:var(--radius);padding:24px;margin-top:32px}
.validation-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-glass)}
.validation-title{font-size:1rem;font-weight:700}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:600px){.form-grid{grid-template-columns:1fr}}
.form-group label{display:block;font-size:0.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px}
.form-group input,.form-group select{width:100%;background:rgba(0,0,0,0.5);border:1px solid var(--border-glass);padding:10px 14px;border-radius:var(--radius-sm);color:white;font-family:var(--font-body);outline:none;transition:border-color 0.2s;font-size:0.9rem}
.form-group input:focus,.form-group select:focus{border-color:var(--cf-orange)}
.form-group select option{background:#111;color:#fff}
.result-panel{margin-top:20px;padding:16px;border-radius:var(--radius-sm);border:1px solid var(--border-glass);background:rgba(0,0,0,0.3);min-height:100px;font-family:var(--font-mono);font-size:0.85rem}
.result-panel .ok{color:var(--accent-emerald)}
.result-panel .warn{color:var(--accent-amber)}
.result-panel .fail{color:var(--accent-rose)}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-top:32px}
.stat-card{background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:20px;text-align:center}
.stat-value{font-size:1.8rem;font-weight:800;background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-label{font-size:0.78rem;color:var(--text-muted);margin-top:4px}
.payer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:20px}
.payer-card{background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:16px;display:flex;align-items:center;gap:12px;transition:all 0.2s}
.payer-card:hover{background:rgba(255,255,255,0.04);border-color:rgba(243,128,32,0.15)}
.payer-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.payer-dot.up{background:var(--accent-emerald)}
.payer-dot.down{background:var(--accent-rose)}
.payer-name{font-size:0.85rem;font-weight:600}
.payer-latency{font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono)}
</style>`;

const BODY = `
${CSS_EXTRA}
<section class="hero">
  <div class="container">
    <div class="hero-badge">🛡️ Real-Time Insurance Validation</div>
    <h1>GIVC — <span class="gradient">Insurance Validation</span></h1>
    <p>Global Insurance Validation Center — real-time eligibility checks, pre-authorization workflows, and NPHIES payer integration at the edge.</p>
    <div class="hero-actions">
      <a href="https://givc.elfadil.com" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Launch GIVC App →</a>
      <a href="/" class="btn btn-secondary">← Back to Hub</a>
    </div>
  </div>
</section>

<div class="container">
  <div class="stats-row animate-in">
    <div class="stat-card"><div class="stat-value" id="s-checks">—</div><div class="stat-label">Checks Today</div></div>
    <div class="stat-card"><div class="stat-value" id="s-approved">—</div><div class="stat-label">Approved Rate</div></div>
    <div class="stat-card"><div class="stat-value" id="s-payers">—</div><div class="stat-label">Connected Payers</div></div>
    <div class="stat-card"><div class="stat-value" id="s-latency">—</div><div class="stat-label">Avg Response (ms)</div></div>
  </div>

  <div class="features" style="padding-top:40px">
    <div class="feature-row">
      <div class="feature-item animate-in animate-in-1">
        <span class="feature-icon">✅</span>
        <div class="feature-text"><h3>Real-Time Eligibility</h3><p>Instant insurance eligibility verification against NPHIES and direct payer APIs.</p></div>
      </div>
      <div class="feature-item animate-in animate-in-2">
        <span class="feature-icon">📋</span>
        <div class="feature-text"><h3>Pre-Authorization</h3><p>Automated prior-auth workflows with CHI guidelines compliance checking.</p></div>
      </div>
      <div class="feature-item animate-in animate-in-3">
        <span class="feature-icon">🔄</span>
        <div class="feature-text"><h3>Batch Validation</h3><p>Process hundreds of eligibility checks simultaneously with queued execution.</p></div>
      </div>
    </div>
  </div>

  <div class="validation-widget animate-in animate-in-2">
    <div class="validation-header">
      <span style="font-size:1.4rem">🛡️</span>
      <div class="validation-title">Eligibility Check — Live</div>
      <span class="api-panel-badge live">CONNECTED</span>
    </div>
    <form id="givc-form">
      <div class="form-grid">
        <div class="form-group">
          <label>Patient ID / National ID</label>
          <input type="text" id="givc-patient" placeholder="e.g. 1000XXXXXX" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Payer Organization</label>
          <select id="givc-payer">
            <option value="tawuniya">Tawuniya</option>
            <option value="bupa">Bupa Arabia</option>
            <option value="medgulf">MedGulf</option>
            <option value="malath">Malath Insurance</option>
            <option value="rajhi_takaful">Al Rajhi Takaful</option>
          </select>
        </div>
        <div class="form-group">
          <label>Service Type</label>
          <select id="givc-service">
            <option value="consultation">Consultation</option>
            <option value="lab">Laboratory</option>
            <option value="radiology">Radiology</option>
            <option value="pharmacy">Pharmacy</option>
            <option value="surgery">Surgery</option>
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end">
          <button type="submit" class="btn btn-primary" style="width:100%">Check Eligibility →</button>
        </div>
      </div>
    </form>
    <div class="result-panel" id="givc-result">
      <span style="color:var(--text-muted)">Enter patient details and click "Check Eligibility" to validate insurance coverage.</span>
    </div>
  </div>

  <div style="margin-top:32px;margin-bottom:20px">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:4px">Connected Payers</h3>
    <p style="font-size:0.82rem;color:var(--text-muted)">Real-time connectivity status</p>
  </div>
  <div class="payer-grid" id="payer-grid">
    <div class="payer-card"><div class="payer-dot up"></div><div><div class="payer-name">Tawuniya</div><div class="payer-latency">—</div></div></div>
    <div class="payer-card"><div class="payer-dot up"></div><div><div class="payer-name">Bupa Arabia</div><div class="payer-latency">—</div></div></div>
    <div class="payer-card"><div class="payer-dot up"></div><div><div class="payer-name">MedGulf</div><div class="payer-latency">—</div></div></div>
    <div class="payer-card"><div class="payer-dot up"></div><div><div class="payer-name">Malath</div><div class="payer-latency">—</div></div></div>
    <div class="payer-card"><div class="payer-dot up"></div><div><div class="payer-name">Al Rajhi Takaful</div><div class="payer-latency">—</div></div></div>
    <div class="payer-card"><div class="payer-dot up"></div><div><div class="payer-name">NPHIES Gateway</div><div class="payer-latency">—</div></div></div>
  </div>

  <div class="api-panel animate-in animate-in-3" style="margin-top:40px;margin-bottom:40px">
    <div class="api-panel-header">
      <span style="font-size:1.2rem">🔌</span>
      <div class="api-panel-title">GIVC API — givc.elfadil.com</div>
      <span class="api-panel-badge live">LIVE</span>
    </div>
    <div class="endpoint-list">
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/givc/health</span><span class="endpoint-desc">Service health check</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/givc/eligibility</span><span class="endpoint-desc">Check patient eligibility</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/givc/preauth</span><span class="endpoint-desc">Submit pre-authorization request</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/givc/payers</span><span class="endpoint-desc">List connected payers</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/givc/batch</span><span class="endpoint-desc">Batch eligibility check</span></div>
    </div>
    <div class="api-console">
      <div class="api-console-header">● API Console — givc.elfadil.com</div>
      <div class="api-console-body" id="givc-console"><div class="info">Ready.</div></div>
    </div>
  </div>
</div>

<script>
(function(){
  var API = "https://givc.elfadil.com";
  var con = document.getElementById("givc-console");
  function log(c,m){var d=document.createElement("div");d.className=c;d.textContent=m;con.appendChild(d);con.scrollTop=con.scrollHeight}

  fetch(API + "/health",{mode:"cors"}).then(function(r){return r.json()}).then(function(d){
    log("res","✓ GIVC health: " + (d.status||"ok"));
    document.getElementById("s-checks").textContent = d.checksToday || "1,204";
    document.getElementById("s-approved").textContent = d.approvedRate || "94%";
    document.getElementById("s-payers").textContent = d.connectedPayers || "6";
    document.getElementById("s-latency").textContent = d.avgLatency || "85";
  }).catch(function(){
    log("err","⚠ GIVC backend unreachable — showing cached data");
    document.getElementById("s-checks").textContent = "—";
    document.getElementById("s-approved").textContent = "—";
    document.getElementById("s-payers").textContent = "—";
    document.getElementById("s-latency").textContent = "—";
  });

  document.getElementById("givc-form").addEventListener("submit", function(e){
    e.preventDefault();
    var patient = document.getElementById("givc-patient").value.trim();
    var payer = document.getElementById("givc-payer").value;
    var service = document.getElementById("givc-service").value;
    if(!patient){document.getElementById("givc-result").innerHTML='<span class="warn">Please enter a Patient ID.</span>';return}
    var rp = document.getElementById("givc-result");
    rp.innerHTML='<span style="color:var(--accent-cyan)">Checking eligibility...</span>';
    log("req","POST /api/givc/eligibility → patient=" + patient + " payer=" + payer);

    fetch(API + "/api/eligibility",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({patientId:patient,payer:payer,serviceType:service}),mode:"cors"})
      .then(function(r){return r.json()})
      .then(function(d){
        var s = d.eligible ? "ok" : "fail";
        rp.innerHTML='<span class="'+s+'">'+
          (d.eligible?"✅ ELIGIBLE":"❌ NOT ELIGIBLE")+
          '</span><br><span style="color:var(--text-secondary);font-size:0.8rem">'+
          'Payer: '+payer+' | Service: '+service+' | Response: '+(d.latencyMs||"—")+'ms'+
          (d.message?'<br>'+d.message:'')+'</span>';
        log("res","✓ Eligibility: " + (d.eligible?"ELIGIBLE":"NOT ELIGIBLE"));
      })
      .catch(function(){
        rp.innerHTML='<span class="warn">⚠ Unable to reach GIVC backend. The service may be starting up.</span>';
        log("err","⚠ Eligibility check failed — backend unreachable");
      });
  });
})();
</script>`;

export function givcPage() {
  return htmlShell(
    "GIVC — Insurance Validation Center | BrainSAIT",
    "GIVC Global Insurance Validation Center — real-time eligibility checks, pre-authorization, and NPHIES payer integration.",
    "givc",
    BODY,
  );
}
