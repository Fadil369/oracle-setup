// ═══════════════════════════════════════════════════════════════════════════
// BrainSAIT Portals v5 — Enhanced Render Functions
// Drop-in replacement for renderLandingPage, renderServiceEntryPage, renderStatusPage
// Preserves ALL existing data contracts, snapshot shapes, and function signatures
// ═══════════════════════════════════════════════════════════════════════════

// ─── Shared Design System ───────────────────────────────────────────────
function getDesignSystem() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

    :root {
      --bs-void: #050810;
      --bs-deep: #0a0e1a;
      --bs-navy: #0f1629;
      --bs-surface: #141b2d;
      --bs-card: #1a2236;
      --bs-border: rgba(255,255,255,0.06);
      --bs-border-glow: rgba(212,165,116,0.15);
      --bs-gold: #d4a574;
      --bs-gold-bright: #e8c49a;
      --bs-teal: #0ea5e9;
      --bs-teal-dim: rgba(14,165,233,0.15);
      --bs-medical: #2b6cb8;
      --bs-emerald: #10b981;
      --bs-rose: #f43f5e;
      --bs-amber: #f59e0b;
      --bs-text: #e2e8f0;
      --bs-text-dim: #94a3b8;
      --bs-text-muted: #64748b;
      --bs-glass: rgba(20,27,45,0.7);
      --bs-glass-hover: rgba(26,34,54,0.85);
      --bs-radius: 16px;
      --bs-radius-sm: 10px;
      --bs-radius-xs: 6px;
      --bs-font-display: 'Syne', sans-serif;
      --bs-font-arabic: 'IBM Plex Sans Arabic', sans-serif;
      --bs-font-mono: 'JetBrains Mono', monospace;
      --bs-font-body: 'IBM Plex Sans Arabic', 'Syne', sans-serif;
      --bs-shadow: 0 4px 30px rgba(0,0,0,0.4);
      --bs-shadow-glow: 0 0 40px rgba(212,165,116,0.08);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html {
      scroll-behavior: smooth;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      background: var(--bs-void);
      color: var(--bs-text);
      font-family: var(--bs-font-body);
      font-size: 15px;
      line-height: 1.65;
      overflow-x: hidden;
      min-height: 100vh;
    }

    /* ─── Particle Canvas ─── */
    #particle-canvas {
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 0;
      pointer-events: none;
    }

    /* ─── Ambient Glow Orbs ─── */
    .ambient-orb {
      position: fixed;
      border-radius: 50%;
      filter: blur(120px);
      opacity: 0.12;
      pointer-events: none;
      z-index: 0;
    }
    .orb-gold { width: 500px; height: 500px; background: var(--bs-gold); top: -10%; right: -5%; animation: orbFloat 25s ease-in-out infinite; }
    .orb-teal { width: 400px; height: 400px; background: var(--bs-teal); bottom: 10%; left: -8%; animation: orbFloat 30s ease-in-out infinite reverse; }
    .orb-medical { width: 350px; height: 350px; background: var(--bs-medical); top: 50%; right: 30%; animation: orbFloat 20s ease-in-out infinite 5s; }

    @keyframes orbFloat {
      0%, 100% { transform: translate(0, 0) scale(1); }
      25% { transform: translate(30px, -40px) scale(1.1); }
      50% { transform: translate(-20px, 20px) scale(0.95); }
      75% { transform: translate(15px, 30px) scale(1.05); }
    }

    /* ─── Layout ─── */
    .page-wrapper {
      position: relative;
      z-index: 1;
      min-height: 100vh;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .container-wide {
      max-width: 1440px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ─── Top Bar ─── */
    .top-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px) saturate(1.4);
      -webkit-backdrop-filter: blur(20px) saturate(1.4);
      background: rgba(5,8,16,0.75);
      border-bottom: 1px solid var(--bs-border);
      padding: 0 24px;
    }
    .top-bar-inner {
      max-width: 1440px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
    }
    .top-bar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--bs-text);
    }
    .brand-mark {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, var(--bs-gold), var(--bs-teal));
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--bs-font-display);
      font-weight: 800;
      font-size: 16px;
      color: var(--bs-void);
    }
    .brand-text {
      font-family: var(--bs-font-display);
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.5px;
    }
    .brand-dot {
      color: var(--bs-gold);
      font-size: 11px;
      margin-left: 6px;
      opacity: 0.7;
    }
    .top-bar-nav {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .top-bar-nav a {
      color: var(--bs-text-dim);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: var(--bs-radius-xs);
      transition: all 0.2s;
      font-family: var(--bs-font-display);
      letter-spacing: 0.3px;
    }
    .top-bar-nav a:hover { color: var(--bs-gold-bright); background: rgba(212,165,116,0.06); }
    .top-bar-nav a.active { color: var(--bs-gold); background: rgba(212,165,116,0.1); }

    @media (max-width: 768px) {
      .top-bar-nav { display: none; }
    }

    /* ─── Hero ─── */
    .hero {
      padding: 100px 0 60px;
      position: relative;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      background: rgba(212,165,116,0.08);
      border: 1px solid rgba(212,165,116,0.15);
      border-radius: 100px;
      font-size: 12px;
      font-weight: 600;
      color: var(--bs-gold);
      font-family: var(--bs-font-display);
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 28px;
      animation: fadeSlideUp 0.6s ease-out;
    }
    .hero-badge .pulse-dot {
      width: 6px; height: 6px;
      background: var(--bs-emerald);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    .hero h1 {
      font-family: var(--bs-font-display);
      font-size: clamp(36px, 5vw, 64px);
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -1px;
      margin-bottom: 24px;
      animation: fadeSlideUp 0.6s ease-out 0.1s both;
    }
    .hero h1 .gold { color: var(--bs-gold); }
    .hero h1 .teal { color: var(--bs-teal); }
    .hero-sub {
      font-size: 17px;
      color: var(--bs-text-dim);
      max-width: 680px;
      line-height: 1.75;
      margin-bottom: 40px;
      animation: fadeSlideUp 0.6s ease-out 0.2s both;
    }
    .hero-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      animation: fadeSlideUp 0.6s ease-out 0.3s both;
    }

    /* ─── Buttons ─── */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: var(--bs-radius-sm);
      font-family: var(--bs-font-display);
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      transition: all 0.3s;
      cursor: pointer;
      border: none;
      letter-spacing: 0.3px;
    }
    .btn-gold {
      background: linear-gradient(135deg, var(--bs-gold), #c4955a);
      color: var(--bs-void);
      box-shadow: 0 4px 20px rgba(212,165,116,0.25);
    }
    .btn-gold:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(212,165,116,0.35);
    }
    .btn-outline {
      background: transparent;
      color: var(--bs-text-dim);
      border: 1px solid var(--bs-border);
    }
    .btn-outline:hover {
      color: var(--bs-gold-bright);
      border-color: rgba(212,165,116,0.3);
      background: rgba(212,165,116,0.04);
    }
    .btn-teal {
      background: linear-gradient(135deg, var(--bs-teal), #0284c7);
      color: white;
      box-shadow: 0 4px 20px rgba(14,165,233,0.2);
    }
    .btn-teal:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(14,165,233,0.3);
    }

    /* ─── Section Headers ─── */
    .section {
      padding: 80px 0;
    }
    .section-label {
      font-family: var(--bs-font-display);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--bs-gold);
      margin-bottom: 12px;
      opacity: 0.8;
    }
    .section-title {
      font-family: var(--bs-font-display);
      font-size: clamp(24px, 3vw, 36px);
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 16px;
    }
    .section-desc {
      color: var(--bs-text-dim);
      max-width: 600px;
      font-size: 15px;
      line-height: 1.7;
      margin-bottom: 48px;
    }

    /* ─── Glass Cards ─── */
    .glass-card {
      background: var(--bs-glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius);
      padding: 28px;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    .glass-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(212,165,116,0.2), transparent);
      opacity: 0;
      transition: opacity 0.35s;
    }
    .glass-card:hover {
      border-color: var(--bs-border-glow);
      transform: translateY(-4px);
      box-shadow: var(--bs-shadow-glow);
    }
    .glass-card:hover::before { opacity: 1; }

    .glass-card-link {
      text-decoration: none;
      color: inherit;
      display: block;
    }

    /* ─── Interface Cards (4-lane grid) ─── */
    .lanes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    .lane-card {
      background: var(--bs-glass);
      backdrop-filter: blur(16px);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius);
      overflow: hidden;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
    }
    .lane-card::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 2px;
      background: var(--lane-accent, var(--bs-gold));
      opacity: 0;
      transition: opacity 0.3s;
    }
    .lane-card:hover { border-color: var(--bs-border-glow); transform: translateY(-4px); box-shadow: var(--bs-shadow-glow); }
    .lane-card:hover::after { opacity: 1; }

    .lane-header {
      padding: 24px 24px 0;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .lane-icon {
      width: 44px; height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .lane-icon.patient { background: linear-gradient(135deg, rgba(212,165,116,0.15), rgba(212,165,116,0.05)); color: var(--bs-gold); }
    .lane-icon.provider { background: linear-gradient(135deg, rgba(14,165,233,0.15), rgba(14,165,233,0.05)); color: var(--bs-teal); }
    .lane-icon.payer { background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05)); color: var(--bs-emerald); }
    .lane-icon.government { background: linear-gradient(135deg, rgba(43,108,184,0.15), rgba(43,108,184,0.05)); color: var(--bs-medical); }
    .lane-icon.service { background: linear-gradient(135deg, rgba(148,163,184,0.1), rgba(148,163,184,0.03)); color: var(--bs-text-dim); }

    .lane-tag {
      font-family: var(--bs-font-display);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--bs-text-muted);
    }
    .lane-body {
      padding: 16px 24px 24px;
    }
    .lane-title {
      font-family: var(--bs-font-display);
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--bs-text);
    }
    .lane-desc {
      font-size: 13.5px;
      color: var(--bs-text-dim);
      line-height: 1.65;
      margin-bottom: 16px;
    }
    .lane-features {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 20px;
    }
    .lane-feature {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: var(--bs-text-muted);
    }
    .lane-feature .dot {
      width: 4px; height: 4px;
      border-radius: 50%;
      background: var(--bs-gold);
      opacity: 0.5;
      flex-shrink: 0;
    }
    .lane-route {
      font-family: var(--bs-font-mono);
      font-size: 11.5px;
      color: var(--bs-text-muted);
      padding: 6px 10px;
      background: rgba(255,255,255,0.03);
      border-radius: var(--bs-radius-xs);
      display: inline-block;
    }
    .lane-cta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 24px;
      border-top: 1px solid var(--bs-border);
      font-family: var(--bs-font-display);
      font-size: 13px;
      font-weight: 600;
      color: var(--bs-gold);
      text-decoration: none;
      transition: all 0.2s;
    }
    .lane-cta:hover { background: rgba(212,165,116,0.04); }
    .lane-cta .arrow { transition: transform 0.2s; }
    .lane-cta:hover .arrow { transform: translateX(4px); }

    /* ─── Metric Tiles ─── */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 48px;
    }
    .metric-tile {
      background: var(--bs-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius-sm);
      padding: 20px;
      position: relative;
      overflow: hidden;
    }
    .metric-tile::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 3px; height: 100%;
      background: var(--metric-color, var(--bs-gold));
      border-radius: 0 2px 2px 0;
    }
    .metric-label {
      font-family: var(--bs-font-display);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--bs-text-muted);
      margin-bottom: 8px;
    }
    .metric-value {
      font-family: var(--bs-font-display);
      font-size: 28px;
      font-weight: 800;
      color: var(--bs-text);
      line-height: 1;
      margin-bottom: 4px;
    }
    .metric-sub {
      font-size: 12px;
      color: var(--bs-text-muted);
    }
    .metric-pulse {
      position: absolute;
      top: 16px; right: 16px;
      width: 8px; height: 8px;
      border-radius: 50%;
      animation: pulse 2.5s infinite;
    }
    .pulse-ok { background: var(--bs-emerald); box-shadow: 0 0 8px rgba(16,185,129,0.4); }
    .pulse-warn { background: var(--bs-amber); box-shadow: 0 0 8px rgba(245,158,11,0.4); }
    .pulse-crit { background: var(--bs-rose); box-shadow: 0 0 8px rgba(244,63,94,0.4); }

    /* ─── Stack Layers ─── */
    .stack-layers {
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: var(--bs-border);
      border-radius: var(--bs-radius);
      overflow: hidden;
      margin-top: 48px;
    }
    .stack-layer {
      background: var(--bs-glass);
      padding: 28px 32px;
      display: flex;
      align-items: flex-start;
      gap: 24px;
      transition: background 0.2s;
    }
    .stack-layer:hover { background: var(--bs-glass-hover); }
    .stack-num {
      font-family: var(--bs-font-display);
      font-size: 11px;
      font-weight: 800;
      color: var(--bs-gold);
      background: rgba(212,165,116,0.1);
      padding: 4px 10px;
      border-radius: var(--bs-radius-xs);
      flex-shrink: 0;
      letter-spacing: 0.5px;
    }
    .stack-content h4 {
      font-family: var(--bs-font-display);
      font-weight: 700;
      font-size: 16px;
      margin-bottom: 4px;
    }
    .stack-content p {
      color: var(--bs-text-dim);
      font-size: 13.5px;
    }

    /* ─── Footer ─── */
    .footer {
      border-top: 1px solid var(--bs-border);
      padding: 32px 24px;
      text-align: center;
      font-size: 12px;
      color: var(--bs-text-muted);
    }
    .footer-links {
      display: flex;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .footer-links a {
      color: var(--bs-text-dim);
      text-decoration: none;
      font-size: 12px;
      transition: color 0.2s;
    }
    .footer-links a:hover { color: var(--bs-gold); }

    /* ─── Animations ─── */
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .stagger-1 { animation: fadeSlideUp 0.5s ease-out 0.05s both; }
    .stagger-2 { animation: fadeSlideUp 0.5s ease-out 0.1s both; }
    .stagger-3 { animation: fadeSlideUp 0.5s ease-out 0.15s both; }
    .stagger-4 { animation: fadeSlideUp 0.5s ease-out 0.2s both; }
    .stagger-5 { animation: fadeSlideUp 0.5s ease-out 0.25s both; }
    .stagger-6 { animation: fadeSlideUp 0.5s ease-out 0.3s both; }
    .stagger-7 { animation: fadeSlideUp 0.5s ease-out 0.35s both; }
    .stagger-8 { animation: fadeSlideUp 0.5s ease-out 0.4s both; }
    .stagger-9 { animation: fadeSlideUp 0.5s ease-out 0.45s both; }
    .stagger-10 { animation: fadeSlideUp 0.5s ease-out 0.5s both; }

    /* ─── Responsive ─── */
    @media (max-width: 768px) {
      .hero { padding: 60px 0 40px; }
      .hero h1 { font-size: 28px; }
      .lanes-grid { grid-template-columns: 1fr; }
      .metrics-grid { grid-template-columns: repeat(2, 1fr); }
      .stack-layer { flex-direction: column; gap: 12px; }
    }

    /* ─── Sub-page specific ─── */
    .sub-hero {
      padding: 80px 0 40px;
    }
    .sub-hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 14px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    .sub-hero h1 {
      font-family: var(--bs-font-display);
      font-size: clamp(28px, 4vw, 48px);
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 16px;
    }
    .sub-hero-desc {
      font-size: 16px;
      color: var(--bs-text-dim);
      max-width: 560px;
      line-height: 1.7;
      margin-bottom: 32px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 40px;
    }
    .info-chip {
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius-xs);
      padding: 12px 16px;
    }
    .info-chip-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--bs-text-muted);
      margin-bottom: 4px;
    }
    .info-chip-value {
      font-family: var(--bs-font-display);
      font-size: 13px;
      font-weight: 600;
      color: var(--bs-text);
    }
    .features-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 18px;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--bs-border);
      border-radius: var(--bs-radius-sm);
      transition: all 0.2s;
    }
    .feature-item:hover { border-color: var(--bs-border-glow); background: rgba(212,165,116,0.02); }
    .feature-bullet {
      width: 20px; height: 20px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 10px;
      margin-top: 1px;
    }
    .feature-text {
      font-size: 14px;
      color: var(--bs-text-dim);
      line-height: 1.5;
    }

    /* ─── Status Page Specific ─── */
    .status-banner {
      padding: 10px 20px;
      border-radius: var(--bs-radius-sm);
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 32px;
    }
    .status-ok { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); color: var(--bs-emerald); }
    .status-degraded { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2); color: var(--bs-amber); }
    .status-down { background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.2); color: var(--bs-rose); }

    .infra-counters {
      display: flex;
      gap: 32px;
      flex-wrap: wrap;
      padding: 24px 0;
      border-top: 1px solid var(--bs-border);
      border-bottom: 1px solid var(--bs-border);
      margin: 40px 0;
    }
    .infra-counter {
      text-align: center;
    }
    .infra-num {
      font-family: var(--bs-font-display);
      font-size: 32px;
      font-weight: 800;
      color: var(--bs-gold);
    }
    .infra-label {
      font-size: 12px;
      color: var(--bs-text-muted);
    }

    /* Agent Strip */
    .agent-strip {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 20px 0;
    }
    .agent-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--bs-border);
      border-radius: 100px;
      font-family: var(--bs-font-mono);
      font-size: 11px;
      color: var(--bs-text-dim);
      transition: all 0.2s;
    }
    .agent-chip:hover {
      border-color: var(--bs-border-glow);
      color: var(--bs-gold);
    }
    .agent-chip .chip-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--bs-teal);
    }

    /* ─── Divider ─── */
    .section-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--bs-border), transparent);
      margin: 0 auto;
      max-width: 800px;
    }
  `;
}

// ─── Particle Canvas Script ────────────────────────────────────────────
function getParticleScript() {
  return `
  (function() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles = [], mouse = { x: -1000, y: -1000 };

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.r = Math.random() * 1.5 + 0.3;
        this.alpha = Math.random() * 0.3 + 0.05;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > w) this.vx *= -1;
        if (this.y < 0 || this.y > h) this.vy *= -1;
        const dx = mouse.x - this.x, dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          this.x -= dx * 0.005;
          this.y -= dy * 0.005;
        }
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(212,165,116,' + this.alpha + ')';
        ctx.fill();
      }
    }

    for (let i = 0; i < 80; i++) particles.push(new Particle());

    function drawLines() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = 'rgba(14,165,233,' + (0.06 * (1 - dist / 120)) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function animate() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach(p => { p.update(); p.draw(); });
      drawLines();
      requestAnimationFrame(animate);
    }
    animate();
  })();
  `;
}

// ─── Shared HTML shell ─────────────────────────────────────────────────
function htmlShell(title, bodyContent, activeNav) {
  const navLinks = [
    { href: '/patient', label: 'BSMA', key: 'patient' },
    { href: '/givc', label: 'GIVC', key: 'givc' },
    { href: '/sbs', label: 'SBS', key: 'sbs' },
    { href: '/government', label: 'Gov', key: 'government' },
    { href: '/api', label: 'API', key: 'api' },
    { href: '/status', label: 'Status', key: 'status' },
  ];
  const navHtml = navLinks.map(l =>
    `<a href="${l.href}"${activeNav === l.key ? ' class="active"' : ''}>${escapeHtmlText(l.label)}</a>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlText(title)}</title>
  <meta name="description" content="BrainSAIT eCarePlus — Saudi Arabia's AI-native healthcare platform aligned with Vision 2030">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%231a365d'/><text x='16' y='22' text-anchor='middle' fill='%23d4a574' font-size='18' font-weight='bold' font-family='system-ui'>B</text></svg>">
  <style>${getDesignSystem()}</style>
