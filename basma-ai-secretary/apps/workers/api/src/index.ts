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
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for BrainSAIT domains
app.use('*', cors({
  origin: ['https://elfadil.com', 'https://thefadil.site', 'https://brainsait.org', 'http://localhost:3000'],
  credentials: true,
}));

// Apply Rate Limiting
app.use('*', rateLimitMiddleware);

// Public routes
app.route('/auth', authRoutes);
app.route('/widget', integrationsRoutes); // Widget access

// Protected routes (JWT)
app.use('/api/*', (c, next) => {
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
app.get('/health', (c) => c.json({ status: 'healthy', timestamp: Date.now() }));

export default app;
