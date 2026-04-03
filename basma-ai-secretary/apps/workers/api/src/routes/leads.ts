import { Hono } from 'hono';
import { Env } from '../index';
import { sendN8nEvent } from '../services/n8n';

const leads = new Hono<{ Bindings: Env }>();

// GET /api/leads - Priority leads for the CRM
leads.get('/', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;

  const { results } = await c.env.DB.prepare(`
    SELECT
      l.*, v.name, v.phone, v.email, v.company, v.status AS visitor_status,
      s.name as segment_name, s.color as segment_color
    FROM leads l
    JOIN visitors v ON l.visitor_id = v.id
    LEFT JOIN segments s ON v.segment_id = s.id
    WHERE l.user_id = ?
    ORDER BY l.score DESC, l.updated_at DESC
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

  await c.env.DB.prepare(`
    INSERT INTO leads (id, user_id, visitor_id, score, stage, source, notes, sentiment, created_at, updated_at)
    SELECT ?, ?, v.id, v.lead_score, 'new', 'manual', NULL, 'neutral', ?, ?
    FROM visitors v
    WHERE v.id = ? AND v.user_id = ?
    ON CONFLICT(visitor_id) DO UPDATE SET
      score = (SELECT lead_score FROM visitors WHERE id = excluded.visitor_id),
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    userId,
    Date.now(),
    Date.now(),
    visitorId,
    userId,
  ).run();

  await sendN8nEvent(c.env, {
    event: 'lead.score_updated',
    source: 'basma-api',
    timestamp: Date.now(),
    payload: {
      visitorId,
      userId,
      scoreChange,
    },
  });

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

  await c.env.DB.prepare(`
    INSERT INTO leads (id, user_id, visitor_id, score, stage, source, notes, sentiment, created_at, updated_at)
    SELECT ?, ?, v.id, v.lead_score,
      CASE WHEN ? = 'customer' THEN 'won' WHEN ? = 'lead' THEN 'qualified' ELSE 'new' END,
      'crm', NULL, 'neutral', ?, ?
    FROM visitors v
    WHERE v.id = ? AND v.user_id = ?
    ON CONFLICT(visitor_id) DO UPDATE SET
      stage = CASE
        WHEN excluded.stage = 'won' THEN 'won'
        WHEN excluded.stage = 'qualified' THEN 'qualified'
        ELSE leads.stage
      END,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    userId,
    status,
    status,
    Date.now(),
    Date.now(),
    visitorId,
    userId,
  ).run();

  await sendN8nEvent(c.env, {
    event: 'lead.status_updated',
    source: 'basma-api',
    timestamp: Date.now(),
    payload: {
      visitorId,
      userId,
      status,
    },
  });

  return c.json({ message: 'Status updated' });
});

export { leads as leadsRoutes };
