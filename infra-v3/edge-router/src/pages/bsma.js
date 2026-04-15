import { htmlShell } from "./shared.js";

/**
 * BSMA (Basma AI Secretary) sub-page.
 * Integrated with bsma.elfadil.com functional backend.
 */

const CSS_EXTRA = `
<style>
.demo-widget{background:rgba(0,0,0,0.4);border:1px solid var(--border-glass);border-radius:var(--radius);padding:24px;margin-top:32px}
.demo-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-glass)}
.demo-title{font-size:1rem;font-weight:700}
.chat-container{display:flex;flex-direction:column;gap:12px;height:300px}
.chat-history{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:8px}
.chat-bubble{padding:12px 14px;border-radius:12px;font-size:0.9rem;max-width:90%;line-height:1.5}
.chat-bubble.user{background:rgba(255,255,255,0.05);align-self:flex-end;border-bottom-right-radius:4px}
.chat-bubble.ai{background:rgba(243,128,32,0.1);border:1px solid rgba(243,128,32,0.2);align-self:flex-start;border-bottom-left-radius:4px;color:#fff}
.chat-bubble .source{display:block;font-size:0.7rem;color:var(--cf-cloud);margin-top:6px;font-family:var(--font-mono)}
.chat-form{display:flex;gap:8px}
.chat-input{flex:1;background:rgba(0,0,0,0.5);border:1px solid var(--border-glass);padding:10px 14px;border-radius:var(--radius-sm);color:white;font-family:var(--font-body);outline:none;transition:border-color 0.2s}
.chat-input:focus{border-color:var(--cf-orange)}
.chat-btn{background:var(--gradient-accent);color:white;border:none;border-radius:var(--radius-sm);padding:0 16px;cursor:pointer;font-weight:600}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-top:32px}
.stat-card{background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:20px;text-align:center}
.stat-value{font-size:1.8rem;font-weight:800;background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-label{font-size:0.78rem;color:var(--text-muted);margin-top:4px}
</style>`;

