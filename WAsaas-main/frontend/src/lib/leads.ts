import { supabase } from './supabase';
import { Lead, LeadStatus } from '../types';

export const normalizeStatus = (rawStatus?: string): LeadStatus => {
  if (!rawStatus) return 'New';
  const lower = rawStatus.trim().toLowerCase();
  if (lower === 'new') return 'New';
  if (lower === 'contacted') return 'Contacted';
  if (lower === 'interested') return 'Interested';
  if (lower === 'follow-up' || lower === 'followup' || lower === 'follow_up') return 'Follow-up';
  if (lower === 'won') return 'Won';
  if (lower === 'lost') return 'Lost';
  return 'New';
};

export const parseLeadRow = (row: any): Lead => {
  const followUpDateStr = row.next_follow_up_date || row.follow_up_date || (row.next_followup_at ? row.next_followup_at.split('T')[0] : '');
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name || row.contact_name || 'Unnamed Lead',
    phone: row.phone || '',
    email: row.email || '',
    company: row.company || row.company_name || '',
    source: row.source || row.industry || 'Direct',
    interested_in: row.interested_in || row.custom_fields?.interested_in || '',
    notes: row.notes || row.score_reason || '',
    status: normalizeStatus(row.status),
    follow_up_date: followUpDateStr,
    last_contacted_at: row.last_contacted_at || undefined,
    next_follow_up_date: followUpDateStr,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
};

export const fetchLeads = async (): Promise<Lead[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching leads:', error);
    throw new Error(error.message || 'Failed to fetch leads from database.');
  }

  return (data || []).map(parseLeadRow);
};

export const createLead = async (lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Promise<Lead> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required to create a lead.');

  const payload: Record<string, any> = {
    user_id: user.id,
    name: lead.name.trim(),
    contact_name: lead.name.trim(), // Dual schema support
    phone: lead.phone?.trim() || null,
    email: lead.email?.trim() || null,
    company: lead.company?.trim() || null,
    company_name: lead.company?.trim() || 'General', // Dual schema support for non-null column if existing
    source: lead.source?.trim() || 'Direct',
    interested_in: lead.interested_in?.trim() || null,
    notes: lead.notes?.trim() || null,
    status: lead.status || 'New',
    follow_up_date: lead.follow_up_date || null,
    next_follow_up_date: lead.next_follow_up_date || lead.follow_up_date || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('leads')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Error creating lead:', error);
    throw new Error(error.message || 'Failed to save lead to database.');
  }

  return parseLeadRow(data);
};

export const updateLead = async (id: string, lead: Partial<Lead>): Promise<Lead> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required to update a lead.');

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (lead.name !== undefined) {
    payload.name = lead.name.trim();
    payload.contact_name = lead.name.trim();
  }
  if (lead.phone !== undefined) payload.phone = lead.phone.trim() || null;
  if (lead.email !== undefined) payload.email = lead.email.trim() || null;
  if (lead.company !== undefined) {
    payload.company = lead.company.trim() || null;
    payload.company_name = lead.company.trim() || 'General';
  }
  if (lead.source !== undefined) payload.source = lead.source.trim() || null;
  if (lead.interested_in !== undefined) payload.interested_in = lead.interested_in.trim() || null;
  if (lead.notes !== undefined) payload.notes = lead.notes.trim() || null;
  if (lead.status !== undefined) payload.status = lead.status;
  if (lead.follow_up_date !== undefined) payload.follow_up_date = lead.follow_up_date || null;
  if (lead.next_follow_up_date !== undefined) {
    payload.next_follow_up_date = lead.next_follow_up_date || null;
    payload.follow_up_date = lead.next_follow_up_date || null;
  }
  if (lead.last_contacted_at !== undefined) payload.last_contacted_at = lead.last_contacted_at;

  const { data, error } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating lead:', error);
    throw new Error(error.message || 'Failed to update lead in database.');
  }

  return parseLeadRow(data);
};

export const deleteLead = async (id: string): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required to delete a lead.');

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting lead:', error);
    throw new Error(error.message || 'Failed to delete lead from database.');
  }
};

export const markLeadAsContacted = async (
  id: string,
  nextFollowUpDate?: string,
  newStatus: LeadStatus = 'Contacted'
): Promise<Lead> => {
  const now = new Date().toISOString();
  return updateLead(id, {
    last_contacted_at: now,
    next_follow_up_date: nextFollowUpDate || undefined,
    follow_up_date: nextFollowUpDate || undefined,
    status: newStatus,
  });
};
