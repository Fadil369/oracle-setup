export interface User {
  id: string;
  email: string;
  name: string;
  company_name?: string;
  role: 'owner' | 'admin' | 'user';
  created_at: number;
  updated_at: number;
  last_login?: number;
}

export interface Visitor {
  id: string;
  user_id: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  source: 'phone_call' | 'web_widget' | 'whatsapp' | 'sms' | 'manual';
  first_contact: number;
  last_contact: number;
  total_interactions: number;
  lead_score: number;
  segment_id?: string;
  status: 'visitor' | 'lead' | 'customer';
  metadata: string; // JSON string
}

export interface Appointment {
  id: string;
  user_id: string;
  visitor_id: string;
  type: 'demo' | 'consultation' | 'technical_support' | 'partnership_discussion';
  scheduled_time: number;
  duration_minutes: number;
  timezone: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  meeting_link?: string;
  location?: string;
  notes?: string;
  reminder_sent: boolean;
  created_at: number;
}

export interface CallLog {
  id: string;
  user_id: string;
  visitor_id?: string;
  call_type: 'inbound' | 'outbound';
  duration_seconds: number;
  language?: string; // 'ar', 'en', 'mixed'
  summary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'urgent';
  recording_url?: string;
  transcript_url?: string;
  action_items?: string; // JSON string
  created_at: number;
}

export interface Communication {
  id: string;
  user_id: string;
  visitor_id: string;
  channel: 'sms' | 'whatsapp' | 'email';
  direction: 'inbound' | 'outbound';
  message_content: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  external_id?: string;
  created_at: number;
}

export interface Lead {
  id: string;
  user_id: string;
  visitor_id: string;
  stage: 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
  source?: 'voice' | 'web_widget' | 'whatsapp' | 'sms' | 'telegram' | 'crm' | 'manual';
  source_channel?: string;
  score: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  status: 'open' | 'nurturing' | 'converted' | 'archived';
  intent?: string;
  notes?: string;
  tags?: string; // JSON string array
  next_action_at?: number;
  last_contact_at?: number;
  created_at: number;
  updated_at: number;
}

export interface BasmaMemory {
  id: string;
  user_id: string;
  visitor_id?: string;
  call_id?: string;
  memory_key: string;
  memory_value: string; // JSON string payload
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  language: 'ar' | 'en' | 'mixed';
  confidence: number;
  created_at: number;
  updated_at: number;
}
