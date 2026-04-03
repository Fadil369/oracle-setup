import { Hono } from 'hono';
import { Env } from '../index';
import { sendN8nEvent } from '../services/n8n';

const communicationsWebhooks = new Hono<{ Bindings: Env }>();

communicationsWebhooks.post('/twilio', async (c) => {
  const bodyText = await c.req.text();
  const params = new URLSearchParams(bodyText);
  const from = params.get('From');
  const message = params.get('Body') || '';
  const messageSid = params.get('MessageSid') || crypto.randomUUID();

  if (!from) {
    return c.json({ error: 'Missing sender' }, 400);
  }

  const visitor = await c.env.DB.prepare(
    `SELECT id, user_id FROM visitors WHERE phone = ? ORDER BY last_contact DESC LIMIT 1`,
  ).bind(from).first<{ id: string; user_id: string }>();

  if (visitor?.id) {
    await c.env.DB.prepare(`
      INSERT INTO communications (
        id, user_id, visitor_id, channel, direction, message_content, status, external_id, created_at
      ) VALUES (?, ?, ?, 'sms', 'inbound', ?, 'delivered', ?, ?)
    `).bind(
      crypto.randomUUID(),
      visitor.user_id,
      visitor.id,
      message,
      messageSid,
      Date.now(),
    ).run();

    await c.env.DB.prepare(`UPDATE visitors SET last_contact = ?, total_interactions = total_interactions + 1 WHERE id = ?`)
      .bind(Date.now(), visitor.id)
      .run();

    await sendN8nEvent(c.env, {
      event: 'communications.sms.inbound',
      source: 'basma-api',
      timestamp: Date.now(),
      payload: {
        visitorId: visitor.id,
        userId: visitor.user_id,
        phone: from,
        message,
        externalId: messageSid,
      },
    });
  }

  return c.text('ok');
});

communicationsWebhooks.post('/whatsapp', async (c) => {
  const body = await c.req.json<any>();
  const changes = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = changes?.messages?.[0];
  const from = msg?.from as string | undefined;
  const text = msg?.text?.body as string | undefined;
  const externalId = msg?.id as string | undefined;

  if (!from || !text) {
    return c.json({ received: true });
  }

  const visitor = await c.env.DB.prepare(
    `SELECT id, user_id FROM visitors WHERE phone = ? ORDER BY last_contact DESC LIMIT 1`,
  ).bind(from).first<{ id: string; user_id: string }>();

  if (visitor?.id) {
    await c.env.DB.prepare(`
      INSERT INTO communications (
        id, user_id, visitor_id, channel, direction, message_content, status, external_id, created_at
      ) VALUES (?, ?, ?, 'whatsapp', 'inbound', ?, 'delivered', ?, ?)
    `).bind(
      crypto.randomUUID(),
      visitor.user_id,
      visitor.id,
      text,
      externalId || crypto.randomUUID(),
      Date.now(),
    ).run();

    await c.env.DB.prepare(`UPDATE visitors SET last_contact = ?, total_interactions = total_interactions + 1 WHERE id = ?`)
      .bind(Date.now(), visitor.id)
      .run();

    await sendN8nEvent(c.env, {
      event: 'communications.whatsapp.inbound',
      source: 'basma-api',
      timestamp: Date.now(),
      payload: {
        visitorId: visitor.id,
        userId: visitor.user_id,
        phone: from,
        message: text,
        externalId: externalId || null,
      },
    });
  }

  return c.json({ received: true });
});

export { communicationsWebhooks as communicationsWebhooksRoutes };
