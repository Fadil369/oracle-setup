-- D1 SQLite Schema

-- Users & Authentication
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    company_name TEXT,
    role TEXT NOT NULL DEFAULT 'user', -- 'owner', 'admin', 'user'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login INTEGER
);

CREATE INDEX idx_users_email ON users(email);

-- Visitors (People who interact with Basma)
CREATE TABLE visitors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL, -- Owner of this visitor
    name TEXT,
    phone TEXT,
    email TEXT,
    company TEXT,
    source TEXT, -- 'phone_call', 'web_widget', 'whatsapp', 'sms'
    first_contact INTEGER NOT NULL,
    last_contact INTEGER NOT NULL,
    total_interactions INTEGER DEFAULT 1,
    lead_score INTEGER DEFAULT 0,
    segment_id TEXT, -- FK to segments
    status TEXT DEFAULT 'visitor', -- 'visitor', 'lead', 'customer'
    metadata TEXT, -- JSON: {industry, company_size, etc}
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (segment_id) REFERENCES segments(id)
);

CREATE INDEX idx_visitors_user ON visitors(user_id);
CREATE INDEX idx_visitors_status ON visitors(status);
CREATE INDEX idx_visitors_segment ON visitors(segment_id);

-- Leads (Explicit CRM lead lifecycle tracking)
CREATE TABLE leads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    stage TEXT DEFAULT 'new', -- 'new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'
    source TEXT, -- 'voice', 'web_widget', 'whatsapp', 'sms', 'telegram', 'crm'
    source_channel TEXT, -- kept for compatibility with legacy analytics payloads
    score INTEGER DEFAULT 0,
    sentiment TEXT DEFAULT 'neutral', -- 'positive', 'neutral', 'negative', 'urgent'
    status TEXT DEFAULT 'open', -- 'open', 'nurturing', 'converted', 'archived'
    intent TEXT,
    notes TEXT,
    tags TEXT, -- JSON array
    next_action_at INTEGER,
    last_contact_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id),
    UNIQUE(visitor_id),
    UNIQUE(user_id, visitor_id)
);

CREATE INDEX idx_leads_user ON leads(user_id);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_score ON leads(score);

-- Visitor Segments
CREATE TABLE segments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    criteria TEXT NOT NULL, -- JSON: filter conditions
    color TEXT DEFAULT '#0ea5e9',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Appointments
CREATE TABLE appointments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL, -- BrainSAIT team member
    visitor_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'demo', 'consultation', 'support', 'partnership'
    scheduled_time INTEGER NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    timezone TEXT DEFAULT 'Asia/Riyadh',
    status TEXT DEFAULT 'scheduled', -- 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
    meeting_link TEXT,
    location TEXT,
    notes TEXT,
    reminder_sent INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id)
);

CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_appointments_visitor ON appointments(visitor_id);
CREATE INDEX idx_appointments_time ON appointments(scheduled_time);

-- Call Logs
CREATE TABLE call_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    visitor_id TEXT,
    call_type TEXT NOT NULL, -- 'inbound', 'outbound'
    duration_seconds INTEGER,
    language TEXT, -- 'ar', 'en', 'mixed'
    summary TEXT,
    sentiment TEXT, -- 'positive', 'neutral', 'negative', 'urgent'
    recording_url TEXT, -- R2 URL
    transcript_url TEXT, -- R2 URL
    action_items TEXT, -- JSON array
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id)
);

CREATE INDEX idx_call_logs_user ON call_logs(user_id);
CREATE INDEX idx_call_logs_visitor ON call_logs(visitor_id);

-- Basma Memory (Cross-call context and sentiment memory)
CREATE TABLE basma_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    visitor_id TEXT,
    call_id TEXT,
    memory_key TEXT NOT NULL,
    memory_value TEXT NOT NULL, -- JSON payload
    sentiment TEXT DEFAULT 'neutral',
    language TEXT DEFAULT 'mixed',
    confidence REAL DEFAULT 0.5,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id),
    FOREIGN KEY (call_id) REFERENCES call_logs(id)
);

CREATE INDEX idx_basma_memory_user ON basma_memory(user_id);
CREATE INDEX idx_basma_memory_visitor ON basma_memory(visitor_id);
CREATE INDEX idx_basma_memory_key ON basma_memory(memory_key);
CREATE INDEX idx_basma_memory_sentiment ON basma_memory(sentiment);

-- Communications (SMS, WhatsApp, Email)
CREATE TABLE communications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    channel TEXT NOT NULL, -- 'sms', 'whatsapp', 'email'
    direction TEXT NOT NULL, -- 'inbound', 'outbound'
    message_content TEXT NOT NULL,
    status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'read', 'failed'
    external_id TEXT, -- Twilio SID, WhatsApp message ID
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id)
);

CREATE INDEX idx_communications_visitor ON communications(visitor_id);
CREATE INDEX idx_communications_channel ON communications(channel);

-- Attributes (Custom fields for visitors)
CREATE TABLE attributes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT DEFAULT 'text', -- 'text', 'number', 'boolean', 'date', 'select'
    options TEXT, -- JSON array for select type
    required INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, key)
);

-- Entities (Custom objects like "Product", "Service", etc)
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    fields TEXT NOT NULL, -- JSON: array of {name, type, required}
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Widget Integrations
CREATE TABLE integrations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    widget_type TEXT DEFAULT 'floating', -- 'floating', 'iframe', 'inline'
    settings TEXT, -- JSON: colors, position, greetings
    verified INTEGER DEFAULT 0,
    api_key TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_integrations_domain ON integrations(domain);
CREATE INDEX idx_integrations_api_key ON integrations(api_key);
