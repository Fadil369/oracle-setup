import { Hono } from 'hono';
import { Env } from '../index';

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

  // TWILIO: Actual Twilio integration
  const url = `https://api.twilio.com/2010-04-01/Accounts/${c.env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${c.env.TWILIO_ACCOUNT_SID}:${c.env.TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: c.env.TWILIO_PHONE_NUMBER,
      Body: message
    })
  });

  const body = await response.json() as any;

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
    response.ok ? 'sent' : 'failed',
    body.sid || 'error',
    Date.now()
  ).run();

  return c.json({ success: response.ok, sid: body.sid });
});

// POST /api/communications/whatsapp - Send a WhatsApp message
communications.post('/whatsapp', async (c) => {
  const { to, message, visitorId } = await c.req.json();
  const userId = (c.get('jwtPayload') as any).sub;

  // WHATSAPP: Graph API logic (simplified)
  const response = await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.WHATSAPP_BUSINESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    })
  });

  const resBody = await response.json() as any;

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
    response.ok ? 'sent' : 'failed',
    resBody.messages?.[0]?.id || 'error',
    Date.now()
  ).run();

  return c.json({ success: response.ok, id: resBody.messages?.[0]?.id });
});

export { communications as communicationsRoutes };
