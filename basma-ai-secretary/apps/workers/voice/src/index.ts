import { VoiceSession } from './voice_session';

export { VoiceSession };

const SEC_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

function secureJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...SEC_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return secureJson({
        service: 'Basma Voice Worker',
        status: 'operational',
        transport: ['websocket', 'webrtc-signaling'],
        latency_target_ms: 1500,
        timestamp: Date.now(),
      });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return secureJson({
        service: 'Basma Voice Worker',
        websocket: `${url.origin}/session?id=<session-id>`,
        webrtc_signaling: `${url.origin}/session?id=<session-id>`,
        ai_model: 'claude-3-5-sonnet-20240620',
        languages: ['ar', 'en', 'mixed'],
        status: 'ready',
      });
    }

    const sessionId = url.searchParams.get('id') || crypto.randomUUID();
    const id = env.VOICE_SESSION.idFromName(sessionId);
    const obj = env.VOICE_SESSION.get(id);

    return obj.fetch(request);
  }
};
