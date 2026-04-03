import { Hono } from 'hono';
import { Env } from '../index';

const widgetPublicRoutes = new Hono<{ Bindings: Env }>();

const FIRST_PARTY_DOMAINS = new Set([
  'brainsait.org',
  'www.brainsait.org',
  'elfadil.com',
  'www.elfadil.com',
  'thefadil.site',
  'www.thefadil.site',
  'bsma.brainsait.org',
  'basma.brainsait.org',
]);

const DEFAULT_WIDGET_SETTINGS = Object.freeze({
  theme: 'glass',
  locale: 'ar',
  accentColor: '#0ea5e9',
  secondaryColor: '#ea580c',
  position: 'bottom-right',
  greeting: 'مرحباً، معك بسمة. كيف أقدر أخدمك اليوم؟',
});

const DEFAULT_WIDGET_TOKEN_TTL_SECONDS = 180;

function resolveHostname(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return input
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();
  }
}

function parseSettings(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeJwtExpirySeconds(secret: string | undefined, fallbackSeconds: number) {
  const parsed = Number(secret);
  if (!Number.isFinite(parsed)) {
    return fallbackSeconds;
  }

  return Math.max(60, Math.min(900, Math.floor(parsed)));
}

function getSigningSecret(env: Env) {
  return env.WIDGET_SOCKET_SECRET || env.JWT_SECRET;
}

async function signWidgetToken(payloadBase64Url: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadBase64Url));
  const signatureBytes = String.fromCharCode(...new Uint8Array(signatureBuffer));
  return btoa(signatureBytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function issueWidgetSocketToken(env: Env, payload: Record<string, unknown>) {
  const secret = getSigningSecret(env);
  if (!secret) {
    throw new Error('WIDGET_SOCKET_SECRET or JWT_SECRET must be configured');
  }

  const payloadBase64Url = base64UrlEncode(JSON.stringify(payload));
  const signature = await signWidgetToken(payloadBase64Url, secret);
  return `v1.${payloadBase64Url}.${signature}`;
}

widgetPublicRoutes.get('/config', async (c) => {
  const hostname = resolveHostname(
    c.req.query('domain')
      || c.req.header('Origin')
      || c.req.header('Referer'),
  );

  if (!hostname) {
    return c.json({ error: 'Domain is required' }, 400);
  }

  const integration = await c.env.DB.prepare(
    `SELECT domain, settings
     FROM integrations
     WHERE domain = ? AND verified = 1
     LIMIT 1`,
  ).bind(hostname).first<{ domain: string; settings: string }>();

  if (!FIRST_PARTY_DOMAINS.has(hostname) && !integration) {
    return c.json({ error: 'Domain not authorized' }, 403);
  }

  const settings = integration
    ? { ...DEFAULT_WIDGET_SETTINGS, ...parseSettings(integration.settings) }
    : DEFAULT_WIDGET_SETTINGS;

  return c.json({
    domain: hostname,
    assistant: {
      name: 'Basma',
      languages: ['ar', 'en'],
    },
    settings,
    urls: {
      api: c.env.BASMA_API_URL || 'https://basma-api.brainsait.org',
      web: c.env.BASMA_WEB_URL || 'https://bsma.brainsait.org',
      voice: c.env.BASMA_VOICE_URL || 'https://basma-voice.brainsait.org',
    },
    realtime: {
      socketAuthPath: '/widget/session-token',
      transport: 'websocket',
    },
  });
});

widgetPublicRoutes.get('/session-token', async (c) => {
  const hostname = resolveHostname(
    c.req.query('domain')
      || c.req.header('Origin')
      || c.req.header('Referer'),
  );

  if (!hostname) {
    return c.json({ error: 'Domain is required' }, 400);
  }

  const integration = await c.env.DB.prepare(
    `SELECT domain
     FROM integrations
     WHERE domain = ? AND verified = 1
     LIMIT 1`,
  ).bind(hostname).first<{ domain: string }>();

  if (!FIRST_PARTY_DOMAINS.has(hostname) && !integration) {
    return c.json({ error: 'Domain not authorized' }, 403);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = decodeJwtExpirySeconds(
    c.env.WIDGET_TOKEN_TTL_SECONDS,
    DEFAULT_WIDGET_TOKEN_TTL_SECONDS,
  );
  const sessionId = c.req.query('session') || crypto.randomUUID();

  const payload = {
    sid: sessionId,
    dom: hostname,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    nonce: crypto.randomUUID(),
    scope: 'widget:voice',
  };

  const token = await issueWidgetSocketToken(c.env, payload);
  const voiceBase = c.env.BASMA_VOICE_URL || 'https://basma-voice.brainsait.org';
  const voiceUrl = new URL('/session', voiceBase);
  voiceUrl.searchParams.set('id', sessionId);
  voiceUrl.searchParams.set('token', token);
  voiceUrl.searchParams.set('domain', hostname);

  return c.json({
    sessionId,
    expiresAt: payload.exp,
    token,
    voiceWebSocketUrl: voiceUrl.toString().replace(/^http/i, 'ws'),
  });
});

export { widgetPublicRoutes };
