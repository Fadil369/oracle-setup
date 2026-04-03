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
