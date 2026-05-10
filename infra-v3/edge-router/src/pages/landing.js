import { htmlShell } from "./shared.js";

/**
 * Main brainsait.org landing page.
 * Hub connecting to BSMA, GIVC, SBS, GOV sub-pages.
 */

const HERO_SECTION = `
<section class="hero">
  <div class="container">
    <div class="hero-badge">⚡ Edge-Native Healthcare Intelligence Platform</div>
    <h1>Welcome to <br><span class="gradient">BrainSAIT</span></h1>
    <p>Unified healthcare technology platform powering AI-driven billing, insurance validation, smart business services, and government compliance — all at the edge.</p>
    <div class="hero-actions">
      <a href="/sbs" class="btn btn-primary">Explore SBS →</a>
      <a href="/health" class="btn btn-secondary">⚡ System Status</a>
    </div>
  </div>
</section>`;

const SERVICES_SECTION = `
<div class="container">
  <div class="cards-grid">
    <a href="/bsma" class="card animate-in animate-in-1">
      <span class="card-tag">AI Platform</span>
      <span class="card-icon">🤖</span>
      <div class="card-title">BSMA — AI Secretary</div>
      <div class="card-desc">Basma AI-powered secretary for appointment scheduling, patient engagement, and intelligent voice interactions at the healthcare edge.</div>
      <span class="card-link">Open BSMA Dashboard →</span>
    </a>
    <a href="/givc" class="card animate-in animate-in-2">
      <span class="card-tag">Insurance</span>
      <span class="card-icon">🛡️</span>
      <div class="card-title">GIVC — Insurance Validation</div>
      <div class="card-desc">Global Insurance Validation Center providing real-time eligibility checks, pre-authorization workflows, and payer integration via NPHIES.</div>
      <span class="card-link">Open GIVC Portal →</span>
    </a>
    <a href="/sbs" class="card animate-in animate-in-3">
      <span class="card-tag">Billing</span>
      <span class="card-icon">💼</span>
      <div class="card-title">SBS — Smart Business Services</div>
      <div class="card-desc">Saudi Billing System integration with Oracle ERP. End-to-end claim lifecycle management, batch processing, and revenue intelligence.</div>
      <span class="card-link">Open SBS Console →</span>
    </a>
    <a href="/gov" class="card animate-in animate-in-4">
      <span class="card-tag">Compliance</span>
      <span class="card-icon">🏛️</span>
      <div class="card-title">GOV — Government Services</div>
      <div class="card-desc">Government regulatory compliance, NPHIES mandate tracking, ZATCA e-invoicing integration, and MOH reporting automation.</div>
      <span class="card-link">Open GOV Portal →</span>
    </a>
  </div>
</div>`;

const PLATFORM_FEATURES = `
<div class="container">
  <div class="features">
    <div class="features-header">
      <h2>Platform <span class="gradient">Capabilities</span></h2>
      <p>Powered by Cloudflare Workers, D1, KV, R2, Durable Objects, and Workers AI</p>
    </div>
    <div class="feature-row">
      <div class="feature-item animate-in animate-in-1">
        <span class="feature-icon">🌐</span>
        <div class="feature-text">
          <h3>Edge-Native Architecture</h3>
          <p>Sub-millisecond routing with Cloudflare Workers across 300+ global PoPs. Zero cold-start.</p>
        </div>
      </div>
      <div class="feature-item animate-in animate-in-2">
        <span class="feature-icon">🧠</span>
        <div class="feature-text">
          <h3>Workers AI &amp; RAG</h3>
          <p>LLaMA 3.1 + BGE-Base embeddings for intelligent document retrieval and claim analysis.</p>
        </div>
      </div>
      <div class="feature-item animate-in animate-in-3">
        <span class="feature-icon">🔒</span>
        <div class="feature-text">
          <h3>Zero-Trust Security</h3>
          <p>Cloudflare Access policies, API key authentication, HSTS, and CSP headers on every request.</p>
        </div>
      </div>
    </div>
    <div class="feature-row">
      <div class="feature-item animate-in animate-in-3">
        <span class="feature-icon">📊</span>
        <div class="feature-text">
          <h3>Real-Time Observability</h3>
          <p>Prometheus metrics, Loki logs, OpenTelemetry traces, and Grafana dashboards.</p>
        </div>
      </div>
      <div class="feature-item animate-in animate-in-4">
        <span class="feature-icon">🏥</span>
        <div class="feature-text">
          <h3>Multi-Hospital Network</h3>
          <p>Unified control plane managing Oracle ERP across Riyadh, Madinah, Unaizah, and more.</p>
        </div>
      </div>
      <div class="feature-item animate-in animate-in-5">
        <span class="feature-icon">⚡</span>
        <div class="feature-text">
          <h3>FHIR &amp; NPHIES Native</h3>
          <p>Full HL7 FHIR R4 compliance with Saudi NPHIES integration for claims and eligibility.</p>
        </div>
      </div>
    </div>
  </div>
</div>`;

const INTEGRATION_BANNER = `
<div class="container" style="padding-bottom:40px">
  <div class="api-panel">
    <div class="api-panel-header">
      <span style="font-size:1.4rem">🔗</span>
      <div class="api-panel-title">Integrated Domains</div>
      <span class="api-panel-badge live">LIVE</span>
    </div>
    <div class="endpoint-list">
      <div class="endpoint">
        <span class="method get">GET</span>
        <span class="endpoint-path">brainsait.org</span>
        <span class="endpoint-desc">Landing &amp; hub — you are here</span>
      </div>
      <div class="endpoint">
        <span class="method get">API</span>
        <span class="endpoint-path">bsma.elfadil.com</span>
        <span class="endpoint-desc">BSMA functional backend</span>
      </div>
      <div class="endpoint">
        <span class="method get">API</span>
        <span class="endpoint-path">givc.elfadil.com</span>
        <span class="endpoint-desc">GIVC functional backend</span>
      </div>
      <div class="endpoint">
        <span class="method get">API</span>
        <span class="endpoint-path">sbs.elfadil.com</span>
        <span class="endpoint-desc">SBS functional backend</span>
      </div>
      <div class="endpoint">
        <span class="method get">API</span>
        <span class="endpoint-path">gov.elfadil.com</span>
        <span class="endpoint-desc">GOV functional backend</span>
      </div>
    </div>
  </div>
</div>`;

export function landingPage() {
  return htmlShell(
    "BrainSAIT — Edge-Native Healthcare Intelligence",
    "BrainSAIT unified healthcare technology platform — AI billing, insurance validation, smart business services, and government compliance at the edge.",
    "home",
    HERO_SECTION + SERVICES_SECTION + PLATFORM_FEATURES + INTEGRATION_BANNER,
  );
}
