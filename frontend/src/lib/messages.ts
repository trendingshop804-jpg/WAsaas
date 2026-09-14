import { supabase } from './supabase';
import { FollowUpMessage, FollowUpStage, MessageTone, Lead } from '../types';

/**
 * Deterministic local message template generator matrix.
 * Provides instant, failure-free message generation for any lead info.
 */
export const generateFollowUpMessage = (
  lead: Partial<Lead>,
  stage: FollowUpStage,
  tone: MessageTone
): string => {
  const name = lead.name || 'there';
  const company = lead.company ? ` at ${lead.company}` : '';
  const interest = lead.interested_in ? ` regarding ${lead.interested_in}` : ' regarding our previous discussion';

  const templates: Record<FollowUpStage, Record<MessageTone, string>> = {
    'First Follow-up': {
      Professional: `Dear ${name}, following up${interest}${company}. Please let me know if you have any questions or if you would like to schedule a brief call to discuss the next steps.`,
      Friendly: `Hi ${name}, just following up regarding our previous conversation${interest}! Please let me know if you have any questions or would like to continue.`,
      'Short Sales': `Hi ${name}, quick check-in on ${interest.replace(' regarding ', '')}! Are you ready to get started this week?`,
      Polite: `Hello ${name}, I hope this message finds you well. I am reaching out to follow up on our earlier conversation${interest}. Please take your time to review and feel free to reach out when convenient.`
    },
    'Second Follow-up': {
      Professional: `Dear ${name}, I wanted to check if you had a chance to review the details we provided${interest}. Please let me know if you would like any additional information.`,
      Friendly: `Hi ${name}, I wanted to check if you had a chance to review the details${interest}. Please let me know if you'd like any additional information!`,
      'Short Sales': `Hi ${name}, checking in on our discussion${interest}. We have availability to move forward this week—let me know if you'd like to reserve your spot!`,
      Polite: `Hello ${name}, I hope you are having a productive week. Following up on our previous note${interest} to see if you have any questions I can clarify.`
    },
    'Final Follow-up': {
      Professional: `Dear ${name}, I am following up one last time regarding our previous conversation${interest}. Feel free to reach out whenever you are ready to proceed.`,
      Friendly: `Hi ${name}, just checking in one last time regarding our previous conversation${interest}. Feel free to reach out whenever you're ready!`,
      'Short Sales': `Hi ${name}, last check-in from my side regarding ${interest.replace(' regarding ', '')}. If you're still interested, reply to this message and we can take care of everything right away!`,
      Polite: `Hello ${name}, I understand you may be busy. This will be my final check-in for now regarding ${interest.replace(' regarding ', '')}. Whenever the time is right, I will be here to help.`
    }
  };

  return templates[stage]?.[tone] || templates['First Follow-up']['Friendly'];
};

/**
 * Encodes text safely for WhatsApp URL.
 */
export const buildWhatsAppUrl = (phone: string, text: string): string => {
  // Clean phone number (strip spaces, dashes, plus sign if appropriate)
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
};

/**
 * Encodes text safely for Mailto URL.
 */
export const buildMailtoUrl = (email: string, subject: string, text: string): string => {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(text);
  return `mailto:${email}?subject=${encodedSubject}&body=${encodedBody}`;
};

/**
 * Saves a follow-up message into `follow_up_messages` table in Supabase.
 */
export const saveFollowUpMessage = async (
  message: Omit<FollowUpMessage, 'id' | 'user_id' | 'created_at'>
): Promise<FollowUpMessage | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const payload = {
      user_id: user.id,
      lead_id: message.lead_id || null,
      message: message.message,
      stage: message.stage || 'General',
      channel: message.channel || 'copied',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('follow_up_messages')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.warn('[Message History] Could not persist to database:', error.message);
      // Fallback in-memory object for responsive UX
      return {
        id: 'msg-' + Date.now(),
        user_id: user.id,
        lead_id: message.lead_id,
        message: message.message,
        stage: message.stage,
        channel: message.channel,
        created_at: new Date().toISOString(),
      };
    }

    return data;
  } catch (err) {
    console.error('Failed to save follow-up message:', err);
    return null;
  }
};

/**
 * Fetches follow-up message history for a user or specific lead.
 */
export const fetchFollowUpMessages = async (leadId?: string): Promise<FollowUpMessage[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('follow_up_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (leadId) {
      query = query.eq('lead_id', leadId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[Message History] Database query warning:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching message history:', err);
    return [];
  }
};
