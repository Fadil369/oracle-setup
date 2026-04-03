import { Hono } from 'hono';
import { Env } from '../index';

const integrations = new Hono<{ Bindings: Env }>();

// GET /api/integrations - Active domains and widgets
integrations.get('/', async (c) => {
  const userId = (c.get('jwtPayload') as any).sub;

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM integrations WHERE user_id = ?
  `).bind(userId).all();

  return c.json({ integrations: results });
});

// POST /api/integrations - Add a new domain/service integrate
integrations.post('/', async (c) => {
  const userId = (c.get('jwtPayload') as any).sub;
  const { domain, widget_type, settings } = await c.req.json();
  const apiKey = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO integrations (
      id, user_id, domain, widget_type, settings, api_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    domain,
    widget_type || 'floating',
    JSON.stringify(settings || {}),
    apiKey,
    Date.now()
  ).run();

  return c.json({ apiKey, message: 'Integration added successfully' }, 201);
});

// GET /widget/config - Public endpoint for widget authentication
// No JWT required, uses Referer or Origin header for verification
integrations.get('/config', async (c) => {
  const origin = c.req.header('Origin') || c.req.header('Referer') || '';
  const domain = new URL(origin).hostname;

  const integration = await c.env.DB.prepare(`
    SELECT * FROM integrations WHERE domain = ? AND verified = 1
  `).bind(domain).first();

  if (!integration) {
    return c.json({ error: 'Domain not authorized' }, 403);
  }

  return c.json({
    settings: JSON.parse(integration.settings as string),
    voiceEnabled: true
  });
});

export { integrations as integrationsRoutes };
