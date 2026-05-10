/**
 * Shared CSS, layout components and navigation for brainsait.org pages.
 * Premium dark theme with glassmorphism, consistent across all sub-pages.
 */

export const FONTS_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">';

export const CSS_VARS = `
:root {
  --bg-primary: #050505;
  --bg-secondary: #0a0a0a;
  --bg-card: rgba(15,15,15,0.7);
  --bg-glass: rgba(255,255,255,0.03);
  --border-glass: rgba(255,255,255,0.08);
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #52525b;
  --accent-blue: #3b82f6;
  --accent-cyan: #06b6d4;
  --accent-purple: #a855f7;
  --accent-emerald: #10b981;
  --accent-amber: #f59e0b;
  --accent-rose: #f43f5e;
  --accent-indigo: #6366f1;
  --cf-orange: #f38020;
  --cf-cloud: #faad3f;
  --gradient-hero: linear-gradient(135deg, #050505 0%, #170d05 50%, #050505 100%);
  --gradient-card: linear-gradient(145deg, rgba(20,20,20,0.5) 0%, rgba(10,10,10,0.8) 100%);
  --gradient-accent: linear-gradient(135deg, var(--cf-orange), var(--cf-cloud));
  --shadow-glow: 0 0 60px rgba(243,128,32,0.15);
  --radius: 16px;
  --radius-sm: 10px;
  --radius-xs: 6px;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}
`;

export const CSS_RESET = `
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:var(--font-body);background:var(--bg-primary);color:var(--text-primary);min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
`;

export const CSS_BACKGROUND = `
.bg-mesh{position:fixed;inset:0;z-index:0;pointer-events:none;
  background:
    radial-gradient(ellipse 80% 60% at 20% 10%,rgba(243,128,32,0.08) 0%,transparent 60%),
    radial-gradient(ellipse 60% 50% at 80% 80%,rgba(6,182,212,0.05) 0%,transparent 50%),
    radial-gradient(ellipse 50% 40% at 50% 50%,rgba(168,85,247,0.04) 0%,transparent 50%)}
.grid-overlay{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.04;
  background-image:linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px);background-size:60px 60px}
`;

export const CSS_NAV = `
.top-nav{position:sticky;top:0;z-index:100;background:rgba(5,5,5,0.85);backdrop-filter:blur(20px) saturate(1.5);border-bottom:1px solid var(--border-glass);padding:0 24px}
.top-nav .inner{max-width:1400px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:64px}
.logo-group{display:flex;align-items:center;gap:12px}
.logo-mark{width:36px;height:36px;border-radius:10px;background:var(--gradient-accent);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;box-shadow:0 4px 16px rgba(243,128,32,0.3)}
.logo-text{font-size:1.1rem;font-weight:700;letter-spacing:-0.02em}
.logo-text span{background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.nav-links{display:flex;gap:4px;flex-wrap:wrap}
.nav-links a{color:var(--text-secondary);font-size:0.85rem;font-weight:500;padding:8px 14px;border-radius:var(--radius-xs);transition:all 0.2s}
.nav-links a:hover,.nav-links a.active{color:var(--text-primary);background:var(--bg-glass)}
.status-pill{display:flex;align-items:center;gap:6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);padding:6px 14px;border-radius:20px;font-size:0.78rem;font-weight:500;color:var(--accent-emerald)}
.status-dot{width:7px;height:7px;border-radius:50%;background:var(--accent-emerald);animation:pulse-dot 2s ease-in-out infinite}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.8)}}
@media(max-width:768px){
  .nav-links{display:none}
  .status-pill{display:none}
  .top-nav .inner{height:56px}
}
`;