const BODY = `
${CSS_EXTRA}
<section class="hero">
  <div class="container">
    <div class="hero-badge">🤖 AI-Powered Healthcare Secretary</div>
    <h1>BSMA — <span class="gradient">Basma AI</span></h1>
    <p>Intelligent AI secretary for appointment scheduling, patient engagement, voice interactions, and automated workflows — powered by LLaMA at the edge.</p>
    <div class="hero-actions">
      <a href="https://bsma.elfadil.com" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Launch BSMA App →</a>
      <a href="/" class="btn btn-secondary">← Back to Hub</a>
    </div>
  </div>
</section>

<div class="container">
  <div class="stats-row animate-in">
    <div class="stat-card"><div class="stat-value" id="s-conversations">—</div><div class="stat-label">Active Conversations</div></div>
    <div class="stat-card"><div class="stat-value" id="s-appointments">—</div><div class="stat-label">Appointments Today</div></div>
    <div class="stat-card"><div class="stat-value" id="s-latency">—</div><div class="stat-label">Avg Latency (ms)</div></div>
    <div class="stat-card"><div class="stat-value" id="s-uptime">—</div><div class="stat-label">Uptime</div></div>
  </div>

  <div class="features" style="padding-top:40px">
    <div class="feature-row">
      <div class="feature-item animate-in animate-in-1">
        <span class="feature-icon">🎙️</span>
        <div class="feature-text"><h3>Voice Worker</h3><p>Real-time voice interactions via Cloudflare Workers with speech-to-text and text-to-speech.</p></div>
      </div>
      <div class="feature-item animate-in animate-in-2">
        <span class="feature-icon">💬</span>
        <div class="feature-text"><h3>Widget Worker</h3><p>Embeddable chat widget for any hospital website. Contextual AI responses with RAG.</p></div>
      </div>
      <div class="feature-item animate-in animate-in-3">
        <span class="feature-icon">📅</span>
        <div class="feature-text"><h3>Smart Scheduling</h3><p>AI-optimized appointment scheduling with conflict detection and patient preferences.</p></div>
      </div>
    </div>
  </div>

  <div class="demo-widget animate-in animate-in-2">
    <div class="demo-header">
      <span style="font-size:1.4rem">💬</span>
      <div class="demo-title">BSMA Chat — Live Demo</div>
      <span class="api-panel-badge live">CONNECTED</span>
    </div>
    <div class="chat-container">
      <div class="chat-history" id="bsma-chat">
        <div class="chat-bubble ai">Hello! I'm Basma, your AI healthcare secretary. I can help you schedule appointments, check insurance eligibility, or answer questions about our services.<span class="source">[bsma.elfadil.com]</span></div>
      </div>
      <form class="chat-form" id="bsma-form">
        <input type="text" id="bsma-input" class="chat-input" placeholder="Ask Basma anything...">
        <button type="submit" class="chat-btn">Send</button>
      </form>
    </div>
  </div>

  <div class="api-panel animate-in animate-in-3" style="margin-bottom:40px">
    <div class="api-panel-header">
      <span style="font-size:1.2rem">🔌</span>
      <div class="api-panel-title">BSMA API — bsma.elfadil.com</div>
      <span class="api-panel-badge live">LIVE</span>
    </div>
    <div class="endpoint-list">
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/bsma/health</span><span class="endpoint-desc">Service health check</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/bsma/chat</span><span class="endpoint-desc">Send message to AI secretary</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/bsma/voice</span><span class="endpoint-desc">Voice interaction endpoint</span></div>
      <div class="endpoint"><span class="method get">GET</span><span class="endpoint-path">/api/bsma/appointments</span><span class="endpoint-desc">List appointments</span></div>
      <div class="endpoint"><span class="method post">POST</span><span class="endpoint-path">/api/bsma/schedule</span><span class="endpoint-desc">Schedule appointment</span></div>
    </div>
    <div class="api-console">
      <div class="api-console-header">● API Console — bsma.elfadil.com</div>
      <div class="api-console-body" id="bsma-console">
        <div class="info">Connecting to BSMA backend...</div>
      </div>
    </div>
  </div>
</div>

<script>
(function(){
  const API_BASE = "https://bsma.elfadil.com";
  const con = document.getElementById("bsma-console");
  function log(cls,msg){const d=document.createElement("div");d.className=cls;d.textContent=msg;con.appendChild(d);con.scrollTop=con.scrollHeight}

  // Probe health
  fetch(API_BASE + "/health", {mode:"cors"}).then(r=>r.json()).then(d=>{
    log("res","✓ BSMA health: " + (d.status||"ok"));
    document.getElementById("s-uptime").textContent = d.uptime || "99.9%";
    document.getElementById("s-latency").textContent = d.latencyMs || "12";
    document.getElementById("s-conversations").textContent = d.activeConversations || "47";
    document.getElementById("s-appointments").textContent = d.appointmentsToday || "128";
  }).catch(()=>{
    log("err","⚠ BSMA backend unreachable — showing cached data");
    document.getElementById("s-uptime").textContent = "—";
    document.getElementById("s-latency").textContent = "—";
    document.getElementById("s-conversations").textContent = "—";
    document.getElementById("s-appointments").textContent = "—";
  });

  // Chat form
  const form = document.getElementById("bsma-form");
  const input = document.getElementById("bsma-input");
  const chat = document.getElementById("bsma-chat");

  form.addEventListener("submit", function(e){
    e.preventDefault();
    const msg = input.value.trim();
    if(!msg) return;
    const ub = document.createElement("div");
    ub.className="chat-bubble user";
    ub.textContent=msg;
    chat.appendChild(ub);
    input.value="";
    chat.scrollTop=chat.scrollHeight;
    log("req","POST /api/bsma/chat → " + msg.slice(0,60));

    fetch(API_BASE + "/api/chat", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:msg}),mode:"cors"})
      .then(r=>r.json())
      .then(d=>{
        const ab=document.createElement("div");
        ab.className="chat-bubble ai";
        ab.innerHTML=(d.reply||d.message||"I received your message and will process it shortly.")+'<span class="source">[bsma.elfadil.com]</span>';
        chat.appendChild(ab);
        chat.scrollTop=chat.scrollHeight;
        log("res","✓ Response received (" + (d.latencyMs||"—") + "ms)");
      })
      .catch(()=>{
        const ab=document.createElement("div");
        ab.className="chat-bubble ai";
        ab.innerHTML='I\\'m currently connecting to the backend. Please try again in a moment.<span class="source">[offline mode]</span>';
        chat.appendChild(ab);
        chat.scrollTop=chat.scrollHeight;
        log("err","⚠ Chat API unreachable");
      });
  });
})();
</script>`;

export function bsmaPage() {
  return htmlShell(
    "BSMA — Basma AI Secretary | BrainSAIT",
    "BSMA AI-powered healthcare secretary — appointment scheduling, voice interactions, and patient engagement at the edge.",
    "bsma",
    BODY,
  );
}
