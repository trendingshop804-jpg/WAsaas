// api/ai-chat.js — Vercel Serverless Function
// Proxies OpenRouter API calls, AI Reply Agents management & Knowledge Base entries

import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const route = req.query.route || req.query.resource || '';
  const action = req.query.action || req.body?.action || 'list';

  // ── 1. ROUTE: AI AGENTS MANAGEMENT ─────────────────────────────────────
  if (route === 'ai_agents' || route === 'ai-agents') {
    try {
      const access = await requireOrgAccess(req, res);
      if (!access) return;
      const organizationId = access.organizationId;
      const supabase = createSupabaseAdminClient();

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
              system_instructions: 'You are an AI sales and support executive for NextBright CRM.',
              status: 'active',
              working_hours: { enabled: false, start: '09:00', end: '18:00', timezone: 'UTC' },
              auto_reply_enabled: true,
              confidence_threshold: 0.75,
              max_replies_per_conversation: 10,
              handover_on_low_confidence: true,
              handover_keywords: ['human', 'agent', 'person', 'support'],
              lead_qualification_enabled: true,
              appointment_assistant_enabled: true,
              created_at: new Date().toISOString()
            }
          ]
        });
      }

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
          if (error) return res.status(500).json({ error: `Save failed: ${error.message}` });
          return res.status(200).json({ success: true, agent: saved });
        }
        return res.status(200).json({ success: true, agent: agentData });
      }

      if (action === 'toggle-handover') {
        const { conversationId, channel, aiActive, handoverNotes } = req.body;
        const targetTable = channel === 'instagram' ? 'social_conversations' : 'conversations';
        if (supabase && conversationId) {
          await supabase
            .from(targetTable)
            .update({ ai_active: Boolean(aiActive), handover_notes: handoverNotes || null })
            .eq('id', conversationId)
            .eq('organization_id', organizationId);
        }
        return res.status(200).json({ success: true, conversationId, aiActive: Boolean(aiActive) });
      }

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
        return res.status(200).json({ success: true, logs: [] });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 2. ROUTE: KNOWLEDGE BASE ENTRIES ─────────────────────────────────────
  if (route === 'knowledge_base' || route === 'knowledge-base') {
    try {
      const access = await requireOrgAccess(req, res);
      if (!access) return;
      const organizationId = access.organizationId;
      const supabase = createSupabaseAdminClient();

      if (req.method === 'GET' || action === 'list') {
        const category = req.query.category;
        if (supabase) {
          let query = supabase
            .from('ai_knowledge_base')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
          if (category && category !== 'all') query = query.eq('category', category);
          const { data: entries, error } = await query;
          if (!error && entries && entries.length > 0) {
            return res.status(200).json({ success: true, entries });
          }
        }
        return res.status(200).json({
          success: true,
          source: 'default',
          entries: [
            {
              id: 'kb-1',
              category: 'company',
              title: 'NextBright CRM Overview',
              content: 'NextBright CRM is a multi-tenant AI automation platform.',
              keywords: ['nextbright', 'crm', 'saas'],
              is_active: true,
              created_at: new Date().toISOString()
            }
          ]
        });
      }

      if (req.method === 'POST' && (action === 'save' || action === 'create')) {
        const entry = req.body.entry || req.body;
        entry.organization_id = organizationId;
        entry.updated_at = new Date().toISOString();
        if (supabase) {
          const { data: saved, error } = await supabase.from('ai_knowledge_base').upsert(entry).select('*').single();
          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ success: true, entry: saved });
        }
        return res.status(200).json({ success: true, entry });
      }

      if (req.method === 'DELETE' || action === 'delete') {
        const id = req.query.id || req.body?.id;
        if (supabase && id) {
          await supabase.from('ai_knowledge_base').delete().eq('id', id).eq('organization_id', organizationId);
        }
        return res.status(200).json({ success: true, id });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 3. DEFAULT: OPENROUTER / OPENAI PROXY ───────────────────────────────
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter / OpenAI API key not configured on server.' });
  }

  try {
    const { model = 'openai/gpt-4o-mini', messages = [], temperature = 0.7, max_tokens = 300 } = req.body || {};

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nextbright.io',
        'X-Title': 'NextBright CRM AI Agent',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OpenRouter API Error]:', response.status, errText);
      return res.status(response.status).json({ error: `OpenRouter error ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('[ai-chat API Error]:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
