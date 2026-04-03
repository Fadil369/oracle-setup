import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { Env } from '../index';

const auth = new Hono<{ Bindings: Env }>();

// POST /auth/login - Simple login to get JWT
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();

  // MOCK: Replace with real user lookup in D1
  if (email === 'admin@brainsait.org' && password === 'admin123') {
    const payload = {
      sub: 'user_123',
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    };
    
    const token = await sign(payload, c.env.JWT_SECRET);
    return c.json({ token, user: { id: 'user_123', email, name: 'BrainSAIT Admin' } });
  }

  return c.json({ error: 'Invalid credentials' }, 401);
});

// POST /auth/register - Register a new user
auth.post('/register', async (c) => {
  const body = await c.req.json();
  const userId = crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.DB.prepare(`
      INSERT INTO users (id, email, name, company_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'owner', ?, ?)
    `).bind(userId, body.email, body.name, body.company_name, now, now).run();

    return c.json({ id: userId, message: 'User registered' }, 201);
  } catch (err) {
    return c.json({ error: 'Registration failed' }, 400);
  }
});

export { auth as authRoutes };
