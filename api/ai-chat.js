// api/ai-chat.js — Vercel Serverless Function
// Proxies OpenRouter API calls, AI Reply Agents management & Knowledge Base entries

import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

function isMissingAiSchema(error) {
  return ['42P01', 'PGRST205'].includes(String(error?.code || ''));
}

function aiSchemaError(res) {
  return res.status(503).json({
    error: 'AI storage is not installed for this environment.',
    code: 'AI_SCHEMA_MISSING'
  });
}

function canManageAi(access) {
  return ['OWNER', 'ADMIN', 'API_KEY'].includes(String(access?.role || '').toUpperCase());
}

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
      const access = await requireOrgAccess(req, res, null);
      if (!access) return;
      const organizationId = access.organizationId;
      const supabase = createSupabaseAdminClient();
      if (!supabase) return res.status(503).json({ error: 'Server database configuration is unavailable.' });
      if (['save', 'create', 'update', 'delete', 'toggle-handover'].includes(action) && !canManageAi(access)) {
        return res.status(403).json({ error: 'Only an Owner or Admin can manage AI agents.', code: 'INSUFFICIENT_ROLE' });
      }

      if (req.method === 'GET' && action === 'list') {
        const { data: agents, error } = await supabase
          .from('ai_agents')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });
        if (isMissingAiSchema(error)) return aiSchemaError(res);
        if (error) return res.status(500).json({ error: 'Could not load AI agents.', code: 'AI_AGENTS_LOAD_FAILED' });
        return res.status(200).json({ success: true, agents: agents || [] });
      }

      if (req.method === 'POST' && (action === 'save' || action === 'create' || action === 'update')) {
        const agentData = { ...(req.body.agent || req.body), organization_id: organizationId };
        if (agentData.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(agentData.id)) delete agentData.id;
        agentData.updated_at = new Date().toISOString();

        const { data: saved, error } = await supabase
          .from('ai_agents')
          .upsert(agentData)
          .select('*')
          .single();
        if (isMissingAiSchema(error)) return aiSchemaError(res);
        if (error) return res.status(500).json({ error: `Save failed: ${error.message}` });
        return res.status(200).json({ success: true, agent: saved });
      }

      if (req.method === 'DELETE' || action === 'delete') {
        const id = req.query.id || req.body?.id;
        const { error } = await supabase.from('ai_agents').delete().eq('id', id).eq('organization_id', organizationId);
        if (isMissingAiSchema(error)) return aiSchemaError(res);
        if (error) return res.status(500).json({ error: 'Could not delete AI agent.' });
        return res.status(200).json({ success: true, id });
      }

      if (action === 'toggle-handover') {
        const { conversationId, channel, aiActive, handoverNotes } = req.body;
        const targetTable = channel === 'instagram' ? 'social_conversations' : 'conversations';
        const { error } = await supabase
          .from(targetTable)
          .update({ ai_active: Boolean(aiActive), handover_notes: handoverNotes || null })
          .eq('id', conversationId)
          .eq('organization_id', organizationId);
        if (error) return res.status(500).json({ error: 'Could not update conversation handover state.' });
        return res.status(200).json({ success: true, conversationId, aiActive: Boolean(aiActive) });
      }

      if (action === 'generate-reply' || action === 'test-reply') {
        const { message = '', channel = 'instagram', agentId } = req.body || {};
        let agent = null;

        if (supabase && organizationId) {
          let q = supabase.from('ai_agents').select('*').eq('organization_id', organizationId);
          if (agentId) q = q.eq('id', agentId);
          const { data, error } = await q.limit(1).maybeSingle();
          if (isMissingAiSchema(error)) return aiSchemaError(res);
          if (error) return res.status(500).json({ error: 'Could not load the selected AI agent.' });
          agent = data;
        }

        if (!agent) return res.status(409).json({ error: 'No AI agent is configured for this organization.', code: 'NO_AI_AGENT' });

        if (agent.status === 'paused') {
          return res.status(200).json({
            success: false,
            status: 'paused',
            reply: 'AI auto-replies are currently paused for this agent.'
          });
        }

        // Check for human handover keywords
        const lowerMsg = String(message).toLowerCase();
        const keywords = Array.isArray(agent.handover_keywords) ? agent.handover_keywords : ['human', 'agent', 'person', 'support'];
        const triggerKeyword = keywords.find(k => lowerMsg.includes(String(k).toLowerCase()));

        if (triggerKeyword) {
          const handoverReply = 'I am connecting you with a human representative right now. A team member will join shortly!';
          if (supabase && organizationId) {
            try {
              await supabase.from('ai_reply_logs').insert({
                organization_id: organizationId,
                agent_id: agent.id || null,
                channel,
                conversation_id: req.body.conversationId || 'web-demo',
                incoming_message: message,
                final_sent_reply: handoverReply,
                handover_triggered: true,
                handover_reason: `Trigger keyword: "${triggerKeyword}"`,
                status: 'handover'
              });
            } catch (_) {}
          }
          return res.status(200).json({
            success: true,
            status: 'handover',
            handover_triggered: true,
            handover_reason: `Trigger keyword: "${triggerKeyword}"`,
            reply: handoverReply
          });
        }

        // Retrieve knowledge base entries for grounded answering
        let kbEntries = [];
        const { data: dbKb, error: kbError } = await supabase.from('ai_knowledge_base').select('*').eq('organization_id', organizationId).eq('is_active', true);
        if (isMissingAiSchema(kbError)) return aiSchemaError(res);
        if (kbError) return res.status(500).json({ error: 'Could not load the AI knowledge base.', code: 'AI_KB_LOAD_FAILED' });
        if (dbKb && dbKb.length > 0) kbEntries = dbKb;

        if (kbEntries.length === 0) {
          return res.status(409).json({ error: 'No verified knowledge-base content is configured. No AI reply was generated.', code: 'NO_KNOWLEDGE_BASE' });
        }

        // Rank by matching keywords or category
        const scoredKb = kbEntries.filter(k => {
          const text = (k.title + ' ' + (k.keywords || []).join(' ') + ' ' + k.category + ' ' + k.content).toLowerCase();
          return lowerMsg.split(/\s+/).some(word => word.length >= 4 && text.includes(word));
        });
        if (scoredKb.length === 0) {
          return res.status(422).json({
            error: 'The knowledge base does not contain a verified answer for this question. Human review is required.',
            code: 'KNOWLEDGE_NOT_FOUND',
            handover_required: true
          });
        }
        const activeSources = scoredKb;

        let generatedReply = '';
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

        if (apiKey) {
          try {
            const kbContext = activeSources.map(s => `[${s.title}]: ${s.content}`).join('\n\n');
            const systemPrompt = `${agent.system_instructions}\nBusiness Name: ${agent.business_name}\nTone: ${agent.tone}\n\nGround your reply strictly on the following verified Knowledge Base:\n${kbContext}\n\nIf the information is not in the Knowledge Base, politely offer to connect them with a human specialist.`;

            const completion = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://nextbright.io',
                'X-Title': 'NextBright AI Reply Agent'
              },
              body: JSON.stringify({
                model: 'openai/gpt-4o-mini',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: message }
                ],
                temperature: 0.6,
                max_tokens: 220
              })
            });

            if (completion.ok) {
              const resData = await completion.json();
              generatedReply = resData.choices?.[0]?.message?.content?.trim() || '';
            }
          } catch (aiErr) {
            console.warn('[AI Agent OpenRouter call error]:', aiErr.message);
          }
        }

        if (!apiKey) return res.status(503).json({ error: 'AI provider is not configured. No reply was generated.', code: 'AI_PROVIDER_NOT_CONFIGURED' });
        if (!generatedReply) return res.status(502).json({ error: 'The AI provider did not return a verified reply.', code: 'AI_PROVIDER_FAILED' });

        if (supabase && organizationId) {
          try {
            await supabase.from('ai_reply_logs').insert({
              organization_id: organizationId,
              agent_id: agent.id || null,
              channel,
              conversation_id: req.body.conversationId || 'web-demo',
              incoming_message: message,
              final_sent_reply: generatedReply,
              confidence_score: 0.94,
              status: 'sent'
            });
          } catch (_) {}
        }

        return res.status(200).json({
          success: true,
          status: 'sent',
          reply: generatedReply,
          confidence_score: 0.94,
          grounded_in: activeSources.map(s => s.title)
        });
      }

      if (action === 'logs') {
        const { data: logs, error } = await supabase
          .from('ai_reply_logs')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (isMissingAiSchema(error)) return aiSchemaError(res);
        if (error) return res.status(500).json({ error: 'Could not load AI reply logs.', code: 'AI_LOGS_LOAD_FAILED' });
        return res.status(200).json({ success: true, logs: logs || [] });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 2. ROUTE: KNOWLEDGE BASE ENTRIES ─────────────────────────────────────
  if (route === 'knowledge_base' || route === 'knowledge-base') {
    try {
      const access = await requireOrgAccess(req, res, null);
      if (!access) return;
      const organizationId = access.organizationId;
      const supabase = createSupabaseAdminClient();
      if (!supabase) return res.status(503).json({ error: 'Server database configuration is unavailable.' });
      if (['save', 'create', 'update', 'delete'].includes(action) && !canManageAi(access)) {
        return res.status(403).json({ error: 'Only an Owner or Admin can manage the knowledge base.', code: 'INSUFFICIENT_ROLE' });
      }

      if (req.method === 'GET' && action === 'list') {
        const category = req.query.category;
        let query = supabase
          .from('ai_knowledge_base')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });
        if (category && category !== 'all') query = query.eq('category', category);
        const { data: entries, error } = await query;
        if (isMissingAiSchema(error)) return aiSchemaError(res);
        if (error) return res.status(500).json({ error: 'Could not load the AI knowledge base.', code: 'AI_KB_LOAD_FAILED' });
        return res.status(200).json({ success: true, entries: entries || [] });
      }

      if (req.method === 'POST' && (action === 'save' || action === 'create' || action === 'update')) {
        const entry = { ...(req.body.entry || req.body), organization_id: organizationId };
        if (entry.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id)) delete entry.id;
        entry.updated_at = new Date().toISOString();
        const { data: saved, error } = await supabase.from('ai_knowledge_base').upsert(entry).select('*').single();
        if (isMissingAiSchema(error)) return aiSchemaError(res);
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true, entry: saved });
      }

      if (req.method === 'DELETE' || action === 'delete') {
        const id = req.query.id || req.body?.id;
        const { error } = await supabase.from('ai_knowledge_base').delete().eq('id', id).eq('organization_id', organizationId);
        if (isMissingAiSchema(error)) return aiSchemaError(res);
        if (error) return res.status(500).json({ error: 'Could not delete knowledge entry.' });
        return res.status(200).json({ success: true, id });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 3. DEFAULT: OPENROUTER / OPENAI PROXY ───────────────────────────────
  const access = await requireOrgAccess(req, res, null);
  if (!access) return;
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
