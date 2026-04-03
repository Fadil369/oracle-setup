import { VoiceSession } from './voice_session';

export { VoiceSession };

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    // Standard worker entry point for voice
    const url = new URL(request.url);
    const id = env.VOICE_SESSION.idFromName(url.searchParams.get('id') || 'global');
    const obj = env.VOICE_SESSION.get(id);

    return obj.fetch(request);
  }
};