</head>
<body>
  <canvas id="particle-canvas"></canvas>
  <div class="ambient-orb orb-gold"></div>
  <div class="ambient-orb orb-teal"></div>
  <div class="ambient-orb orb-medical"></div>

  <div class="page-wrapper">
    <header class="top-bar">
      <div class="top-bar-inner">
        <a href="/" class="top-bar-brand">
          <div class="brand-mark">B</div>
          <span class="brand-text">BrainSAIT<span class="brand-dot">eCarePlus</span></span>
        </a>
        <nav class="top-bar-nav">${navHtml}</nav>
      </div>
    </header>
    ${bodyContent}
    <footer class="footer">
      <div class="footer-links">
        <a href="/patient">BSMA</a>
        <a href="/givc">GIVC</a>
        <a href="/sbs">SBS</a>
        <a href="/government">Government</a>
        <a href="/api">API</a>
        <a href="/status">Status</a>
        <a href="/oasis">Oasis+</a>
        <a href="/oracle">Oracle</a>
        <a href="/control-tower">Control Tower</a>
      </div>
      <div>OID: 1.3.6.1.4.1.61026 · brainsait.org · ${new Date().toISOString().slice(0, 10)}</div>
    </footer>
  </div>
  <script>${getParticleScript()}</script>
</body>
</html>`;
}

// ─── escapeHtmlText — must match existing signature ────────────────────
// (This is already defined in the main worker; included here for reference)
function escapeHtmlText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════════
// 1) renderLandingPage(snapshot)
// ═══════════════════════════════════════════════════════════════════════
function renderLandingPage(snapshot) {
  const ts = snapshot?.timestamp || new Date().toISOString();
  const hosp = snapshot?.hospitals || {};
  const ext = snapshot?.externalServices || {};
  const claims = snapshot?.claims || {};
  const apps = snapshot?.apps || {};
  const actions = snapshot?.actions || {};
  const latency = snapshot?.avgLatency || {};

  // Derive metrics
  const hospOnline = hosp.online || 0;
  const hospTotal = hosp.total || 6;
  const hospPct = hospTotal > 0 ? Math.round((hospOnline / hospTotal) * 100) : 0;
  const extReachable = ext.reachable || 0;
  const extTotal = ext.total || 3;
  const extAvgMs = ext.avgLatency || 0;
  const claimsReady = claims.ready || 0;
  const claimsBlocked = claims.blocked || 0;
  const appsLive = apps.live || 0;
  const appsTotal = apps.total || 6;
  const appsCritical = apps.critical || 0;
  const actionsActive = actions.active || 0;
  const actionsCrit = actions.critical || 0;
  const actionsHigh = actions.high || 0;
  const avgLat = latency.avg || 0;
  const latEndpoints = latency.endpoints || 0;

  const hospPulse = hospPct >= 80 ? 'pulse-ok' : hospPct >= 50 ? 'pulse-warn' : 'pulse-crit';
  const extPulse = extReachable >= 2 ? 'pulse-ok' : extReachable >= 1 ? 'pulse-warn' : 'pulse-crit';

  const body = `
    <main>
      <!-- ─── Hero ─── -->
      <section class="hero">
        <div class="container">
          <div class="hero-badge"><span class="pulse-dot"></span> eCarePlus · Saudi Vision 2030</div>
          <h1>Saudi Arabia's <span class="gold">patient-first</span><br>cognitive backbone for <span class="teal">healthcare</span>.</h1>
          <p class="hero-sub">
            Four AI-native interfaces shape how patients, providers, payers, and government teams
            interact with Saudi healthcare — powered by Oracle Oasis+, BrainSAIT agents, and
            NPHIES-native interoperability.
          </p>
          <div class="hero-actions">
            <a href="/patient" class="btn btn-gold">Talk to BSMA (بسمة) →</a>
            <a href="/givc" class="btn btn-outline">GIVC Provider Interface</a>
            <a href="/status" class="btn btn-outline">System Status</a>
          </div>
        </div>
      </section>

      <!-- ─── Live Pulse ─── -->
      <section class="section" style="padding-top: 20px;">
        <div class="container">
          <div class="section-label">Live Operational Pulse</div>
          <div class="metrics-grid">
            <div class="metric-tile stagger-1" style="--metric-color: ${hospPct >= 80 ? 'var(--bs-emerald)' : hospPct >= 50 ? 'var(--bs-amber)' : 'var(--bs-rose)'}">
              <div class="metric-pulse ${hospPulse}"></div>
              <div class="metric-label">Hospitals</div>
              <div class="metric-value">${hospOnline}/${hospTotal}</div>
              <div class="metric-sub">${hospPct}% availability</div>
            </div>
            <div class="metric-tile stagger-2" style="--metric-color: var(--bs-teal)">
              <div class="metric-pulse ${extPulse}"></div>
              <div class="metric-label">External Services</div>
              <div class="metric-value">${extReachable}/${extTotal}</div>
              <div class="metric-sub">Avg ${Math.round(extAvgMs)}ms latency</div>
            </div>
            <div class="metric-tile stagger-3" style="--metric-color: var(--bs-gold)">
              <div class="metric-label">Claims Engine</div>
              <div class="metric-value">${claimsReady}</div>
              <div class="metric-sub">${claimsReady} ready · ${claimsBlocked} blocked</div>
            </div>
            <div class="metric-tile stagger-4" style="--metric-color: var(--bs-medical)">
              <div class="metric-label">Platform Apps</div>
              <div class="metric-value">${appsLive}/${appsTotal}</div>
              <div class="metric-sub">${appsCritical > 0 ? appsCritical + ' critical' : 'All clear'}</div>
            </div>
            <div class="metric-tile stagger-5" style="--metric-color: ${actionsCrit > 0 ? 'var(--bs-rose)' : 'var(--bs-emerald)'}">
              <div class="metric-label">Action Queue</div>
              <div class="metric-value">${actionsActive}</div>
              <div class="metric-sub">${actionsCrit} critical · ${actionsHigh} high</div>
            </div>
            <div class="metric-tile stagger-6" style="--metric-color: var(--bs-teal)">
              <div class="metric-label">Avg Latency</div>
              <div class="metric-value">${Math.round(avgLat)}ms</div>
              <div class="metric-sub">${latEndpoints} monitored endpoints</div>
            </div>
          </div>
          <div class="section-divider"></div>
        </div>
      </section>

      <!-- ─── Four Healthcare Lanes ─── -->
      <section class="section">
        <div class="container">
          <div class="section-label">Healthcare Interfaces</div>
          <div class="section-title">One platform, four dedicated lanes</div>
          <p class="section-desc">
            Every stakeholder gets a purpose-built BrainSAIT surface, while the same backend
            portals and operational fabric keep search, retrieval, booking, and submissions synchronized.
          </p>
          <div class="lanes-grid">
            ${renderLaneCard('patient', '🏥', 'Patient Interface', 'BSMA Patient Interface',
              'BSMA is the patient front door for appointments, medical records, claims follow-up, and Arabic-first care communication.',
              ['Patient-facing appointments, records, and claims access', 'Arabic-first experience with guided digital journeys', 'Connected to provider, payer, and government workflows'],
              '/patient', '/patient · /bsma', 'stagger-1')}
            ${renderLaneCard('provider', '⚕️', 'Provider Interface', 'GIVC Provider Interface',
              'Provider-facing access to patient records, encounters, scheduling, and AI-assisted clinical operations.',
              ['Clinician and care-team operational workflows', 'Care coordination with voice and AI support', 'Connected to BSMA patient context and Oracle operations'],
              '/givc', '/givc', 'stagger-2')}
            ${renderLaneCard('payer', '💳', 'Payer Interface', 'SBS Payer Interface',
              'Payer-facing revenue cycle workflows for eligibility, coding quality, rejections, claim readiness, and reimbursement.',
              ['NPHIES-aware revenue workflows', 'Claims scanner and rejection intelligence', 'Oracle Bridge-backed medical and claims reads'],
              '/sbs', '/sbs', 'stagger-3')}
            ${renderLaneCard('government', '🏛️', 'Government Interface', 'Government Interface',
              'Government submission lane for Saudi exchange, reimbursement coordination, and Etimad-linked approval paths.',
              ['NPHIES-aligned exchange and payer submission readiness', 'Etimad-linked government coordination paths', 'Connected to SBS payer operations and Oracle claim flows'],
              '/government', '/government · /nphies · /etimad', 'stagger-4')}
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- ─── Connected Services ─── -->
      <section class="section">
        <div class="container">
          <div class="section-label">Operational Services</div>
          <div class="section-title">Connected operational fabric</div>
          <p class="section-desc">
            The public interfaces run on top of interoperability, AI, Oracle, and status surfaces
            that keep the BrainSAIT network observable and connected.
          </p>
          <div class="lanes-grid">
            ${renderServiceCard('🔗', 'Healthcare API Gateway', 'Unified healthcare and workflow APIs for FHIR, patient services, claims orchestration.', '/api', 'stagger-1')}
            ${renderServiceCard('🤖', 'MCP Agent Gateway', 'Model Context Protocol access for BrainSAIT agents and orchestration routes.', '/mcp', 'stagger-2')}
            ${renderServiceCard('🏢', 'Oracle Oasis+ Gateway', 'Zero-trust access to Oracle Oasis+ ERP across the hospital network.', '/oasis', 'stagger-3')}
            ${renderServiceCard('🔍', 'Oracle Bridge & Scanner', 'Oracle Bridge sessions, claim scanning, and medical records retrieval.', '/oracle', 'stagger-4')}
            ${renderServiceCard('📊', 'Public Status', 'Public-facing operational summary for hospitals, services, and platform health.', '/status', 'stagger-5')}
            ${renderServiceCard('📚', 'Documentation', 'Platform routes, operational procedures, and integration guidance.', '/docs', 'stagger-6')}
            ${renderServiceCard('🛡️', 'Admin & Control', 'Privileged operator entrypoint for admin workflows and escalations.', '/admin', 'stagger-7')}
          </div>
        </div>
      </section>

      <!-- ─── Agent Strip ─── -->
      <section style="padding: 0 0 40px;">
        <div class="container">
          <div class="section-label" style="margin-bottom: 16px;">LINC Agent Ecosystem</div>
          <div class="agent-strip">
            ${['MASTERLINC', 'HEALTHCARELINC', 'CLINICALLINC', 'COMPLIANCELINC', 'TTLINC', 'RadioLinc', 'ClaimLinc', 'CodeLinc', 'AuthLinc', 'BridgeLinc', 'DRGLinc'].map(a =>
              `<span class="agent-chip"><span class="chip-dot"></span>${a}</span>`
            ).join('')}
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- ─── Platform Stack ─── -->
      <section class="section">
        <div class="container">
          <div class="section-label">Architecture</div>
          <div class="section-title">How the platform stacks together</div>
          <p class="section-desc">
            Operational visibility stays aligned with hospital systems, integrations, AI agents,
            and action surfaces that power the Control Tower.
          </p>
          <div class="stack-layers">
            <div class="stack-layer stagger-1">
              <span class="stack-num">L1</span>
              <div class="stack-content">
                <h4>Hospital Systems</h4>
                <p>Oracle ERP, HIS, LIS, RIS, and branch workflows — the operational source of truth.</p>
              </div>
            </div>
            <div class="stack-layer stagger-2">
              <span class="stack-num">L2</span>
              <div class="stack-content">
                <h4>Integration Gateway</h4>
                <p>FHIR APIs, adapters, and secure hospital connectors normalize legacy systems into modern services.</p>
              </div>
            </div>
            <div class="stack-layer stagger-3">
              <span class="stack-num">L3</span>
              <div class="stack-content">
                <h4>BrainSAIT Intelligence</h4>
                <p>AI agents monitor claims, infrastructure, compliance, and clinical signals in one coordinated fabric.</p>
              </div>
            </div>
            <div class="stack-layer stagger-4">
              <span class="stack-num">L4</span>
              <div class="stack-content">
                <h4>Control Tower Dashboard</h4>
                <p>Leadership-grade monitoring, alerting, and operational automation across brainsait.org.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;

  return htmlShell('BrainSAIT eCarePlus', body, null);
}

