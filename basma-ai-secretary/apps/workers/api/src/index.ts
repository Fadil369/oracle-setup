import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { authRoutes } from './routes/auth';
import { visitorsRoutes } from './routes/visitors';
import { appointmentsRoutes } from './routes/appointments';
import { communicationsRoutes } from './routes/communications';
import { leadsRoutes } from './routes/leads';
import { analyticsRoutes } from './routes/analytics';
import { integrationsRoutes } from './routes/integrations';
import { telegramRoutes } from './routes/telegram';
import { publicRoutes } from './routes/public';
import { widgetPublicRoutes } from './routes/widget_public';
import { communicationsWebhooksRoutes } from './routes/communications_webhooks';
import { rateLimitMiddleware } from './middleware/rate_limit';

export interface Env {
  DB: D1Database;
  R2_STORAGE: R2Bucket;
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;
  RATE_LIMIT: KVNamespace;
  VOICE_SESSION: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  WHATSAPP_BUSINESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  N8N_WEBHOOK_URL?: string;
  N8N_WEBHOOK_TOKEN?: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  BASMA_API_URL?: string;
  BASMA_WEB_URL?: string;
  BASMA_VOICE_URL?: string;
  BASMA_WIDGET_URL?: string;
  BASMA_OWNER_EMAIL?: string;
  BASMA_OWNER_NAME?: string;
  CORS_ALLOWED_ORIGINS?: string;
  BASMA_DESKTOP_API_BASE?: string;
  BASMA_DESKTOP_API_TOKEN?: string;
  BASMA_SERVER_STATUS_URL?: string;
  BASMA_AI_ROUTER_URL?: string;
  BASMA_AI_ROUTER_TOKEN?: string;
  WIDGET_SOCKET_SECRET?: string;
  WIDGET_TOKEN_TTL_SECONDS?: string;
}

const app = new Hono<{ Bindings: Env }>();
const DEFAULT_CORS_ORIGINS = [
  'https://elfadil.com',
  'https://www.elfadil.com',
  'https://thefadil.site',
  'https://www.thefadil.site',
  'https://brainsait.org',
  'https://www.brainsait.org',
  'https://bsma.brainsait.org',
  'https://basma.brainsait.org',
  'http://localhost:3000',
];

function resolveCorsOrigins(env: Env) {
  if (!env.CORS_ALLOWED_ORIGINS) {
    return DEFAULT_CORS_ORIGINS;
  }

  return env.CORS_ALLOWED_ORIGINS
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Enable CORS for BrainSAIT domains
app.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = resolveCorsOrigins(c.env);
    if (origin && allowedOrigins.includes(origin)) {
      return origin;
    }
    return allowedOrigins[0];
  },
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  credentials: true,
}));

app.use('*', async (c, next) => {
  await next();
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  c.header('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
});

// Apply Rate Limiting
app.use('*', rateLimitMiddleware);

// Public routes
app.route('/auth', authRoutes);
app.route('/public', publicRoutes);
app.route('/widget', widgetPublicRoutes);
app.route('/public/communications', communicationsWebhooksRoutes);
app.route('/telegram', telegramRoutes);

// Protected routes (JWT)
app.use('/api/*', (c, next) => {
  if (c.req.path === '/api/telegram/webhook') {
    return next();
  }
  const jwtMiddleware = jwt({ secret: c.env.JWT_SECRET });
  return jwtMiddleware(c, next);
});

app.route('/api/visitors', visitorsRoutes);
app.route('/api/leads', leadsRoutes);
app.route('/api/appointments', appointmentsRoutes);
app.route('/api/communications', communicationsRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/integrations', integrationsRoutes);
app.route('/api/telegram', telegramRoutes);

// Health Check
app.get('/health', (c) => c.json({
  platform: 'Basma AI Secretary',
  status: 'operational',
  version: '5.0.0',
  modules: ['crm', 'voice', 'widget', 'telegram'],
  channels: ['web_widget', 'voice', 'telegram', 'whatsapp', 'sms'],
  integrations: {
    bos: true,
    bot: true,
    maos: true,
    mcp: true,
    n8n: true,
    cua_desktops: true,
    portalEntry: 'https://brainsait.org/bsma',
    dashboard: c.env.BASMA_WEB_URL || 'https://bsma.brainsait.org',
    commandCenter: true,
  },
  compliance: {
    hipaa: true,
    pdpl: true,
    nphies: true,
    fhir_r4: true,
  },
  timestamp: Date.now(),
}));

export default app;
