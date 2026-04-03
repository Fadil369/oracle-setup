import { Hono } from 'hono';
import { Env } from '../index';
import { ensurePrimaryOwner } from '../utils/owner';

const telegram = new Hono<{ Bindings: Env }>();
const HELP_TEXT = [
  'Basma AI Secretary commands:',
  '/dev help - Desktop controls (list/view/screenshot)',
  '/server help - Infrastructure and service status',
  '/ai help - AI router commands',
  '/leads - Top lead opportunities',
  '/visitors - Recent visitor activity',
  '/appointments - Upcoming scheduled meetings',
  '/call-summary - Latest call summaries',
  '/help - Show this menu',
].join('\n');

const DEV_HELP = [
  'Desktop Commands:',
  '/dev list',
  '/dev view <desktop-id>',
  '/dev screenshot <desktop-id>',
].join('\n');

const SERVER_HELP = [
  'Server Commands:',
  '/server status',
  '/server desktops',
].join('\n');

const AI_HELP = [
  'AI Commands:',
  '/ai agents',
  '/ai ask <prompt>',
].join('\n');

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-GB', {
    timeZone: 'Asia/Riyadh',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function getCommand(text: string) {
  const [command, ...args] = text.trim().split(/\s+/);
  return { command: command.toLowerCase(), args };
}

async function desktopApiRequest(
  c: any,
  path: string,
  init?: RequestInit,
) {
  const base = c.env.BASMA_DESKTOP_API_BASE;
  if (!base) {
    return { error: 'BASMA_DESKTOP_API_BASE is not configured.' };
  }

  const token = c.env.BASMA_DESKTOP_API_TOKEN;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      error: payload?.error || `Desktop API error (${response.status})`,
    };
  }

  return payload;
}

async function aiRouterRequest(
  c: any,
  path: string,
  body?: Record<string, unknown>,
) {
  const base = c.env.BASMA_AI_ROUTER_URL;
  if (!base) {
    return { error: 'BASMA_AI_ROUTER_URL is not configured.' };
  }

  const token = c.env.BASMA_AI_ROUTER_TOKEN;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      error: payload?.error || `AI router error (${response.status})`,
    };
  }

  return payload;
}

async function handleDevCommand(c: any, chatId: number, args: string[]) {
  const action = (args[0] || 'help').toLowerCase();

  if (action === 'help') {
    return sendMessage(c, chatId, DEV_HELP);
  }

  if (action === 'list') {
    const payload = await desktopApiRequest(c, '/api/v1/desktops');
    if (payload.error) {
      return sendMessage(c, chatId, `Desktop cluster unavailable: ${payload.error}`);
    }

    const desktops = payload.desktops || payload.instances || [];
    if (!desktops.length) {
      return sendMessage(c, chatId, 'No running desktops in the Cua cluster.');
    }

    const lines = desktops.slice(0, 12).map((desktop: any) => {
      const id = desktop.id || desktop.instance_id || 'unknown';
      const status = desktop.status || 'unknown';
      const profile = desktop.profile || desktop.template || 'custom';
      return `• ${id} (${profile}) - ${status}`;
    });
    return sendMessage(c, chatId, `Running desktops:\n\n${lines.join('\n')}`);
  }

  if (action === 'view') {
    const desktopId = args[1];
    if (!desktopId) {
      return sendMessage(c, chatId, 'Usage: /dev view <desktop-id>');
    }

    const payload = await desktopApiRequest(c, `/api/v1/desktops/${desktopId}`);
    if (payload.error) {
      return sendMessage(c, chatId, `Unable to fetch desktop ${desktopId}: ${payload.error}`);
    }

    const vncUrl = payload.vnc_url || payload.browser_url || payload.url;
    if (!vncUrl) {
      return sendMessage(c, chatId, `Desktop ${desktopId} has no exposed VNC/browser URL yet.`);
    }

    return sendMessage(c, chatId, `Desktop ${desktopId}\nRemote view: ${vncUrl}`);
  }

  if (action === 'screenshot') {
    const desktopId = args[1];
    if (!desktopId) {
      return sendMessage(c, chatId, 'Usage: /dev screenshot <desktop-id>');
    }

    const payload = await desktopApiRequest(c, `/api/v1/desktops/${desktopId}/screenshot`, {
      method: 'POST',
    });
    if (payload.error) {
      return sendMessage(c, chatId, `Screenshot failed for ${desktopId}: ${payload.error}`);
    }

    const screenshotUrl = payload.screenshot_url || payload.url;
    if (screenshotUrl) {
      return sendPhoto(c, chatId, screenshotUrl, `Desktop ${desktopId} screenshot`);
    }

    return sendMessage(c, chatId, `Screenshot completed for ${desktopId}.`);
  }

  return sendMessage(c, chatId, DEV_HELP);
}

