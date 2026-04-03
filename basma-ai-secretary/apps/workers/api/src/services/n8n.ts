export interface N8nEnv {
  N8N_WEBHOOK_URL?: string;
  N8N_WEBHOOK_TOKEN?: string;
}

export interface N8nEvent {
  event: string;
  source: 'basma-api' | 'basma-voice';
  timestamp: number;
  payload: Record<string, unknown>;
}

export async function sendN8nEvent(env: N8nEnv, event: N8nEvent): Promise<boolean> {
  if (!env.N8N_WEBHOOK_URL) {
    return false;
  }

  const response = await fetch(env.N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.N8N_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.N8N_WEBHOOK_TOKEN}` } : {}),
    },
    body: JSON.stringify(event),
  });

  return response.ok;
}
