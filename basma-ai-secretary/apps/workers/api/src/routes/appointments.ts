import { Hono } from 'hono';
import { Env } from '../index';
import { listUpcomingAppointmentSlots, parsePositiveInt, RIYADH_TIMEZONE } from '../utils/scheduling';
import { buildAppointmentConfirmationMessage, sendSms, sendWhatsApp } from '../services/notifications';
import { sendN8nEvent } from '../services/n8n';

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

// GET /api/appointments/availability - Return the next available Basma scheduling slots
appointments.get('/availability', async (c) => {
  const userId = (c.get('jwtPayload') as any).sub;
  const durationMinutes = parsePositiveInt(c.req.query('duration'), 30, 90);
  const limit = parsePositiveInt(c.req.query('limit'), 3, 8);
  const now = Date.now();

  const { results } = await c.env.DB.prepare(`
    SELECT scheduled_time
    FROM appointments
    WHERE user_id = ?
      AND status IN ('scheduled', 'confirmed')
      AND scheduled_time >= ?
  `).bind(userId, now).all<{ scheduled_time: number }>();

  const slots = listUpcomingAppointmentSlots({
    count: limit,
    durationMinutes,
    startTime: now,
    bookedSlots: results.map((row) => Number(row.scheduled_time)).filter((value) => Number.isFinite(value)),
  });

  return c.json({
    timezone: RIYADH_TIMEZONE,
    slots,
  });
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

  const visitor = await c.env.DB.prepare(
    `SELECT id, name, phone, metadata FROM visitors WHERE id = ? AND user_id = ? LIMIT 1`,
  ).bind(body.visitor_id, userId).first<{ id: string; name: string | null; phone: string | null; metadata: string | null }>();

  const visitorMetadata = (() => {
    if (!visitor?.metadata) return {} as Record<string, unknown>;
    try {
      return JSON.parse(visitor.metadata) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();

  const locale = typeof visitorMetadata.locale === 'string' ? visitorMetadata.locale : 'en';
  const confirmationMessage = buildAppointmentConfirmationMessage({
    locale,
    visitorName: visitor?.name,
    appointmentType: body.type,
    scheduledTime: body.scheduled_time,
    timezone: body.timezone || 'Asia/Riyadh',
    meetingLink: body.meeting_link || null,
  });

  if (visitor?.phone) {
    const smsResult = await sendSms(c.env, {
      to: visitor.phone,
      message: confirmationMessage,
    });

    await c.env.DB.prepare(`
      INSERT INTO communications (
        id, user_id, visitor_id, channel, direction, message_content, status, external_id, created_at
      ) VALUES (?, ?, ?, 'sms', 'outbound', ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      visitor.id,
      confirmationMessage,
      smsResult.ok ? 'sent' : 'failed',
      smsResult.externalId || smsResult.error || 'error',
      Date.now(),
    ).run();

    const whatsappResult = await sendWhatsApp(c.env, {
      to: visitor.phone,
      message: confirmationMessage,
    });

    await c.env.DB.prepare(`
      INSERT INTO communications (
        id, user_id, visitor_id, channel, direction, message_content, status, external_id, created_at
      ) VALUES (?, ?, ?, 'whatsapp', 'outbound', ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      visitor.id,
      confirmationMessage,
      whatsappResult.ok ? 'sent' : 'failed',
      whatsappResult.externalId || whatsappResult.error || 'error',
      Date.now(),
    ).run();
  }

  await sendN8nEvent(c.env, {
    event: 'appointment.created',
    source: 'basma-api',
    timestamp: Date.now(),
    payload: {
      appointmentId,
      userId,
      visitorId: body.visitor_id,
      type: body.type,
      scheduledTime: body.scheduled_time,
      timezone: body.timezone || 'Asia/Riyadh',
      notes: body.notes || null,
    },
  });

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

  await sendN8nEvent(c.env, {
    event: 'appointment.status_updated',
    source: 'basma-api',
    timestamp: Date.now(),
    payload: {
      appointmentId,
      userId,
      status,
    },
  });

  return c.json({ message: 'Appointment updated' });
});

export { appointments as appointmentsRoutes };