async function handleServerCommand(c: any, chatId: number, args: string[]) {
  const action = (args[0] || 'help').toLowerCase();

  if (action === 'help') {
    return sendMessage(c, chatId, SERVER_HELP);
  }

  if (action === 'status') {
    const statusUrl = c.env.BASMA_SERVER_STATUS_URL || `${c.env.BASMA_API_URL || ''}/health`;
    if (!statusUrl) {
      return sendMessage(c, chatId, 'BASMA_SERVER_STATUS_URL is not configured.');
    }

    const response = await fetch(statusUrl).catch(() => null);
    if (!response || !response.ok) {
      return sendMessage(c, chatId, `Server status check failed: ${statusUrl}`);
    }

    const payload = await response.json().catch(() => ({}));
    const status = payload.status || 'unknown';
    const version = payload.version || 'n/a';
    const platform = payload.platform || 'Basma Platform';
    return sendMessage(
      c,
      chatId,
      `Server status: ${status}\nPlatform: ${platform}\nVersion: ${version}`,
    );
  }

  if (action === 'desktops') {
    const payload = await desktopApiRequest(c, '/health');
    if (payload.error) {
      return sendMessage(c, chatId, `Desktop cluster health unavailable: ${payload.error}`);
    }

    const running = payload.running_instances ?? payload.running ?? 'unknown';
    const templates = payload.available_templates || [];
    return sendMessage(
      c,
      chatId,
      `Desktop cluster: online\nRunning instances: ${running}\nTemplates: ${templates.join(', ') || 'n/a'}`,
    );
  }

  return sendMessage(c, chatId, SERVER_HELP);
}

async function handleAiCommand(c: any, chatId: number, args: string[]) {
  const action = (args[0] || 'help').toLowerCase();

  if (action === 'help') {
    return sendMessage(c, chatId, AI_HELP);
  }

  if (action === 'agents') {
    const payload = await aiRouterRequest(c, '/agents');
    if (payload.error) {
      return sendMessage(c, chatId, `AI router unavailable: ${payload.error}`);
    }

    const agents = payload.agents || payload.results || [];
    if (!agents.length) {
      return sendMessage(c, chatId, 'No AI agents reported by the router.');
    }

    const names = agents.slice(0, 12).map((agent: any) => `• ${agent.name || agent.id || 'unknown'}`);
    return sendMessage(c, chatId, `Available AI agents:\n\n${names.join('\n')}`);
  }

  if (action === 'ask') {
    const prompt = args.slice(1).join(' ').trim();
    if (!prompt) {
      return sendMessage(c, chatId, 'Usage: /ai ask <prompt>');
    }

    const payload = await aiRouterRequest(c, '/chat', {
      prompt,
      source: 'telegram',
      timestamp: Date.now(),
    });
    if (payload.error) {
      return sendMessage(c, chatId, `AI request failed: ${payload.error}`);
    }

    const answer = payload.answer || payload.output || payload.response || 'No AI response payload.';
    return sendMessage(c, chatId, `AI:\n${String(answer).slice(0, 3500)}`);
  }

  return sendMessage(c, chatId, AI_HELP);
}

