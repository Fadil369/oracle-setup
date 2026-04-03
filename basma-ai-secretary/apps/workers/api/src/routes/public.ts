import { Hono } from 'hono';
import { Env } from '../index';
import { ensurePrimaryOwner } from '../utils/owner';
import { listUpcomingAppointmentSlots, parsePositiveInt, RIYADH_TIMEZONE } from '../utils/scheduling';
import { sendN8nEvent } from '../services/n8n';

const publicRoutes = new Hono<{ Bindings: Env }>();

const APPOINTMENT_TYPES = ['demo', 'consultation', 'technical_support', 'partnership'] as const;

function resolveHostname(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return input
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();
  }
}

function getBasmaUrls(env: Env) {
  return {
    web: env.BASMA_WEB_URL || 'https://bsma.brainsait.org',
    api: env.BASMA_API_URL || 'https://basma-api.brainsait.org',
    voice: env.BASMA_VOICE_URL || 'https://basma-voice.brainsait.org',
    widget: env.BASMA_WIDGET_URL || 'https://basma.brainsait.org/widget.js',
  };
}

async function probeJson(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return { ok: false, status: 'degraded', latencyMs, code: response.status };
    }

    const json = await response.json().catch(() => ({}));
    return { ok: true, status: 'operational', latencyMs, code: response.status, json };
  } catch {
    return { ok: false, status: 'offline', latencyMs: Date.now() - startedAt, code: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function computeLeadScore(inquiryType: string, channel: string) {
  const inquiryWeights: Record<string, number> = {
    partnership: 88,
    demo: 76,
    consultation: 68,
    technical_support: 52,
    support: 50,
    general: 42,
  };
  const channelBonus = ['voice', 'phone_call', 'whatsapp'].includes(channel) ? 8 : 0;
  return Math.min(99, (inquiryWeights[inquiryType] || inquiryWeights.general) + channelBonus);
}

publicRoutes.get('/manifest', async (c) => {
  const urls = getBasmaUrls(c.env);
  return c.json({
    platform: 'Basma AI Secretary',
    status: 'operational',
    version: '1.0.0',
    voice: {
      realtime: true,
      languages: ['ar', 'en'],
      widgetUrl: urls.widget,
      websocketGateway: urls.voice,
    },
    crm: {
      appointmentTypes: APPOINTMENT_TYPES,
      timezone: RIYADH_TIMEZONE,
      workingHours: 'Sunday-Thursday 09:00-18:00',
      channels: ['voice', 'web_widget', 'telegram', 'whatsapp', 'sms'],
    },
    integrations: {
      portalEntry: 'https://brainsait.org/bsma',
      dashboard: urls.web,
      bos: true,
      bot: true,
      maos: true,
      telegram: true,
      n8n: true,
    },
    timestamp: Date.now(),
  });
});

publicRoutes.get('/platform-status', async (c) => {
  const urls = getBasmaUrls(c.env);
  const apiHealthUrl = `${urls.api.replace(/\/$/, '')}/health`;
  const voiceHealthUrl = `${urls.voice.replace(/\/$/, '')}/health`;
  const serverStatusUrl = c.env.BASMA_SERVER_STATUS_URL
    ? c.env.BASMA_SERVER_STATUS_URL
    : apiHealthUrl;

  const [apiProbe, voiceProbe, serverProbe] = await Promise.all([
    probeJson(apiHealthUrl, 2500),
    probeJson(voiceHealthUrl, 2500),
    probeJson(serverStatusUrl, 2500),
  ]);

  const serviceStatuses = [apiProbe.status, voiceProbe.status, serverProbe.status];
  const platformStatus = serviceStatuses.includes('offline')
    ? 'incident'
    : (serviceStatuses.includes('degraded') ? 'degraded' : 'operational');

  const averageLatencyMs = Math.round((apiProbe.latencyMs + voiceProbe.latencyMs + serverProbe.latencyMs) / 3);

  return c.json({
    status: platformStatus,
    timestamp: Date.now(),
    locale: 'ar-en',
    summary: {
      averageLatencyMs,
      websocketReady: voiceProbe.ok,
      widgetReady: true,
    },
    services: [
      {
        id: 'api',
        name: 'Basma API',
        status: apiProbe.status,
        latencyMs: apiProbe.latencyMs,
        httpCode: apiProbe.code,
        endpoint: apiHealthUrl,
      },
      {
        id: 'voice',
        name: 'Realtime Voice Worker',
        status: voiceProbe.status,
        latencyMs: voiceProbe.latencyMs,
        httpCode: voiceProbe.code,
        endpoint: voiceHealthUrl,
      },
      {
        id: 'platform',
        name: 'Platform Status Aggregator',
        status: serverProbe.status,
        latencyMs: serverProbe.latencyMs,
        httpCode: serverProbe.code,
        endpoint: serverStatusUrl,
      },
    ],
    links: {
      dashboard: urls.web,
      widget: urls.widget,
      voice: urls.voice,
    },
  });
});

publicRoutes.get('/availability', async (c) => {
  const durationMinutes = parsePositiveInt(c.req.query('duration'), 30, 90);
  const limit = parsePositiveInt(c.req.query('limit'), 3, 8);
  const slots = listUpcomingAppointmentSlots({
    count: limit,
    durationMinutes,
  });

  return c.json({
    timezone: RIYADH_TIMEZONE,
    workingHours: {
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      start: '09:00',
      end: '18:00',
    },
    appointmentTypes: APPOINTMENT_TYPES,
    slots,
  });
});

publicRoutes.post('/intake', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const company = typeof body.company === 'string' ? body.company.trim() : '';

  if (!name && !phone && !email && !company) {
    return c.json({
      error: 'At least one contact field is required',
      required: ['name', 'phone', 'email', 'company'],
    }, 400);
  }

  const inquiryType = typeof body.inquiryType === 'string'
    ? body.inquiryType.trim().toLowerCase()
    : 'general';
  const requestedAppointmentType = APPOINTMENT_TYPES.includes(inquiryType as typeof APPOINTMENT_TYPES[number])
    ? inquiryType
    : 'consultation';
  const channel = typeof body.channel === 'string' ? body.channel.trim().toLowerCase() : 'web_widget';
  const sourceDomain = resolveHostname(
    typeof body.domain === 'string' ? body.domain : c.req.header('Origin') || c.req.header('Referer'),
  );
  const source = typeof body.source === 'string' && body.source.trim()
    ? body.source.trim()
    : (sourceDomain ? `widget:${sourceDomain}` : 'web_widget');
  const leadScore = computeLeadScore(inquiryType, channel);
  const status = leadScore >= 60 ? 'lead' : 'visitor';

  const owner = await ensurePrimaryOwner(c.env.DB, {
    email: c.env.BASMA_OWNER_EMAIL,
    name: c.env.BASMA_OWNER_NAME,
    companyName: 'BrainSAIT',
  });

  const visitorId = crypto.randomUUID();
  const now = Date.now();
  const metadata = {
    inquiryType,
    requestedAppointmentType,
    preferredTimes: body.preferredTimes || null,
    notes: body.notes || null,
    locale: body.locale || 'ar',
    channel,
    domain: sourceDomain,
    sourceContext: body.sourceContext || null,
    metadata: body.metadata || {},
  };

  await c.env.DB.prepare(
    `INSERT INTO visitors (
      id, user_id, name, phone, email, company, source,
      first_contact, last_contact, total_interactions,
      lead_score, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    visitorId,
    owner.id,
    name || null,
    phone || null,
    email || null,
    company || null,
    source,
    now,
    now,
    1,
    leadScore,
    status,
    JSON.stringify(metadata),
  ).run();

  await c.env.DB.prepare(`
    INSERT INTO leads (
      id, user_id, visitor_id, score, stage, source, source_channel,
      sentiment, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'neutral', ?, ?, ?, ?)
    ON CONFLICT(visitor_id) DO UPDATE SET
      score = MAX(leads.score, excluded.score),
      stage = excluded.stage,
      source = excluded.source,
      source_channel = excluded.source_channel,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    owner.id,
    visitorId,
    leadScore,
    leadScore >= 75 ? 'qualified' : 'new',
    source,
    channel,
    status === 'lead' ? 'open' : 'nurturing',
    `Intake from ${channel} (${inquiryType})`,
    now,
    now,
  ).run();

  await sendN8nEvent(c.env, {
    event: 'lead.created',
    source: 'basma-api',
    timestamp: Date.now(),
    payload: {
      visitorId,
      ownerId: owner.id,
      name: name || null,
      phone: phone || null,
      email: email || null,
      company: company || null,
      status,
      leadScore,
      source,
      inquiryType,
      channel,
    },
  });

  return c.json({
    id: visitorId,
    status,
    leadScore,
    ownerId: owner.id,
    suggestedSlots: listUpcomingAppointmentSlots({
      count: 3,
      durationMinutes: 30,
    }),
  }, 201);
});

export { publicRoutes };
