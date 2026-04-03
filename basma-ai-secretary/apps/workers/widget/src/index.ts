import { Hono } from 'hono';

const app = new Hono();

// Serve the widget.js script
app.get('/widget.js', (c) => {
  const script = `
(function() {
  const container = document.createElement('div');
  container.id = 'basma-widget-container';
  document.body.appendChild(container);

  const orb = document.createElement('div');
  orb.innerHTML = \`
    <div id="basma-orb" style="
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);
      border-radius: 50%;
      box-shadow: 0 0 20px rgba(234, 88, 12, 0.5), 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    ">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
      <div style="
        position: absolute;
        inset: -4px;
        border: 2px solid #ea580c;
        border-radius: 50%;
        opacity: 0.5;
        animation: basma-pulse 2s infinite;
      "></div>
    </div>
    <style>
      @keyframes basma-pulse {
        0% { transform: scale(1); opacity: 0.5; }
        100% { transform: scale(1.4); opacity: 0; }
      }
      #basma-orb:hover { transform: scale(1.1); box-shadow: 0 0 30px rgba(234, 88, 12, 0.8); }
    </style>
  \`;
  container.appendChild(orb);

  orb.onclick = () => {
    // Open the Basma Voice Iframe or Link
    window.open('https://bsma.brainsait.org/call', 'BasmaAI', 'width=400,height=600');
  };
})();
  `;
  return c.text(script, 200, { 'Content-Type': 'application/javascript' });
});

export default app;
