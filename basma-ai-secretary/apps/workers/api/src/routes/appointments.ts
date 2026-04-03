import { Hono } from 'hono';
import { Env } from '../index';

const appointments = new Hono<{ Bindings: Env }>();

// GET /api/appointments - List all appointments for the user
appointments.get('/', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;
  const { status, start, end } = c.req.query();

  let query = `
    SELECT a.*, v.name as visitor_name, v.email as visitor_email, v.phone as visitor_phone
    FROM appointments a
    JOIN visitors v ON a.visitor_id = v.id
    WHERE a.user_id = ?
  `;
  const params: any[] = [userId];

  if (status) {
    query += ` AND a.status = ?`;
    params.push(status);
  }

  if (start) {
    query += ` AND a.scheduled_time >= ?`;
    params.push(parseInt(start));
  }

  if (end) {
    query += ` AND a.scheduled_time <= ?`;
    params.push(parseInt(end));
  }

  query += ` ORDER BY a.scheduled_time ASC`;

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ appointments: results });
});

// POST /api/appointments - Book a new appointment
appointments.post('/', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;
  const body = await c.req.json();

  const appointmentId = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(`
    INSERT INTO appointments (
      id, user_id, visitor_id, type, scheduled_time, duration_minutes,
      timezone, status, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
  `).bind(
    appointmentId,
    userId,
    body.visitor_id,
    body.type,
    body.scheduled_time,
    body.duration_minutes || 30,
    body.timezone || 'Asia/Riyadh',
    body.notes || null,
    now
  ).run();

  return c.json({ id: appointmentId, message: 'Appointment scheduled' }, 201);
});

// PATCH /api/appointments/:id - Update appointment status (confirm, complete, cancel)
appointments.patch('/:id', async (c) => {
  const payload = c.get('jwtPayload') as any;
  const userId = payload.sub;
  const appointmentId = c.req.param('id');
  const { status } = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE appointments SET status = ? WHERE id = ? AND user_id = ?
  `).bind(status, appointmentId, userId).run();

  return c.json({ message: 'Appointment updated' });
});

export { appointments as appointmentsRoutes };