export const CSS_LAYOUT = `
.container{max-width:1400px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
.hero{padding:80px 0 60px;text-align:center;background:var(--gradient-hero);position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;bottom:0;left:0;right:0;height:120px;background:linear-gradient(to top,var(--bg-primary),transparent)}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(243,128,32,0.1);border:1px solid rgba(243,128,32,0.2);padding:6px 16px;border-radius:20px;font-size:0.78rem;font-weight:500;color:var(--cf-orange);margin-bottom:24px;animation:fadeInUp 0.6s ease-out}
.hero h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:800;letter-spacing:-0.03em;line-height:1.15;margin-bottom:16px;animation:fadeInUp 0.6s ease-out 0.1s both}
.hero h1 .gradient{background:var(--gradient-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{font-size:1.1rem;color:var(--text-secondary);max-width:600px;margin:0 auto 32px;line-height:1.6;animation:fadeInUp 0.6s ease-out 0.2s both}
.hero-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;animation:fadeInUp 0.6s ease-out 0.3s both}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:var(--radius-sm);font-size:0.9rem;font-weight:600;border:none;cursor:pointer;transition:all 0.25s}
.btn-primary{background:var(--gradient-accent);color:#fff;box-shadow:0 4px 20px rgba(243,128,32,0.3)}
.btn-primary:hover{box-shadow:0 4px 30px rgba(243,128,32,0.5);transform:translateY(-2px)}
.btn-secondary{background:rgba(255,255,255,0.05);color:var(--text-primary);border:1px solid var(--border-glass)}
.btn-secondary:hover{background:rgba(255,255,255,0.1);transform:translateY(-2px)}
`;

export const CSS_CARDS = `
.cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;padding:60px 0}
.card{background:var(--gradient-card);border:1px solid var(--border-glass);border-radius:var(--radius);padding:28px;position:relative;overflow:hidden;transition:all 0.3s}
.card:hover{border-color:rgba(243,128,32,0.2);box-shadow:var(--shadow-glow);transform:translateY(-4px)}
.card::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:var(--gradient-accent);opacity:0}
.card:hover::before{opacity:0.7}
.card-icon{font-size:2.4rem;margin-bottom:16px;display:block}
.card-title{font-size:1.2rem;font-weight:700;margin-bottom:8px}
.card-desc{font-size:0.9rem;color:var(--text-secondary);line-height:1.6;margin-bottom:20px}
.card-link{display:inline-flex;align-items:center;gap:6px;font-size:0.85rem;font-weight:600;color:var(--cf-orange);transition:gap 0.2s}
.card-link:hover{gap:10px}
.card-tag{display:inline-block;font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:12px;background:rgba(243,128,32,0.1);color:var(--cf-orange);margin-bottom:16px;letter-spacing:0.03em;text-transform:uppercase}
`;

export const CSS_API_PANEL = `
.api-panel{background:rgba(0,0,0,0.5);border:1px solid var(--border-glass);border-radius:var(--radius);padding:24px;margin-top:40px}
.api-panel-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-glass)}
.api-panel-title{font-size:1.1rem;font-weight:700}
.api-panel-badge{font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:12px;font-family:var(--font-mono)}
.api-panel-badge.live{background:rgba(16,185,129,0.15);color:var(--accent-emerald)}
.api-panel-badge.beta{background:rgba(59,130,246,0.15);color:var(--accent-blue)}
.endpoint-list{display:flex;flex-direction:column;gap:8px}
.endpoint{display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);transition:all 0.2s}
.endpoint:hover{background:rgba(255,255,255,0.04);border-color:rgba(243,128,32,0.15)}
.method{font-family:var(--font-mono);font-size:0.75rem;font-weight:600;padding:3px 8px;border-radius:4px;min-width:50px;text-align:center}
.method.get{background:rgba(16,185,129,0.15);color:var(--accent-emerald)}
.method.post{background:rgba(59,130,246,0.15);color:var(--accent-blue)}
.method.put{background:rgba(245,158,11,0.15);color:var(--accent-amber)}
.method.delete{background:rgba(244,63,94,0.15);color:var(--accent-rose)}
.endpoint-path{font-family:var(--font-mono);font-size:0.85rem;color:var(--text-primary);flex:1}
.endpoint-desc{font-size:0.8rem;color:var(--text-muted)}
.api-console{margin-top:20px;background:#000;border:1px solid var(--border-glass);border-radius:var(--radius-sm);overflow:hidden}
.api-console-header{display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border-glass);font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted)}
.api-console-body{padding:16px;font-family:var(--font-mono);font-size:0.8rem;min-height:120px;max-height:300px;overflow-y:auto}
.api-console-body .req{color:var(--accent-cyan)}
.api-console-body .res{color:var(--accent-emerald)}
.api-console-body .err{color:var(--accent-rose)}
.api-console-body .info{color:var(--text-muted)}
`;

