import { DurableObject } from 'cloudflare:workers';
import { AIService } from '../../api/src/services/ai_service';
import { sendN8nEvent } from '../../api/src/services/n8n';
import { ensurePrimaryOwner } from '../../api/src/utils/owner';
import { MemoryBrain } from './memory_brain';

export interface Env {
  DB: D1Database;
  R2_STORAGE: R2Bucket;
  AI: any;
  BASMA_MEMORY_VECTOR: any;
  ANTHROPIC_API_KEY: string;
  BASMA_OWNER_EMAIL?: string;
  BASMA_OWNER_NAME?: string;
  N8N_WEBHOOK_URL?: string;
  N8N_WEBHOOK_TOKEN?: string;
  WIDGET_SOCKET_SECRET?: string;
  JWT_SECRET?: string;
  WIDGET_ALLOWED_ORIGINS?: string;
}

interface VoiceMessage {
  type: string;
  text?: string;
  target_peer_id?: string;
  locale?: 'ar' | 'en' | 'mixed';
  phone?: string;
  email?: string;
  name?: string;
  company?: string;
  [key: string]: unknown;
}

interface WidgetTokenPayload {
  sid: string;
  dom: string;
  iat: number;
  exp: number;
  nonce: string;
  scope: string;
}

const DEFAULT_WIDGET_ORIGINS = new Set([
  'elfadil.com',
  'www.elfadil.com',
  'thefadil.site',
  'www.thefadil.site',
  'brainsait.org',
  'www.brainsait.org',
  'bsma.brainsait.org',
  'basma.brainsait.org',
  'localhost',
]);

const AUTONOMOUS_ACTION_PREFIX = '[AUTONOMOUS_ACTION:';
const ALLOWED_AUTONOMOUS_ACTIONS = new Set([
  'send_meeting_invite',
  'sms_patient_link',
  'create_crm_task',
  'notify_partnership_team',
  'notify_support_team',
]);

function base64UrlToString(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const normalized = `${padded}${'='.repeat((4 - (padded.length % 4)) % 4)}`;
  return atob(normalized);
}

function resolveHostname(input: string | null) {
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

function parseAllowedOrigins(raw: string | undefined) {
  if (!raw || !raw.trim()) {
    return DEFAULT_WIDGET_ORIGINS;
  }

  return new Set(
    raw
      .split(',')
      .map((value) => resolveHostname(value))
      .filter((value): value is string => Boolean(value)),
  );
}

function isValidPayload(payload: unknown): payload is WidgetTokenPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.sid === 'string'
    && typeof candidate.dom === 'string'
    && typeof candidate.iat === 'number'
    && typeof candidate.exp === 'number'
    && typeof candidate.nonce === 'string'
    && candidate.scope === 'widget:voice'
  );
}

async function verifyTokenSignature(payloadBase64: string, signatureBase64: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signatureBytes = Uint8Array.from(base64UrlToString(signatureBase64), (char) => char.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(payloadBase64));
}

async function authenticateWidgetSocket(request: Request, env: Env, requestUrl: URL) {
  const token = requestUrl.searchParams.get('token');
  if (!token) {
    return { ok: false, status: 401, message: 'Missing widget token' } as const;
  }

  const [version, payloadBase64, signatureBase64] = token.split('.');
  if (version !== 'v1' || !payloadBase64 || !signatureBase64) {
    return { ok: false, status: 401, message: 'Malformed widget token' } as const;
  }

  const secret = env.WIDGET_SOCKET_SECRET || env.JWT_SECRET;
  if (!secret) {
    return { ok: false, status: 503, message: 'Widget socket secret is not configured' } as const;
  }

  const isSignatureValid = await verifyTokenSignature(payloadBase64, signatureBase64, secret);
  if (!isSignatureValid) {
    return { ok: false, status: 401, message: 'Invalid token signature' } as const;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlToString(payloadBase64));
  } catch {
    return { ok: false, status: 401, message: 'Invalid token payload' } as const;
  }

  if (!isValidPayload(payload)) {
    return { ok: false, status: 401, message: 'Unexpected token payload' } as const;
  }

  const requestedSessionId = requestUrl.searchParams.get('id');
  if (!requestedSessionId || payload.sid !== requestedSessionId) {
    return { ok: false, status: 401, message: 'Session mismatch' } as const;
  }

  const domainParam = resolveHostname(requestUrl.searchParams.get('domain'));
  if (!domainParam || domainParam !== payload.dom) {
    return { ok: false, status: 401, message: 'Domain mismatch' } as const;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now || payload.iat > now + 60) {
    return { ok: false, status: 401, message: 'Token expired or invalid issuance' } as const;
  }

  const allowedOrigins = parseAllowedOrigins(env.WIDGET_ALLOWED_ORIGINS);
  if (!allowedOrigins.has(payload.dom)) {
    return { ok: false, status: 403, message: 'Domain is not allowed for voice widget access' } as const;
  }

  const originHost = resolveHostname(request.headers.get('Origin'));
  if (originHost && originHost !== payload.dom) {
    return { ok: false, status: 403, message: 'Origin mismatch for widget socket request' } as const;
  }

  return { ok: true, sessionId: payload.sid } as const;
}

