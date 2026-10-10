/* =============================================================================
   api/ai-agents.js — NextBright CRM Vercel Serverless Function
   Handles AI Reply Agent CRUD, Handover Toggles, Working Hours & Rules
   ============================================================================= */

import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const access = await requireOrgAccess(req, res);
    if (!access) return;
    const organizationId = access.organizationId;
    const supabase = createSupabaseAdminClient();

    const action = req.query.action || req.body?.action || 'list';

    // ── 1. LIST AGENTS ───────────────────────────────────────────────────────
    if (req.method === 'GET' || action === 'list') {
      if (supabase) {
        const { data: agents, error } = await supabase
          .from('ai_agents')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (!error && agents && agents.length > 0) {
          return res.status(200).json({ success: true, agents });
        }
      }

      // Default initial agent if none in DB
      return res.status(200).json({
        success: true,
        source: 'default',
        agents: [
          {
            id: 'agent-default-1',
            name: 'NextBright Assistant',
            channels: ['instagram', 'whatsapp'],
            business_name: 'NextBright CRM',
            language: 'en',
            tone: 'Professional',
            system_instructions: 'You are an AI sales and support executive for NextBright CRM. Assist customers with pricing, product features, and booking demo calls.',
            status: 'active',
            working_hours: { enabled: false, start: '09:00', end: '18:00', timezone: 'UTC' },
            auto_reply_enabled: true,
            confidence_threshold: 0.75,
            max_replies_per_conversation: 10,
            handover_on_low_confidence: true,
            handover_keywords: ['human', 'agent', 'person', 'representative', 'support', 'help'],
            lead_qualification_enabled: true,
            appointment_assistant_enabled: true,
            created_at: new Date().toISOString()
          }
        ]
      });
    }

    // ── 2. SAVE / UPDATE AGENT ───────────────────────────────────────────────
    if (req.method === 'POST' && (action === 'save' || action === 'create')) {
      const agentData = req.body.agent || req.body;
      agentData.organization_id = organizationId;
      agentData.updated_at = new Date().toISOString();

      if (supabase) {
        const { data: saved, error } = await supabase
          .from('ai_agents')
          .upsert(agentData)
          .select('*')
          .single();

        if (error) {
          return res.status(500).json({ error: `Failed to save agent: ${error.message}` });
        }
        return res.status(200).json({ success: true, agent: saved });
      }

      return res.status(200).json({ success: true, agent: agentData });
    }

    // ── 3. HUMAN HANDOVER TOGGLE ─────────────────────────────────────────────
    if (action === 'toggle-handover') {
      const { conversationId, channel, aiActive, handoverNotes } = req.body;
      const targetTable = channel === 'instagram' ? 'social_conversations' : 'conversations';

      if (supabase && conversationId) {
        await supabase
          .from(targetTable)
          .update({
            ai_active: Boolean(aiActive),
            handover_notes: handoverNotes || null
          })
          .eq('id', conversationId)
          .eq('organization_id', organizationId);
      }

      return res.status(200).json({
        success: true,
        conversationId,
        aiActive: Boolean(aiActive),
        handoverNotes
      });
    }

    // ── 4. AGENT LOGS / ANALYTICS ─────────────────────────────────────────────
    if (action === 'logs') {
      if (supabase) {
        const { data: logs } = await supabase
          .from('ai_reply_logs')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(50);
        return res.status(200).json({ success: true, logs: logs || [] });
      }

      return res.status(200).json({
        success: true,
        logs: [
          {
            id: 'log-1',
            channel: 'whatsapp',
            conversation_id: 'conv-101',
            incoming_message: 'Hi, what are your CRM pricing plans?',
            final_sent_reply: 'Our plans start at $49/mo for Starter and $149/mo for Enterprise. Would you like a free demo?',
            confidence_score: 0.94,
            handover_triggered: false,
            status: 'sent',
            created_at: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: 'log-2',
            channel: 'instagram',
            conversation_id: 'conv-ig-1',
            incoming_message: 'I need to speak to a real person regarding my refund.',
            final_sent_reply: null,
            confidence_score: 0.40,
            handover_triggered: true,
            handover_reason: 'Keyword matched: person / refund request',
            status: 'handover',
            created_at: new Date(Date.now() - 7200000).toISOString()
          }
        ]
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[ai-agents API error]:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
