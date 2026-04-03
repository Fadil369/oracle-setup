import { Hono } from 'hono';
import { Env } from '../index';

const leads = new Hono<{ Bindings: Env }>();

// GET /api/leads - Priority leads for the CRM
leads.get('/', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;

  const { results } = await c.env.DB.prepare(`
    SELECT v.*, s.name as segment_name, s.color as segment_color
    FROM visitors v
    LEFT JOIN segments s ON v.segment_id = s.id
    WHERE v.user_id = ? AND v.status = 'lead'
    ORDER BY v.lead_score DESC, v.last_contact DESC
  `).bind(userId).all();

  return c.json({ leads: results });
});

// POST /api/leads/:id/score - Manually adjust lead score
leads.post('/:id/score', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;
  const visitorId = c.req.param('id');
  const { scoreChange } = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE visitors SET lead_score = lead_score + ? WHERE id = ? AND user_id = ?
  `).bind(scoreChange, visitorId, userId).run();

  return c.json({ message: 'Lead score updated' });
});

// POST /api/leads/:id/update-status - Move between visitor, lead, customer
leads.post('/:id/update-status', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;
  const visitorId = c.req.param('id');
  const { status } = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE visitors SET status = ? WHERE id = ? AND user_id = ?
  `).bind(status, visitorId, userId).run();

  return c.json({ message: 'Status updated' });
});

export { leads as leadsRoutes };