// ─── Lane Card helper ──────────────────────────────────────────────────
function renderLaneCard(type, icon, tag, title, desc, features, href, routes, stagger) {
  return `
    <div class="lane-card ${stagger}" style="--lane-accent: ${type === 'patient' ? 'var(--bs-gold)' : type === 'provider' ? 'var(--bs-teal)' : type === 'payer' ? 'var(--bs-emerald)' : 'var(--bs-medical)'}">
      <div class="lane-header">
        <div class="lane-icon ${type}">${icon}</div>
        <span class="lane-tag">${escapeHtmlText(tag)}</span>
      </div>
      <div class="lane-body">
        <h3 class="lane-title">${escapeHtmlText(title)}</h3>
        <p class="lane-desc">${escapeHtmlText(desc)}</p>
        <div class="lane-features">
          ${features.map(f => `<div class="lane-feature"><span class="dot"></span>${escapeHtmlText(f)}</div>`).join('')}
        </div>
        <span class="lane-route">${escapeHtmlText(routes)}</span>
      </div>
      <a href="${href}" class="lane-cta">
        <span>Open interface</span>
        <span class="arrow">→</span>
      </a>
    </div>
  `;
}

// ─── Service Card helper ───────────────────────────────────────────────
function renderServiceCard(icon, title, desc, href, stagger) {
  return `
    <a href="${href}" class="glass-card-link ${stagger}">
      <div class="glass-card" style="padding: 22px;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <div class="lane-icon service">${icon}</div>
          <h4 style="font-family:var(--bs-font-display);font-size:15px;font-weight:700;">${escapeHtmlText(title)}</h4>
        </div>
        <p style="font-size:13px;color:var(--bs-text-dim);line-height:1.6;margin-bottom:12px;">${escapeHtmlText(desc)}</p>
        <span class="lane-route">${escapeHtmlText(href)}</span>
      </div>
    </a>
  `;
}


