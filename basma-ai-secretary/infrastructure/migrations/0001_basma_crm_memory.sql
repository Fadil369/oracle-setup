-- Basma CRM + Memory migration for D1
-- Apply with: wrangler d1 execute basma_production --file infrastructure/migrations/0001_basma_crm_memory.sql

CREATE TABLE IF NOT EXISTS visitors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    email TEXT,
    company TEXT,
    source TEXT,
    first_contact INTEGER NOT NULL,
    last_contact INTEGER NOT NULL,
    total_interactions INTEGER DEFAULT 1,
    lead_score INTEGER DEFAULT 0,
    segment_id TEXT,
    status TEXT DEFAULT 'visitor',
    metadata TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (segment_id) REFERENCES segments(id)
);

CREATE INDEX IF NOT EXISTS idx_visitors_user ON visitors(user_id);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(status);
CREATE INDEX IF NOT EXISTS idx_visitors_segment ON visitors(segment_id);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    type TEXT NOT NULL,
    scheduled_time INTEGER NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    timezone TEXT DEFAULT 'Asia/Riyadh',
    status TEXT DEFAULT 'scheduled',
    meeting_link TEXT,
    location TEXT,
    notes TEXT,
    reminder_sent INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_visitor ON appointments(visitor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_time ON appointments(scheduled_time);

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    stage TEXT DEFAULT 'new',
    source TEXT,
    source_channel TEXT,
    score INTEGER DEFAULT 0,
    sentiment TEXT DEFAULT 'neutral',
    status TEXT DEFAULT 'open',
    intent TEXT,
    notes TEXT,
    tags TEXT,
    next_action_at INTEGER,
    last_contact_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id),
    UNIQUE(visitor_id),
    UNIQUE(user_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);

CREATE TABLE IF NOT EXISTS basma_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    visitor_id TEXT,
    call_id TEXT,
    memory_key TEXT NOT NULL,
    memory_value TEXT NOT NULL,
    sentiment TEXT DEFAULT 'neutral',
    language TEXT DEFAULT 'mixed',
    confidence REAL DEFAULT 0.5,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id),
    FOREIGN KEY (call_id) REFERENCES call_logs(id)
);

CREATE INDEX IF NOT EXISTS idx_basma_memory_user ON basma_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_basma_memory_visitor ON basma_memory(visitor_id);
CREATE INDEX IF NOT EXISTS idx_basma_memory_key ON basma_memory(memory_key);
CREATE INDEX IF NOT EXISTS idx_basma_memory_sentiment ON basma_memory(sentiment);