function inferLanguageHint(
  text: string,
  explicitLocale: VoiceMessage['locale'] | undefined,
  previousLanguage: unknown,
): 'ar' | 'en' | 'mixed' {
  if (explicitLocale === 'ar' || explicitLocale === 'en' || explicitLocale === 'mixed') {
    return explicitLocale;
  }

  if (previousLanguage === 'ar' || previousLanguage === 'en' || previousLanguage === 'mixed') {
    return previousLanguage;
  }

  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);

  if (hasArabic && hasLatin) {
    return 'mixed';
  }

  if (hasArabic) {
    return 'ar';
  }

  if (hasLatin) {
    return 'en';
  }

  return 'mixed';
}

export class VoiceSession extends DurableObject {
  private connections: Set<WebSocket> = new Set();
  private peers: Map<WebSocket, string> = new Map();
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private visitorData: Record<string, unknown> = {};
  private callStartTime: number = 0;
  private callPersisted = false;
  private env: Env;
  private lastFirstTokenLatencyMs: number | null = null;
  private sessionId = crypto.randomUUID();

  private async resolveKnownVisitorId() {
    const phone = typeof this.visitorData.phone === 'string' ? this.visitorData.phone : null;
    const email = typeof this.visitorData.email === 'string' ? this.visitorData.email : null;
    if (!phone && !email) {
      return null;
    }

    const owner = await ensurePrimaryOwner(this.env.DB, {
      email: this.env.BASMA_OWNER_EMAIL,
      name: this.env.BASMA_OWNER_NAME,
      companyName: 'BrainSAIT',
    });

    const visitor = await this.env.DB.prepare(`
      SELECT id
      FROM visitors
      WHERE user_id = ? AND ((? IS NOT NULL AND phone = ?) OR (? IS NOT NULL AND email = ?))
      ORDER BY last_contact DESC
      LIMIT 1
    `).bind(owner.id, phone, phone, email, email).first<{ id: string }>();

    return visitor?.id || null;
  }

