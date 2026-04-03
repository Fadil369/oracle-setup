import { Hono } from 'hono';

interface Env {
  BASMA_WEB_URL?: string;
  BASMA_API_URL?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/widget.js', (c) => {
  const webBase = c.env.BASMA_WEB_URL || 'https://bsma.brainsait.org';
  const apiBase = c.env.BASMA_API_URL || 'https://basma-api.brainsait.org';
  const script = `
(function() {
  var scriptEl = document.currentScript;
  var webBase = (scriptEl && scriptEl.dataset.basmaUrl) || '${webBase}';
  var apiBase = (scriptEl && scriptEl.dataset.basmaApi) || '${apiBase}';
  var position = ((scriptEl && scriptEl.dataset.basmaPosition) || 'bottom-right').toLowerCase();
  var domain = ((scriptEl && scriptEl.dataset.basmaDomain) || window.location.hostname || '').toLowerCase();
  var locale = ((scriptEl && scriptEl.dataset.basmaLocale) || 'ar').toLowerCase();
  var sideStyle = position === 'bottom-left' ? 'left:24px;' : 'right:24px;';
  var socket = null;
  var activeSessionId = null;

  var style = document.createElement('style');
  style.textContent = '#basma-widget-root{position:fixed;bottom:24px;' + sideStyle + 'z-index:9999;font-family:Inter,Arial,sans-serif;}'
    + '#basma-widget-panel{width:320px;padding:18px;border-radius:24px;background:rgba(15,23,42,0.92);backdrop-filter:blur(24px);border:1px solid rgba(148,163,184,0.18);box-shadow:0 20px 45px rgba(2,6,23,0.45);color:#f8fafc;display:none;margin-bottom:16px;}'
    + '#basma-widget-panel.open{display:block;}'
    + '#basma-widget-panel h3{margin:0 0 8px;font-size:18px;font-weight:700;}'
    + '#basma-widget-panel p{margin:0 0 14px;color:#cbd5e1;font-size:13px;line-height:1.5;}'
    + '#basma-widget-actions{display:grid;gap:10px;}'
    + '.basma-widget-btn{width:100%;border:0;border-radius:14px;padding:12px 14px;cursor:pointer;font-weight:600;font-size:14px;transition:transform .2s ease,opacity .2s ease;}'
    + '.basma-widget-btn:hover{transform:translateY(-1px);opacity:.95;}'
    + '.basma-primary{background:linear-gradient(135deg,#0ea5e9,#2b6cb8);color:white;}'
    + '.basma-secondary{background:rgba(255,255,255,0.06);color:#f8fafc;border:1px solid rgba(148,163,184,0.12);}'
    + '#basma-widget-orb{width:68px;height:68px;border-radius:999px;background:linear-gradient(135deg,#ea580c,#f97316);box-shadow:0 0 24px rgba(234,88,12,0.45);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;}'
    + '#basma-widget-orb::after{content:"";position:absolute;inset:-6px;border:2px solid rgba(234,88,12,.4);border-radius:999px;animation:basmaPulse 2s infinite;}'
    + '@keyframes basmaPulse{0%{transform:scale(1);opacity:.65;}100%{transform:scale(1.35);opacity:0;}}'
    + '#basma-widget-meta{display:flex;justify-content:space-between;gap:12px;margin-top:12px;font-size:11px;color:#94a3b8;}'
    + '#basma-widget-status{margin-top:10px;padding:8px 10px;background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.18);border-radius:10px;color:#bae6fd;font-size:11px;}';
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = 'basma-widget-root';

  var panel = document.createElement('div');
  panel.id = 'basma-widget-panel';
  panel.innerHTML = '<h3 id="basma-widget-title">Basma AI Secretary</h3>'
    + '<p id="basma-widget-copy">Voice receptionist, lead capture, and appointment coordination for BrainSAIT.</p>'
    + '<div id="basma-widget-actions">'
    + '<button class="basma-widget-btn basma-primary" id="basma-call-btn">Start voice conversation</button>'
    + '<button class="basma-widget-btn basma-secondary" id="basma-book-btn">Book a consultation</button>'
    + '<button class="basma-widget-btn basma-secondary" id="basma-open-btn">Open assistant workspace</button>'
    + '</div>'
    + '<div id="basma-widget-meta"><span>Arabic + English</span><span>CRM connected</span></div>'
    + '<div id="basma-widget-status">Realtime voice channel disconnected</div>';

  var orb = document.createElement('button');
  orb.type = 'button';
  orb.id = 'basma-widget-orb';
  orb.setAttribute('aria-label', 'Open Basma AI Secretary');
  orb.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';

  function openPath(path) {
    var joiner = path.indexOf('?') >= 0 ? '&' : '?';
    window.open(webBase + path + joiner + 'source=widget&locale=' + encodeURIComponent(locale) + '&domain=' + encodeURIComponent(domain), 'BasmaAI', 'width=460,height=760');
  }

  function updateStatus(message) {
    var statusEl = document.getElementById('basma-widget-status');
    if (statusEl) {
      statusEl.textContent = message;
    }
  }

  function getSessionToken() {
    var sessionId = activeSessionId || (self.crypto && self.crypto.randomUUID ? self.crypto.randomUUID() : String(Date.now()));
    activeSessionId = sessionId;
    var tokenUrl = apiBase + '/widget/session-token?domain=' + encodeURIComponent(domain) + '&session=' + encodeURIComponent(sessionId);

    return fetch(tokenUrl, { credentials: 'omit' }).then(function(response) {
      if (!response.ok) {
        throw new Error('Token request failed with status ' + response.status);
      }
      return response.json();
    });
  }

  function connectRealtimeVoice() {
    if (socket && socket.readyState === 1) {
      updateStatus('Realtime voice channel ready');
      return Promise.resolve();
    }

    updateStatus('Authorizing secure voice channel...');

    return getSessionToken().then(function(tokenPayload) {
      if (!tokenPayload || !tokenPayload.voiceWebSocketUrl) {
        throw new Error('Voice URL is missing in token payload');
      }

      socket = new WebSocket(tokenPayload.voiceWebSocketUrl);

      socket.addEventListener('open', function() {
        updateStatus('Realtime voice channel connected');
        try {
          socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch (_) {}
      });

      socket.addEventListener('message', function(event) {
        try {
          var payload = JSON.parse(event.data || '{}');
          if (payload && payload.type === 'latency_report' && payload.value) {
            updateStatus('Realtime connected • first token ' + payload.value + 'ms');
          }
        } catch (_) {}
      });

      socket.addEventListener('close', function() {
        updateStatus('Realtime voice channel disconnected');
      });

      socket.addEventListener('error', function() {
        updateStatus('Realtime voice channel error');
      });
    }).catch(function(err) {
      updateStatus('Secure voice auth failed');
      console.warn('[Basma Widget] voice auth error', err);
    });
  }

  orb.addEventListener('click', function() {
    panel.classList.toggle('open');
  });

  root.appendChild(panel);
  root.appendChild(orb);
  document.body.appendChild(root);

  document.getElementById('basma-call-btn').addEventListener('click', function() {
    connectRealtimeVoice().finally(function() {
      openPath('/?mode=voice');
    });
  });
  document.getElementById('basma-book-btn').addEventListener('click', function() { openPath('/book'); });
  document.getElementById('basma-open-btn').addEventListener('click', function() { openPath('/'); });

  fetch(apiBase + '/widget/config?domain=' + encodeURIComponent(domain))
    .then(function(response) { return response.ok ? response.json() : null; })
    .then(function(config) {
      if (!config) return;
      var title = document.getElementById('basma-widget-title');
      var copy = document.getElementById('basma-widget-copy');
      if (title && config.assistant && config.assistant.name) title.textContent = config.assistant.name;
      if (copy && config.settings && config.settings.greeting) copy.textContent = config.settings.greeting;
      if (config && config.settings && config.settings.locale) locale = config.settings.locale;
    })
    .catch(function() {});
})();
  `;

  return c.text(script, 200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
});

export default app;