// POST /api/telegram/webhook - Handle incoming Telegram commands
telegram.post('/webhook', async (c) => {
  const { message } = await c.req.json() as any;
  if (!message || !message.text) return c.json({ ok: true });

  const text = String(message.text).trim();
  const chatId = message.chat.id;
  const owner = await ensurePrimaryOwner(c.env.DB, {
    email: c.env.BASMA_OWNER_EMAIL,
    name: c.env.BASMA_OWNER_NAME,
    companyName: 'BrainSAIT',
  });

  // Simple command router
  if (text === '/start' || text === '/help') {
    return sendMessage(c, chatId, HELP_TEXT);
  }

  const parsed = getCommand(text);
  if (parsed.command === '/dev') {
    return handleDevCommand(c, chatId, parsed.args);
  }

  if (parsed.command === '/server') {
    return handleServerCommand(c, chatId, parsed.args);
  }

  if (parsed.command === '/ai') {
    return handleAiCommand(c, chatId, parsed.args);
  }

  if (text === '/leads') {
    const { results } = await c.env.DB.prepare(`
      SELECT name, company, lead_score
      FROM visitors
      WHERE user_id = ? AND status = 'lead'
      ORDER BY lead_score DESC, last_contact DESC
      LIMIT 5
    `).bind(owner.id).all();

    if (!results.length) {
      return sendMessage(c, chatId, 'No lead opportunities are available yet.');
    }

    let response = 'Top Lead Opportunities:\n\n';
    results.forEach((v: any) => {
      response += `• ${v.name || 'Unknown visitor'} (${v.company || 'No company'}) - Score: ${v.lead_score}\n`;
    });
    return sendMessage(c, chatId, response);
  }

  if (text === '/visitors') {
    const { results } = await c.env.DB.prepare(`
      SELECT name, company, status, last_contact
      FROM visitors
      WHERE user_id = ?
      ORDER BY last_contact DESC
      LIMIT 5
    `).bind(owner.id).all();

    if (!results.length) {
      return sendMessage(c, chatId, 'No visitors have been captured yet.');
    }

    let response = 'Recent Visitors:\n\n';
    results.forEach((visitor: any) => {
      response += `• ${visitor.name || 'Unknown visitor'} - ${visitor.status} (${formatTimestamp(visitor.last_contact)})\n`;
    });
    return sendMessage(c, chatId, response);
  }

  if (text === '/appointments') {
    const { results } = await c.env.DB.prepare(`
      SELECT a.scheduled_time, v.name, a.type 
      FROM appointments a JOIN visitors v ON a.visitor_id = v.id 
      WHERE a.user_id = ? AND a.status IN ('scheduled', 'confirmed') AND a.scheduled_time > ? 
      ORDER BY a.scheduled_time ASC LIMIT 5
    `).bind(owner.id, Date.now()).all();

    if (!results.length) {
      return sendMessage(c, chatId, 'No scheduled appointments are on the calendar.');
    }

    let response = 'Upcoming Appointments:\n\n';
    results.forEach((a: any) => {
      const date = formatTimestamp(a.scheduled_time);
      response += `• ${date}: ${a.name} (${a.type})\n`;
    });
    return sendMessage(c, chatId, response);
  }

  if (text === '/call-summary') {
    const { results } = await c.env.DB.prepare(`
      SELECT summary, sentiment, created_at
      FROM call_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).bind(owner.id).all();

    if (!results.length) {
      return sendMessage(c, chatId, 'No call summaries are available yet.');
    }

    let response = 'Latest Call Summaries:\n\n';
    results.forEach((call: any) => {
      response += `• ${formatTimestamp(call.created_at)} - ${call.sentiment || 'neutral'} - ${call.summary || 'No summary'}\n`;
    });
    return sendMessage(c, chatId, response);
  }

  return sendMessage(c, chatId, HELP_TEXT);
});

async function sendMessage(c: any, chatId: number, text: string) {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured' }, 503);
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  return c.json({ ok: true });
}

async function sendPhoto(c: any, chatId: number, photoUrl: string, caption?: string) {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured' }, 503);
  }

  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption: caption || 'Desktop screenshot',
    }),
  });

  return c.json({ ok: true });
}

export { telegram as telegramRoutes };
