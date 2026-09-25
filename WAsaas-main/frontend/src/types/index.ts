export type LeadStatus = 'New' | 'Contacted' | 'Interested' | 'Follow-up' | 'Won' | 'Lost';

export interface Lead {
  id: string;
  user_id?: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  source?: string;
  interested_in?: string;
  notes?: string;
  status: LeadStatus;
  follow_up_date?: string; // YYYY-MM-DD
  last_contacted_at?: string; // ISO string
  next_follow_up_date?: string; // YYYY-MM-DD
  created_at?: string;
  updated_at?: string;
}

export interface FollowUpMessage {
  id: string;
  user_id: string;
  lead_id?: string;
  message: string;
  stage?: string;
  channel?: 'whatsapp' | 'email' | 'copied' | string;
  created_at: string;
}

export interface UserSettings {
  id?: string;
  user_id: string;
  display_name: string;
  default_interval: number; // in days
  default_tone: MessageTone;
  created_at?: string;
  updated_at?: string;
}

export type FollowUpStage = 'First Follow-up' | 'Second Follow-up' | 'Final Follow-up';

export type MessageTone = 'Professional' | 'Friendly' | 'Short Sales' | 'Polite';

export type FollowUpFilterCategory = 'all' | 'today' | 'overdue' | 'upcoming';

export interface LeadFilterOptions {
  search: string;
  status: string; // 'all' or LeadStatus
  category: FollowUpFilterCategory;
  sortBy: 'newest' | 'oldest' | 'next_follow_up';
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}