  private extractAutonomousActions(text: string) {
    const actions: Array<{ action: string; payload: Record<string, unknown> }> = [];
    const pattern = /\[AUTONOMOUS_ACTION:(\{.*?\})\]/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]) as { action?: unknown; payload?: unknown };
        if (
          typeof parsed.action === 'string'
          && ALLOWED_AUTONOMOUS_ACTIONS.has(parsed.action)
          && parsed.payload
          && typeof parsed.payload === 'object'
          && !Array.isArray(parsed.payload)
        ) {
          actions.push({
            action: parsed.action,
            payload: parsed.payload as Record<string, unknown>,
          });
        }
      } catch {
        // Ignore malformed autonomous action markers.
      }
    }

    return actions;
  }

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const requestUrl = new URL(request.url);
    const authResult = await authenticateWidgetSocket(request, this.env, requestUrl);
    if (!authResult.ok) {
      return Response.json({ error: authResult.message }, { status: authResult.status });
    }

    this.sessionId = authResult.sessionId;

    const [client, server] = Object.values(new WebSocketPair());
    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(ws: WebSocket) {
    this.connections.add(ws);
    const peerId = crypto.randomUUID();
    this.peers.set(ws, peerId);
    this.callStartTime = Date.now();
    ws.accept();

    ws.send(JSON.stringify({
      type: 'session_ready',
      peer_id: peerId,
      session_id: this.sessionId,
      connected_peers: this.connections.size,
      target_latency_ms: 1500,
      transport: ['websocket', 'webrtc_signaling'],
    }));

    this.broadcastExcept(ws, {
      type: 'peer_joined',
      peer_id: peerId,
      connected_peers: this.connections.size,
    });

    ws.addEventListener('message', async (event) => {
      try {
        const data = this.parseMessage(event.data as string);

        if (data.type === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
            echo: data.timestamp ?? null,
          }));
          return;
        }

        if (data.type === 'webrtc_offer' || data.type === 'webrtc_answer' || data.type === 'webrtc_ice_candidate') {
          const fromPeerId = this.peers.get(ws);
          if (!fromPeerId) {
            return;
          }

          if (typeof data.target_peer_id === 'string' && data.target_peer_id.trim()) {
            this.sendToPeer(data.target_peer_id, {
              ...data,
              from_peer_id: fromPeerId,
            });
          } else {
            this.broadcastExcept(ws, {
              ...data,
              from_peer_id: fromPeerId,
            });
          }
          return;
        }

        if (data.type === 'user_message') {
          const userMessage = typeof data.text === 'string' ? data.text.trim() : '';
          if (!userMessage) {
            ws.send(JSON.stringify({ type: 'error', message: 'Empty user message' }));
            return;
          }

          this.visitorData = {
            ...this.visitorData,
            ...(typeof data.phone === 'string' ? { phone: data.phone } : {}),
            ...(typeof data.email === 'string' ? { email: data.email } : {}),
            ...(typeof data.name === 'string' ? { name: data.name } : {}),
            ...(typeof data.company === 'string' ? { company: data.company } : {}),
          };

          if (!this.visitorData.visitorId) {
            const knownVisitorId = await this.resolveKnownVisitorId();
            if (knownVisitorId) {
              this.visitorData.visitorId = knownVisitorId;
            }
          }

          let memoryContext: any = await this.getMemoryContext();
          const brain = new MemoryBrain(this.env);
          if (this.visitorData.visitorId) {
            const semanticContext = await brain.retrieveContext(this.visitorData.visitorId as string, userMessage);
            memoryContext = {
              recentSQLMemory: memoryContext,
              deepSemanticMatches: semanticContext
            };
          }

          this.conversationHistory.push({ role: 'user', content: userMessage });

          const aiService = new AIService(this.env.ANTHROPIC_API_KEY);
          const responseStart = Date.now();
          const languageHint = inferLanguageHint(userMessage, data.locale, this.visitorData.language);

          ws.send(JSON.stringify({
            type: 'assistant_listening',
            session_id: this.sessionId,
            timestamp: responseStart,
          }));

          const stream = await aiService.processConversation(
            this.conversationHistory,
            {
              ...this.visitorData,
              session_id: this.sessionId,
              prior_memory: memoryContext,
              latency_target_ms: 1500,
            },
            {
              languageHint,
            },
          );

          let assistantResponse = '';
          let firstChunkSeen = false;
          const reader = stream.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = new TextDecoder().decode(value);

            const autonomousActions = this.extractAutonomousActions(text);
            for (const action of autonomousActions) {
              try {
                await sendN8nEvent(this.env, {
                  event: 'voice.autonomous_action',
                  source: 'basma-voice',
                  timestamp: Date.now(),
                  payload: {
                    action: action.action,
                    actionPayload: action.payload,
                    sessionId: this.sessionId,
                    visitorId: this.visitorData.visitorId || null,
                  },
                });
              } catch {
                // Keep the live stream flowing even if an automation endpoint is unavailable.
              }
            }

            assistantResponse += text;
            const cleanText = text
              .replace(/\[VARIOUS ACTIONS\]/g, '')
              .replace(/\[AUTONOMOUS_ACTION:\{.*?\}\]/g, '');
            if (cleanText.trim()) {
              ws.send(JSON.stringify({ type: 'ai_response_chunk', text: cleanText }));
            }

            if (!firstChunkSeen) {
              firstChunkSeen = true;
              this.lastFirstTokenLatencyMs = Date.now() - responseStart;
              ws.send(JSON.stringify({
                type: 'latency_report',
                metric: 'first_token_ms',
                value: this.lastFirstTokenLatencyMs,
                target_ms: 1500,
              }));
            }
          }

          this.conversationHistory.push({ role: 'assistant', content: assistantResponse });

          const extracted = await aiService.extractConversationInsights(
            this.conversationHistory.map((m) => `${m.role}: ${m.content}`).join('\n'),
          );
          this.visitorData = { ...this.visitorData, ...extracted };

          await this.upsertVisitorLeadAndMemory();
        }

        if (data.type === 'end_call') {
          await this.saveCallLog();
          ws.close();
          return;
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid voice payload' }));
      }
    });

    ws.addEventListener('close', async () => {
      this.connections.delete(ws);
      const departedPeer = this.peers.get(ws);
      this.peers.delete(ws);

      if (departedPeer) {
        this.broadcastExcept(ws, {
          type: 'peer_left',
          peer_id: departedPeer,
          connected_peers: this.connections.size,
        });
      }

      await this.saveCallLog();
    });
  }

  private parseMessage(raw: string): VoiceMessage {
    try {
      return JSON.parse(raw) as VoiceMessage;
    } catch {
      return { type: 'invalid' };
    }
  }

  private broadcastExcept(sender: WebSocket, payload: Record<string, unknown>) {
    const encoded = JSON.stringify(payload);
    for (const socket of this.connections) {
      if (socket === sender) {
        continue;
      }
      socket.send(encoded);
    }
  }

  private sendToPeer(targetPeerId: string, payload: Record<string, unknown>) {
    const encoded = JSON.stringify(payload);
    for (const [socket, peerId] of this.peers.entries()) {
      if (peerId === targetPeerId) {
        socket.send(encoded);
        return;
      }
    }
  }

  private async getMemoryContext() {
    const phone = typeof this.visitorData.phone === 'string' ? this.visitorData.phone : null;
    const email = typeof this.visitorData.email === 'string' ? this.visitorData.email : null;

    if (!phone && !email) {
      return [];
    }

    const { results } = await this.env.DB.prepare(`
      SELECT bm.memory_value, bm.sentiment, bm.language, bm.updated_at
      FROM basma_memory bm
      JOIN visitors v ON v.id = bm.visitor_id
      WHERE (? IS NOT NULL AND v.phone = ?) OR (? IS NOT NULL AND v.email = ?)
      ORDER BY bm.updated_at DESC
      LIMIT 5
    `).bind(phone, phone, email, email).all();

    return results || [];
  }

  private async upsertVisitorLeadAndMemory() {
    const owner = await ensurePrimaryOwner(this.env.DB, {
      email: this.env.BASMA_OWNER_EMAIL,
      name: this.env.BASMA_OWNER_NAME,
      companyName: 'BrainSAIT',
    });

    const now = Date.now();
    const phone = typeof this.visitorData.phone === 'string' ? this.visitorData.phone : null;
    const email = typeof this.visitorData.email === 'string' ? this.visitorData.email : null;
    const name = typeof this.visitorData.name === 'string' ? this.visitorData.name : null;
    const company = typeof this.visitorData.company === 'string' ? this.visitorData.company : null;
    const leadScore = Number.isFinite(Number(this.visitorData.lead_score))
      ? Math.max(0, Math.min(100, Number(this.visitorData.lead_score)))
      : 45;
    const status = leadScore >= 60 ? 'lead' : 'visitor';

    const visitor = await this.env.DB.prepare(`
      SELECT id FROM visitors
      WHERE user_id = ? AND ((? IS NOT NULL AND phone = ?) OR (? IS NOT NULL AND email = ?))
      ORDER BY last_contact DESC
      LIMIT 1
    `).bind(owner.id, phone, phone, email, email).first<{ id: string }>();

    const visitorId = visitor?.id || crypto.randomUUID();

    if (visitor?.id) {
      await this.env.DB.prepare(`
        UPDATE visitors
        SET name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            company = COALESCE(?, company),
            source = 'phone_call',
            last_contact = ?,
            total_interactions = total_interactions + 1,
            lead_score = ?,
            status = ?
        WHERE id = ?
      `).bind(name, phone, email, company, now, leadScore, status, visitorId).run();
    } else {
      await this.env.DB.prepare(`
        INSERT INTO visitors (
          id, user_id, name, phone, email, company, source,
          first_contact, last_contact, total_interactions, lead_score, status, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, 'phone_call', ?, ?, 1, ?, ?, ?)
      `).bind(
        visitorId,
        owner.id,
        name,
        phone,
        email,
        company,
        now,
        now,
        leadScore,
        status,
        JSON.stringify({
          session_id: this.sessionId,
          appointment_type: this.visitorData.appointment_type || 'general',
          preferred_times: this.visitorData.preferred_times || [],
        }),
      ).run();
    }

    await this.env.DB.prepare(`
      INSERT INTO leads (id, user_id, visitor_id, score, stage, source, notes, sentiment, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'voice', ?, ?, ?, ?)
      ON CONFLICT(visitor_id) DO UPDATE SET
        score = excluded.score,
        stage = excluded.stage,
        notes = excluded.notes,
        sentiment = excluded.sentiment,
        updated_at = excluded.updated_at
    `).bind(
      crypto.randomUUID(),
      owner.id,
      visitorId,
      leadScore,
      status === 'lead' ? 'qualified' : 'new',
      this.visitorData.summary || '',
      this.visitorData.sentiment || 'neutral',
      now,
      now,
    ).run();

    this.visitorData.userId = owner.id;
    this.visitorData.visitorId = visitorId;
  }

  async saveCallLog() {
    if (this.callPersisted || this.conversationHistory.length === 0) return;

    this.callPersisted = true;

    try {
      const owner = await ensurePrimaryOwner(this.env.DB, {
        email: this.env.BASMA_OWNER_EMAIL,
        name: this.env.BASMA_OWNER_NAME,
        companyName: 'BrainSAIT',
      });
      const duration = Math.floor((Date.now() - this.callStartTime) / 1000);
      const transcript = this.conversationHistory.map((message) => `${message.role}: ${message.content}`).join('\n\n');
      const callId = crypto.randomUUID();
      const firstUserMessage = this.conversationHistory.find((message) => message.role === 'user')?.content || 'Voice session started';

      const transcriptKey = `transcripts/${callId}.txt`;
      await this.env.R2_STORAGE.put(transcriptKey, transcript);

      await this.env.DB.prepare(`
        INSERT INTO call_logs (
          id, user_id, visitor_id, call_type, duration_seconds,
          summary, transcript_url, sentiment, language, action_items, created_at
        ) VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        callId,
        this.visitorData.userId || owner.id,
        this.visitorData.visitorId || null,
        duration,
        firstUserMessage.substring(0, 200),
        transcriptKey,
        this.visitorData.sentiment || 'neutral',
        this.visitorData.language || 'mixed',
        JSON.stringify(this.visitorData.action_items || []),
        Date.now(),
      ).run();

      await this.env.DB.prepare(`
        INSERT INTO basma_memory (
          id, user_id, visitor_id, call_id, memory_key, memory_value,
          sentiment, language, confidence, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        this.visitorData.userId || owner.id,
        this.visitorData.visitorId || null,
        callId,
        'last_call_context',
        JSON.stringify({
          session_id: this.sessionId,
          summary: firstUserMessage.substring(0, 200),
          transcript_key: transcriptKey,
          first_token_latency_ms: this.lastFirstTokenLatencyMs,
          extracted: this.visitorData,
        }),
        this.visitorData.sentiment || 'neutral',
        this.visitorData.language || 'mixed',
        0.75,
        Date.now(),
      ).run();

      // Fire off into semantic vector memory for RAG lookups next time they call
      const brain = new MemoryBrain(this.env);
      if (this.visitorData.visitorId) {
        await brain.encodeAndStore({
          visitorId: this.visitorData.visitorId as string,
          callId,
          summary: firstUserMessage.substring(0, 200),
          sentiment: (this.visitorData.sentiment as string) || 'neutral',
          language: (this.visitorData.language as string) || 'mixed'
        });
      }

      await sendN8nEvent(this.env, {
        event: 'voice.call.completed',
        source: 'basma-voice',
        timestamp: Date.now(),
        payload: {
          callId,
          sessionId: this.sessionId,
          userId: this.visitorData.userId || owner.id,
          visitorId: this.visitorData.visitorId || null,
          durationSeconds: duration,
          firstTokenLatencyMs: this.lastFirstTokenLatencyMs,
          sentiment: this.visitorData.sentiment || 'neutral',
          language: this.visitorData.language || 'mixed',
        },
      });
    } catch (error) {
      this.callPersisted = false;
      console.error('Failed to persist voice session:', error);
    }
  }
}
