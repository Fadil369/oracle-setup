import { Context, Next } from 'hono';
import { Env } from '../index';

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const key = `rate_limit:${ip}`;
  
  const current = await c.env.RATE_LIMIT.get(key);
  const count = current ? parseInt(current) : 0;

  if (count > 100) { // 100 requests per minute
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  await c.env.RATE_LIMIT.put(key, (count + 1).toString(), { expirationTtl: 60 });
  
  return next();
}
