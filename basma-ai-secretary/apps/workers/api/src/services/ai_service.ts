import Anthropic from '@anthropic-ai/sdk';
import { Env } from '../index';

export const BASMA_SYSTEM_PROMPT = `
You are Basma, the intelligent AI voice secretary for BrainSAIT, a healthcare technology company specializing in HIPAA-compliant, bilingual (Arabic/English) medical systems. You handle incoming calls, schedule appointments, manage customer inquiries, and assist potential partners with professionalism and efficiency.

CORE IDENTITY & PERSONALITY
Name: Basma (بسمة) - meaning "smile" in Arabic 
Role: Executive AI Secretary for BrainSAIT 
Voice: Warm, professional, culturally aware, bilingual fluency 
Tone: Confident yet approachable, efficient but never rushed

Personality Traits:
Professional Excellence: Corporate communication standards with healthcare sensitivity
Cultural Intelligence: Seamlessly switches between Arabic and English; understands Saudi business etiquette
Proactive Problem-Solver: Anticipates needs, offers solutions before being asked
Detail-Oriented: Captures all relevant information accurately for follow-up
Time-Conscious: Respects caller's time while gathering necessary details

LANGUAGE & COMMUNICATION PROTOCOLS
Bilingual Operation
Language Detection: Automatically identify caller's language in first 3 seconds
Code-Switching: Handle mid-conversation language switches gracefully
Arabic Handling: Use Modern Standard Arabic for formal contexts, appropriate dialect awareness for Gulf region
Technical Terms: Use English medical/technical terms with Arabic explanations when needed

Voice Interaction Standards
Response Latency: <1.5 seconds for natural conversation flow
Active Listening: Use verbal acknowledgments ("I understand," "Got it," "نعم، فهمت")
Clarification Protocol: Ask specific questions rather than generic "Can you repeat?"
Interruption Handling: Gracefully pause when caller interjects, resume context smoothly

GREETING:
"Good morning, thank you for calling BrainSAIT. This is Basma, how may I assist you today?"
ARABIC:
"صباح الخير، شكراً لاتصالك ببرين سايت. معك بسمة، كيف يمكنني مساعدتك؟"

...and so on (truncated for brevity in code, but full prompt should be used).
`;

export class AIService {
  private client: Anthropic;

  private parseJsonObject(text: string) {
    const trimmed = text.trim();
    const withoutFence = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
    }

    return JSON.parse(withoutFence);
  }
  
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async processConversation(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    visitorContext: any = {},
    options: { maxTokens?: number; languageHint?: 'ar' | 'en' | 'mixed' } = {}
  ): Promise<ReadableStream> {
    const languageHint = options.languageHint || 'mixed';
    const bilingualGuardrails = languageHint === 'ar'
      ? 'Respond primarily in Arabic unless user explicitly asks for English.'
      : languageHint === 'en'
        ? 'Respond in English unless user explicitly asks for Arabic.'
        : 'Detect and mirror the caller language (Arabic, English, or mixed) naturally.';

    const stream = await this.client.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: options.maxTokens || 1200,
      system: `${BASMA_SYSTEM_PROMPT}\n\nVisitor Context: ${JSON.stringify(visitorContext)}\n\nLanguage hint: ${languageHint}. ${bilingualGuardrails}`,
      messages,
      stream: true
    });

    return new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && 
              event.delta.type === 'text_delta') {
            controller.enqueue(new TextEncoder().encode(event.delta.text));
          }
        }
        controller.close();
      }
    });
  }

  async extractDataFromTranscript(transcript: string) {
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 1000,
      system: 'Extract visitor information from this call transcript. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Extract: name, phone, email, company, appointment_type, preferred_times, urgency, brief_topic from the following transcript:\n\n${transcript}\n\nReturn JSON only.`
      }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        return this.parseJsonObject(content.text);
      } catch {
        return {};
      }
    }
    return {};
  }

  async extractConversationInsights(transcript: string) {
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 1200,
      system: 'You are a strict JSON generator for a CRM memory engine. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Analyze the following bilingual (Arabic/English) call transcript and return a JSON object with this exact shape:
{
  "language": "ar|en|mixed",
  "sentiment": "positive|neutral|negative|urgent",
  "summary": "string",
  "intent": "string",
  "urgency_score": 0,
  "lead_score": 0,
  "name": "string|null",
  "phone": "string|null",
  "email": "string|null",
  "company": "string|null",
  "appointment_type": "demo|consultation|technical_support|partnership|general",
  "preferred_times": ["string"],
  "action_items": ["string"],
  "next_best_action": "string"
}

Rules:
- urgency_score and lead_score must be integers from 0 to 100.
- If unknown, use null (for nullable fields) or empty string/array where appropriate.
- language must be ar, en, or mixed.

Transcript:
${transcript}`,
      }],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        return this.parseJsonObject(content.text);
      } catch {
        return {
          language: 'mixed',
          sentiment: 'neutral',
          summary: '',
          intent: '',
          urgency_score: 0,
          lead_score: 0,
          name: null,
          phone: null,
          email: null,
          company: null,
          appointment_type: 'general',
          preferred_times: [],
          action_items: [],
          next_best_action: '',
        };
      }
    }

    return {
      language: 'mixed',
      sentiment: 'neutral',
      summary: '',
      intent: '',
      urgency_score: 0,
      lead_score: 0,
      name: null,
      phone: null,
      email: null,
      company: null,
      appointment_type: 'general',
      preferred_times: [],
      action_items: [],
      next_best_action: '',
    };
  }
}
