import { DurableObject } from 'cloudflare:workers';
import { AIService } from '../../api/src/services/ai_service';

export interface Env {
  DB: D1Database;
  R2_STORAGE: R2Bucket;
  ANTHROPIC_API_KEY: string;
}

export class VoiceSession extends DurableObject {
  private connections: Set<WebSocket> = new Set();
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private visitorData: any = {};
  private callStartTime: number = 0;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
  }

  // Handle WebSocket connections
  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(ws: WebSocket) {
    this.connections.add(ws);
    this.callStartTime = Date.now();
    ws.accept();

    ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === 'user_message') {
          const userMessage = data.text;
          this.conversationHistory.push({ role: 'user', content: userMessage });

          // Start AI response
          const aiService = new AIService(this.env.ANTHROPIC_API_KEY);
          const stream = await aiService.processConversation(
            this.conversationHistory,
            this.visitorData
          );

          let assistantResponse = '';
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = new TextDecoder().decode(value);
            assistantResponse += text;
            ws.send(JSON.stringify({ type: 'ai_response_chunk', text }));
          }

          this.conversationHistory.push({ role: 'assistant', content: assistantResponse });

          // Proactively extract and update visitor data
          const extracted = await aiService.extractDataFromTranscript(
            this.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')
          );
          this.visitorData = { ...this.visitorData, ...extracted };
        }

        if (data.type === 'end_call') {
          await this.saveCallLog();
          ws.close();
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.addEventListener('close', async () => {
      this.connections.delete(ws);
      await this.saveCallLog();
    });
  }

  async saveCallLog() {
    if (this.conversationHistory.length === 0) return;

    const duration = Math.floor((Date.now() - this.callStartTime) / 1000);
    const transcript = this.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n\n');
    const callId = crypto.randomUUID();

    // Store transcript in R2
    const transcriptKey = `transcripts/${callId}.txt`;
    await this.env.R2_STORAGE.put(transcriptKey, transcript);

    // Store log in D1
    await this.env.DB.prepare(`
      INSERT INTO call_logs (
        id, user_id, visitor_id, call_type, duration_seconds,
        summary, transcript_url, created_at
      ) VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?)
    `).bind(
      callId,
      this.visitorData.userId || 'system',
      this.visitorData.visitorId || null,
      duration,
      this.conversationHistory[0].content.substring(0, 200), // Quick summary from first message
      transcriptKey,
      Date.now()
    ).run();
  }
}
