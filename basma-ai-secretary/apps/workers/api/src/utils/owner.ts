interface OwnerOptions {
  email?: string;
  name?: string;
  companyName?: string;
}

interface OwnerRecord {
  id: string;
  email: string;
  name: string;
}

export async function ensurePrimaryOwner(
  db: D1Database,
  options: OwnerOptions = {},
): Promise<OwnerRecord> {
  const existing = await db.prepare(
    `SELECT id, email, name
     FROM users
     WHERE role IN ('owner', 'admin')
     ORDER BY created_at ASC
     LIMIT 1`,
  ).first<OwnerRecord>();

  if (existing?.id) {
    return existing;
  }

  const owner: OwnerRecord = {
    id: 'brainsait-basma-owner',
    email: options.email || 'basma@brainsait.org',
    name: options.name || 'BrainSAIT Basma',
  };
  const now = Date.now();

  await db.prepare(
    `INSERT OR IGNORE INTO users (
      id, email, name, company_name, role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'owner', ?, ?)`,
  ).bind(
    owner.id,
    owner.email,
    owner.name,
    options.companyName || 'BrainSAIT',
    now,
    now,
  ).run();

  const created = await db.prepare(
    `SELECT id, email, name
     FROM users
     WHERE id = ?
     LIMIT 1`,
  ).bind(owner.id).first<OwnerRecord>();

  return created || owner;
}