// ═══════════════════════════════════════════════════════════════════════
// 2) renderServiceEntryPage(service, snapshot)
//    service = { key, title, description, audience, route, aliases, highlights, icon, lane }
// ═══════════════════════════════════════════════════════════════════════
function renderServiceEntryPage(service, snapshot) {
  const svc = service || {};
  const key = svc.key || 'unknown';
  const title = svc.title || 'BrainSAIT Service';
  const desc = svc.description || '';
  const audience = svc.audience || '';
  const route = svc.route || '/' + key;
  const aliases = svc.aliases || [];
  const highlights = svc.highlights || [];
  const lane = svc.lane || 'service';
  const icon = svc.icon || '📡';

  // Color mapping per lane type
  const laneColors = {
    patient: { accent: 'var(--bs-gold)', bg: 'rgba(212,165,116,0.08)', border: 'rgba(212,165,116,0.15)' },
    provider: { accent: 'var(--bs-teal)', bg: 'rgba(14,165,233,0.08)', border: 'rgba(14,165,233,0.15)' },
    payer: { accent: 'var(--bs-emerald)', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.15)' },
    government: { accent: 'var(--bs-medical)', bg: 'rgba(43,108,184,0.08)', border: 'rgba(43,108,184,0.15)' },
    service: { accent: 'var(--bs-text-dim)', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.12)' },
  };
  const colors = laneColors[lane] || laneColors.service;

  const aliasRoutes = aliases.length > 0
    ? aliases.map(a => `<span class="lane-route" style="margin-right:6px;">${escapeHtmlText(a)}</span>`).join('')
    : '';

  const body = `
    <main>
      <section class="sub-hero">
        <div class="container">
          <div class="sub-hero-badge" style="background:${colors.bg};border:1px solid ${colors.border};color:${colors.accent};">
            ${icon} ${escapeHtmlText(lane.charAt(0).toUpperCase() + lane.slice(1))} interface
          </div>
          <h1 style="animation:fadeSlideUp 0.5s ease-out both;">${escapeHtmlText(title)}</h1>
          <p class="sub-hero-desc" style="animation:fadeSlideUp 0.5s ease-out 0.1s both;">${escapeHtmlText(desc)}</p>

          <div class="info-grid" style="animation:fadeSlideUp 0.5s ease-out 0.15s both;">
            <div class="info-chip">
              <div class="info-chip-label">Audience</div>
              <div class="info-chip-value">${escapeHtmlText(audience)}</div>
            </div>
            <div class="info-chip">
              <div class="info-chip-label">Platform Lane</div>
              <div class="info-chip-value" style="color:${colors.accent};">${escapeHtmlText(lane.charAt(0).toUpperCase() + lane.slice(1))} interface</div>
            </div>
            <div class="info-chip">
              <div class="info-chip-label">Entry Routes</div>
              <div class="info-chip-value" style="font-family:var(--bs-font-mono);font-size:12px;">${escapeHtmlText(route)}${aliases.length > 0 ? ' · ' + aliases.join(' · ') : ''}</div>
            </div>
          </div>

          <div class="hero-actions" style="animation:fadeSlideUp 0.5s ease-out 0.2s both;">
            <a href="/status" class="btn btn-outline">View public status</a>
            <a href="/control-tower" class="btn btn-outline">Open Control Tower</a>
            <a href="/" class="btn btn-outline">← Back to brainsait.org</a>
          </div>
        </div>
      </section>

      ${highlights.length > 0 ? `
      <section class="section" style="padding-top: 20px;">
        <div class="container">
          <div class="section-label">Service Highlights</div>
          <div class="section-title">What this interface delivers</div>
          <div class="features-list" style="max-width:640px; margin-top:24px;">
            ${highlights.map((h, i) => `
              <div class="feature-item stagger-${i + 1}">
                <div class="feature-bullet" style="background:${colors.bg};color:${colors.accent};">✓</div>
                <span class="feature-text">${escapeHtmlText(h)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
      ` : ''}

      <!-- Connected context -->
      <section class="section">
        <div class="container">
          <div class="section-label">Connected Services</div>
          <div class="section-title">Part of the BrainSAIT fabric</div>
          <p class="section-desc">This interface connects to the operational services, agents, and data surfaces that power BrainSAIT.</p>
          <div class="lanes-grid" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));">
            ${renderServiceCard('📊', 'Status', 'Live platform health and operations.', '/status', 'stagger-1')}
            ${renderServiceCard('🔗', 'API Gateway', 'FHIR and healthcare endpoints.', '/api', 'stagger-2')}
            ${renderServiceCard('🏢', 'Oracle Oasis+', 'Hospital ERP access.', '/oasis', 'stagger-3')}
            ${renderServiceCard('🤖', 'MCP Agents', 'AI orchestration and tooling.', '/mcp', 'stagger-4')}
          </div>
        </div>
      </section>

      <!-- Agent Strip -->
      <section style="padding: 0 0 60px;">
        <div class="container">
          <div class="section-label" style="margin-bottom:16px;">Active LINC Agents</div>
          <div class="agent-strip">
            ${['MASTERLINC', 'HEALTHCARELINC', 'CLINICALLINC', 'COMPLIANCELINC', 'ClaimLinc', 'BridgeLinc'].map(a =>
              `<span class="agent-chip"><span class="chip-dot"></span>${a}</span>`
            ).join('')}
          </div>
        </div>
      </section>
    </main>
  `;

  return htmlShell(title + ' · BrainSAIT', body, key);
}


// ═══════════════════════════════════════════════════════════════════════
// 3) renderStatusPage(snapshot)
// ═══════════════════════════════════════════════════════════════════════
function renderStatusPage(snapshot) {
  const ts = snapshot?.timestamp || new Date().toISOString();
  const hosp = snapshot?.hospitals || {};
  const ext = snapshot?.externalServices || {};
  const claims = snapshot?.claims || {};
  const apps = snapshot?.apps || {};
  const actions = snapshot?.actions || {};
  const latency = snapshot?.avgLatency || {};

  const hospOnline = hosp.online || 0;
  const hospTotal = hosp.total || 6;
  const hospPct = hospTotal > 0 ? Math.round((hospOnline / hospTotal) * 100) : 0;
  const extReachable = ext.reachable || 0;
  const extTotal = ext.total || 3;
  const extAvgMs = ext.avgLatency || 0;
  const claimsReady = claims.ready || 0;
  const claimsBlocked = claims.blocked || 0;
  const appsLive = apps.live || 0;
  const appsTotal = apps.total || 6;
  const appsCritical = apps.critical || 0;
  const actionsActive = actions.active || 0;
  const actionsCrit = actions.critical || 0;
  const actionsHigh = actions.high || 0;
  const avgLat = latency.avg || 0;
  const latEndpoints = latency.endpoints || 0;

  // Overall health: determine banner
  const healthScore = ((hospOnline / hospTotal) * 40) + ((extReachable / extTotal) * 20) + ((appsLive / appsTotal) * 20) + (actionsCrit === 0 ? 20 : 0);
  let bannerClass, bannerText, bannerIcon;
  if (healthScore >= 75) {
    bannerClass = 'status-ok'; bannerText = 'All systems operational'; bannerIcon = '●';
  } else if (healthScore >= 40) {
    bannerClass = 'status-degraded'; bannerText = 'Partial degradation detected'; bannerIcon = '▲';
  } else {
    bannerClass = 'status-down'; bannerText = 'Significant issues detected'; bannerIcon = '▼';
  }

  // Hospital detail rows
  const hospDetails = snapshot?.hospitalDetails || [];
  const hospRows = hospDetails.map((h, i) => {
    const name = h.name || `Hospital ${i + 1}`;
    const status = h.online ? 'online' : 'offline';
    const statusColor = h.online ? 'var(--bs-emerald)' : 'var(--bs-rose)';
    const city = h.city || '';
    return `
      <div class="feature-item stagger-${i + 1}">
        <div class="feature-bullet" style="background:${h.online ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)'};color:${statusColor};">●</div>
        <div>
          <span class="feature-text" style="font-weight:600;color:var(--bs-text);">${escapeHtmlText(name)}</span>
          ${city ? `<span style="font-size:12px;color:var(--bs-text-muted);margin-left:8px;">${escapeHtmlText(city)}</span>` : ''}
          <span style="font-size:11px;color:${statusColor};margin-left:8px;font-weight:600;">${status}</span>
        </div>
      </div>
    `;
  }).join('');

  const body = `
    <main>
      <section class="sub-hero">
        <div class="container">
          <a href="/" style="color:var(--bs-text-dim);text-decoration:none;font-size:13px;display:inline-flex;align-items:center;gap:6px;margin-bottom:20px;">← Back to brainsait.org</a>
          <div class="section-label">Public Operations</div>
          <h1 style="animation:fadeSlideUp 0.5s ease-out both;">BrainSAIT <span style="color:var(--bs-gold);">Platform Status</span></h1>
          <p class="sub-hero-desc" style="animation:fadeSlideUp 0.5s ease-out 0.1s both;">
            This public operations view reflects the same live control-tower snapshot used by the
            operator dashboard, summarized for safe external visibility.
          </p>
          <div style="animation:fadeSlideUp 0.5s ease-out 0.15s both;">
            <div class="status-banner ${bannerClass}">${bannerIcon} ${bannerText}</div>
          </div>
          <div style="font-size:12px;color:var(--bs-text-muted);margin-top:12px;">Updated ${escapeHtmlText(ts.replace('T', ' ').slice(0, 19))} UTC</div>
        </div>
      </section>

      <!-- Metrics -->
      <section class="section" style="padding-top:20px;">
        <div class="container">
          <div class="metrics-grid">
            <div class="metric-tile stagger-1" style="--metric-color:${hospPct >= 80 ? 'var(--bs-emerald)' : hospPct >= 50 ? 'var(--bs-amber)' : 'var(--bs-rose)'}">
              <div class="metric-pulse ${hospPct >= 80 ? 'pulse-ok' : hospPct >= 50 ? 'pulse-warn' : 'pulse-crit'}"></div>
              <div class="metric-label">Hospitals Online</div>
              <div class="metric-value">${hospOnline}/${hospTotal}</div>
              <div class="metric-sub">${hospPct}% availability</div>
            </div>
            <div class="metric-tile stagger-2" style="--metric-color:var(--bs-teal)">
              <div class="metric-pulse ${extReachable >= 2 ? 'pulse-ok' : extReachable >= 1 ? 'pulse-warn' : 'pulse-crit'}"></div>
              <div class="metric-label">External Services</div>
              <div class="metric-value">${extReachable}/${extTotal}</div>
              <div class="metric-sub">Avg ${Math.round(extAvgMs)}ms latency</div>
            </div>
            <div class="metric-tile stagger-3" style="--metric-color:var(--bs-gold)">
              <div class="metric-label">Platform Apps</div>
              <div class="metric-value">${appsLive}/${appsTotal}</div>
              <div class="metric-sub">${appsCritical > 0 ? appsCritical + ' critical attention' : 'Normal'}</div>
            </div>
            <div class="metric-tile stagger-4" style="--metric-color:${actionsCrit > 0 ? 'var(--bs-rose)' : 'var(--bs-emerald)'}">
              <div class="metric-label">Priority Actions</div>
              <div class="metric-value">${actionsActive}</div>
              <div class="metric-sub">${actionsCrit} critical · ${actionsHigh} high</div>
            </div>
          </div>
        </div>
      </section>

      ${hospDetails.length > 0 ? `
      <section class="section" style="padding-top:0;">
        <div class="container">
          <div class="section-label">Hospital Network</div>
          <div class="section-title">Branch connectivity</div>
          <div class="features-list" style="max-width:600px;margin-top:20px;">
            ${hospRows}
          </div>
        </div>
      </section>
      ` : ''}

      <!-- Infrastructure -->
      <section class="section">
        <div class="container">
          <div class="section-label">Infrastructure Reference</div>
          <div class="infra-counters">
            <div class="infra-counter stagger-1">
              <div class="infra-num">67</div>
              <div class="infra-label">Cloudflare Workers</div>
            </div>
            <div class="infra-counter stagger-2">
              <div class="infra-num">13</div>
              <div class="infra-label">D1 Databases</div>
            </div>
            <div class="infra-counter stagger-3">
              <div class="infra-num">20</div>
              <div class="infra-label">KV Namespaces</div>
            </div>
            <div class="infra-counter stagger-4">
              <div class="infra-num">11</div>
              <div class="infra-label">LINC Agents</div>
            </div>
            <div class="infra-counter stagger-5">
              <div class="infra-num">4</div>
              <div class="infra-label">Healthcare Lanes</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Quick links -->
      <section class="section" style="padding-top:0;">
        <div class="container">
          <div class="section-label">Quick Access</div>
          <div class="lanes-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));">
            ${renderServiceCard('🏥', 'BSMA Patient', 'Patient front door.', '/patient', 'stagger-1')}
            ${renderServiceCard('⚕️', 'GIVC Provider', 'Clinician operations.', '/givc', 'stagger-2')}
            ${renderServiceCard('💳', 'SBS Payer', 'Revenue cycle.', '/sbs', 'stagger-3')}
            ${renderServiceCard('🏛️', 'Government', 'NPHIES and Etimad.', '/government', 'stagger-4')}
            ${renderServiceCard('🛡️', 'Control Tower', 'Operator dashboard.', '/control-tower', 'stagger-5')}
          </div>
        </div>
      </section>
    </main>
  `;

  return htmlShell('BrainSAIT Platform Status', body, 'status');
}

// ═══════════════════════════════════════════════════════════════════════
// Exports — replace corresponding functions in src/index.js
// ═══════════════════════════════════════════════════════════════════════
// In the actual worker, these are defined inline, not exported.
// Copy the function bodies to replace the existing renderLandingPage,
// renderServiceEntryPage, and renderStatusPage in your index.js.
