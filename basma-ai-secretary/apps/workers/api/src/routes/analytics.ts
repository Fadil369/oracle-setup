import { Hono } from 'hono';
import { Env } from '../index';

const analytics = new Hono<{ Bindings: Env }>();

// GET /api/analytics/overview - Overall performance metrics
analytics.get('/overview', async (c) => {
  const userId = (c.get('jwtPayload') as any).sub;

  // HYPERDRIVE: Simplified query (in production, use Hyperdrive binding to query external Postgres)
  // For now, we'll use D1 to provide mock fallback data
  const { results: callStats } = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_calls,
      AVG(duration_seconds) as avg_duration,
      SUM(CASE WHEN sentiment = 'urgent' THEN 1 ELSE 0 END) as urgent_calls
    FROM call_logs WHERE user_id = ?
  `).bind(userId).all();

  const { results: visitorStats } = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_visitors,
      SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) as total_leads,
      SUM(CASE WHEN status = 'customer' THEN 1 ELSE 0 END) as total_customers
    FROM visitors WHERE user_id = ?
  `).bind(userId).all();

  return c.json({
    calls: callStats[0],
    visitors: visitorStats[0],
    timestamp: Date.now()
  });
});

// GET /api/analytics/calls - Daily call volume analytics
analytics.get('/calls', async (c) => {
  const userId = (c.get('jwtPayload') as any).sub;

  // D1 aggregated by day (mock logic)
  const { results } = await c.env.DB.prepare(`
    SELECT 
      strftime('%Y-%m-%d', datetime(created_at/1000, 'unixepoch')) as day,
      COUNT(*) as count
    FROM call_logs 
    WHERE user_id = ?
    GROUP BY day
    ORDER BY day DESC
    LIMIT 7
  `).bind(userId).all();

  return c.json({ callVolume: results });
});

export { analytics as analyticsRoutes };