export const CSS_FEATURES = `
.features{padding:60px 0}
.features-header{text-align:center;margin-bottom:40px}
.features-header h2{font-size:clamp(1.5rem,3vw,2.2rem);font-weight:800;margin-bottom:12px}
.features-header p{color:var(--text-secondary);max-width:500px;margin:0 auto;font-size:0.95rem;line-height:1.6}
.feature-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin-bottom:20px}
.feature-item{display:flex;align-items:flex-start;gap:14px;padding:20px;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:var(--radius-sm);transition:all 0.2s}
.feature-item:hover{background:rgba(255,255,255,0.04);border-color:rgba(243,128,32,0.15)}
.feature-icon{font-size:1.4rem;flex-shrink:0;margin-top:2px}
.feature-text h3{font-size:0.95rem;font-weight:600;margin-bottom:4px}
.feature-text p{font-size:0.82rem;color:var(--text-secondary);line-height:1.5}
`;

export const CSS_FOOTER = `
.footer{border-top:1px solid var(--border-glass);padding:40px 0;margin-top:60px}
.footer-inner{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.footer-brand{display:flex;align-items:center;gap:10px}
.footer-text{font-size:0.82rem;color:var(--text-muted)}
.footer-links{display:flex;gap:16px}
.footer-links a{font-size:0.82rem;color:var(--text-secondary);transition:color 0.2s}
.footer-links a:hover{color:var(--text-primary)}
`;

export const CSS_ANIMATIONS = `
@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideInLeft{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
.animate-in{animation:fadeInUp 0.6s ease-out both}
.animate-in-1{animation-delay:0.1s}
.animate-in-2{animation-delay:0.2s}
.animate-in-3{animation-delay:0.3s}
.animate-in-4{animation-delay:0.4s}
.animate-in-5{animation-delay:0.5s}
`;

export function allCSS() {
  return CSS_VARS + CSS_RESET + CSS_BACKGROUND + CSS_NAV + CSS_LAYOUT +
    CSS_CARDS + CSS_API_PANEL + CSS_FEATURES + CSS_FOOTER + CSS_ANIMATIONS;
}

export function nav(activePage = "") {
  const links = [
    { href: "/", label: "Home", id: "home" },
    { href: "/bsma", label: "BSMA", id: "bsma" },
    { href: "/givc", label: "GIVC", id: "givc" },
    { href: "/sbs", label: "SBS", id: "sbs" },
    { href: "/gov", label: "GOV", id: "gov" },
  ];
  const linkHTML = links
    .map((l) => `<a href="${l.href}"${l.id === activePage ? ' class="active"' : ""}>${l.label}</a>`)
    .join("");
  return `
  <nav class="top-nav">
    <div class="inner">
      <a href="/" class="logo-group">
        <div class="logo-mark">B</div>
        <div class="logo-text"><span>Brain</span>SAIT</div>
      </a>
      <div class="nav-links">${linkHTML}</div>
      <div class="status-pill"><div class="status-dot"></div>Edge Live</div>
    </div>
  </nav>`;
}

export function footer() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer-inner">
        <div class="footer-brand">
          <div class="logo-mark" style="width:28px;height:28px;font-size:14px;border-radius:8px">B</div>
          <span class="footer-text">&copy; ${new Date().getFullYear()} BrainSAIT. Edge-native intelligence.</span>
        </div>
        <div class="footer-links">
          <a href="/health">System Health</a>
          <a href="https://portals.elfadil.com" target="_blank" rel="noopener noreferrer">Portals</a>
          <a href="https://github.com/Fadil369/oracle-setup" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </div>
    </div>
  </footer>`;
}

export function htmlShell(title, description, activePage, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="description" content="${description}">
<title>${title}</title>
${FONTS_LINK}
<style>${allCSS()}</style>
</head>
<body>
<div class="bg-mesh"></div>
<div class="grid-overlay"></div>
${nav(activePage)}
${bodyContent}
${footer()}
</body>
</html>`;
}
