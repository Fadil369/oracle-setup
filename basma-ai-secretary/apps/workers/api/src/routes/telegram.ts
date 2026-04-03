import { Hono } from 'hono';
import { Env } from '../index';

const telegram = new Hono<{ Bindings: Env }>();

// POST /api/telegram/webhook - Handle incoming Telegram commands
telegram.post('/webhook', async (c) => {
  const { message } = await c.req.json() as any;
  if (!message || !message.text) return c.json({ ok: true });

  const text = message.text;
  const chatId = message.chat.id;

  // Simple command router
  if (text === '/start') {
    return sendMessage(c, chatId, "Welcome to Basma AI Secretary! Use /leads, /visitors, or /appointments to manage BrainSAIT data.");
  }

  if (text === '/leads') {
    const { results } = await c.env.DB.prepare(`
      SELECT name, company, lead_score FROM visitors WHERE status = 'lead' ORDER BY lead_score DESC LIMIT 5
    `).all();
    
    let response = "🚀 *Top Lead Opportunities:*\n\n";
    results.forEach((v: any) => {
      response += `• ${v.name} (${v.company}) - Score: ${v.lead_score}\n`;
    });
    return sendMessage(c, chatId, response);
  }

  if (text === '/appointments') {
    const { results } = await c.env.DB.prepare(`
      SELECT a.scheduled_time, v.name, a.type 
      FROM appointments a JOIN visitors v ON a.visitor_id = v.id 
      WHERE a.status = 'scheduled' AND a.scheduled_time > ? 
      ORDER BY a.scheduled_time ASC LIMIT 5
    `).bind(Date.now()).all();

    let response = "📅 *Upcoming Appointments:*\n\n";
    results.forEach((a: any) => {
      const date = new Date(a.scheduled_time).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });
      response += `• ${date}: ${a.name} (${a.type})\n`;
    });
    return sendMessage(c, chatId, response);
  }

  return c.json({ ok: true });
});

async function sendMessage(c: any, chatId: number, text: string) {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
  return c.json({ ok: true });
}

export { telegram as telegramRoutes };
