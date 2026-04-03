import { Hono } from 'hono';
import { Env } from '../index';
import { sendSms, sendWhatsApp } from '../services/notifications';
import { sendN8nEvent } from '../services/n8n';

const communications = new Hono<{ Bindings: Env }>();

// GET /api/communications/:visitorId - History for a visitor
communications.get('/:visitorId', async (c) => {
  const visitorId = c.req.param('visitorId');
  const userId = (c.get('jwtPayload') as any).sub;

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM communications WHERE visitor_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).bind(visitorId, userId).all();

  return c.json({ communications: results });
});

// POST /api/communications/sms - Send an outbound SMS
communications.post('/sms', async (c) => {
  const { to, message, visitorId } = await c.req.json();
  const userId = (c.get('jwtPayload') as any).sub;

  const result = await sendSms(c.env, { to, message });

  // Log in D1
  await c.env.DB.prepare(`
    INSERT INTO communications (
      id, user_id, visitor_id, channel, direction, message_content, status, external_id, created_at
    ) VALUES (?, ?, ?, 'sms', 'outbound', ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    visitorId,
    message,
    result.ok ? 'sent' : 'failed',
    result.externalId || result.error || 'error',
    Date.now()
  ).run();

  await sendN8nEvent(c.env, {
    event: 'communications.sms.outbound',
    source: 'basma-api',
    timestamp: Date.now(),
    payload: {
      visitorId,
      userId,
      phone: to,
      status: result.ok ? 'sent' : 'failed',
      externalId: result.externalId || null,
    },
  });

  return c.json({ success: result.ok, sid: result.externalId, error: result.error }, result.ok ? 200 : 502);
});

// POST /api/communications/whatsapp - Send a WhatsApp message
communications.post('/whatsapp', async (c) => {
  const { to, message, visitorId } = await c.req.json();
  const userId = (c.get('jwtPayload') as any).sub;

  const result = await sendWhatsApp(c.env, { to, message });

  // Log in D1
  await c.env.DB.prepare(`
    INSERT INTO communications (
      id, user_id, visitor_id, channel, direction, message_content, status, external_id, created_at
    ) VALUES (?, ?, ?, 'whatsapp', 'outbound', ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    visitorId,
    message,
    result.ok ? 'sent' : 'failed',
    result.externalId || result.error || 'error',
    Date.now()
  ).run();

  await sendN8nEvent(c.env, {
    event: 'communications.whatsapp.outbound',
    source: 'basma-api',
    timestamp: Date.now(),
    payload: {
      visitorId,
      userId,
      phone: to,
      status: result.ok ? 'sent' : 'failed',
      externalId: result.externalId || null,
    },
  });

  return c.json({ success: result.ok, id: result.externalId, error: result.error }, result.ok ? 200 : 502);
});

export { communications as communicationsRoutes };
