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

export { integrations as integrationsRoutes };
