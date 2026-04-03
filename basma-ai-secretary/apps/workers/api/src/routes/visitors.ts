import { Hono } from 'hono';
import { Env } from '../index';

const visitors = new Hono<{ Bindings: Env }>();

// GET /api/visitors - Paginated visitors with filtering and segmentation
visitors.get('/', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;
  const { segment, status, search, page = '1', limit = '50' } = c.req.query();
  
  let query = `
    SELECT v.*, s.name as segment_name, s.color as segment_color
    FROM visitors v
    LEFT JOIN segments s ON v.segment_id = s.id
    WHERE v.user_id = ?
  `;
  const params: any[] = [userId];

  if (segment) {
    query += ` AND v.segment_id = ?`;
    params.push(segment);
  }

  if (status) {
    query += ` AND v.status = ?`;
    params.push(status);
  }

  if (search) {
    query += ` AND (v.name LIKE ? OR v.email LIKE ? OR v.phone LIKE ?)`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ` ORDER BY v.last_contact DESC LIMIT ? OFFSET ?`;
  const limitNum = parseInt(limit);
  const offsetNum = (parseInt(page) - 1) * limitNum;
  params.push(limitNum, offsetNum);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ 
    visitors: results,
    page: parseInt(page),
    limit: limitNum
  });
});

// GET /api/visitors/:id - Detailed visitor info with interaction history
visitors.get('/:id', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;
  const visitorId = c.req.param('id');

  const visitor = await c.env.DB.prepare(`
    SELECT v.*, s.name as segment_name, s.color as segment_color
    FROM visitors v
    LEFT JOIN segments s ON v.segment_id = s.id
    WHERE v.id = ? AND v.user_id = ?
  `).bind(visitorId, userId).first();

  if (!visitor) {
    return c.json({ error: 'Visitor not found' }, 404);
  }

  // Get calls, communications, and appointments
  const { results: calls } = await c.env.DB.prepare(`
    SELECT * FROM call_logs WHERE visitor_id = ? ORDER BY created_at DESC
  `).bind(visitorId).all();

  const { results: communications } = await c.env.DB.prepare(`
    SELECT * FROM communications WHERE visitor_id = ? ORDER BY created_at DESC
  `).bind(visitorId).all();

  const { results: appointments } = await c.env.DB.prepare(`
    SELECT * FROM appointments WHERE visitor_id = ? ORDER BY scheduled_time DESC
  `).bind(visitorId).all();

  return c.json({
    visitor,
    interactions: {
      calls,
      communications,
      appointments
    }
  });
});

// POST /api/visitors - Manual visitor creation
visitors.post('/', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;
  const body = await c.req.json();

  const visitorId = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(`
    INSERT INTO visitors (
      id, user_id, name, phone, email, company, source,
      first_contact, last_contact, metadata, lead_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    visitorId,
    userId,
    body.name || null,
    body.phone || null,
    body.email || null,
    body.company || null,
    body.source || 'manual',
    now,
    now,
    JSON.stringify(body.metadata || {}),
    body.lead_score || 0
  ).run();

  return c.json({ id: visitorId, message: 'Visitor created' }, 201);
});

export { visitors as visitorsRoutes };
