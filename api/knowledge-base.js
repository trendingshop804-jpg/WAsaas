/* =============================================================================
   api/knowledge-base.js — NextBright CRM Vercel Serverless Function
   AI Knowledge Base CRUD, Search & Organization Grounding
   ============================================================================= */

import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const access = await requireOrgAccess(req, res);
    if (!access) return;
    const organizationId = access.organizationId;
    const supabase = createSupabaseAdminClient();

    const action = req.query.action || req.body?.action || 'list';

    // ── 1. LIST / SEARCH KNOWLEDGE ENTRIES ──────────────────────────────────
    if (req.method === 'GET' || action === 'list') {
      const category = req.query.category;
      if (supabase) {
        let query = supabase
          .from('ai_knowledge_base')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (category && category !== 'all') {
          query = query.eq('category', category);
        }

        const { data: entries, error } = await query;
        if (!error && entries && entries.length > 0) {
          return res.status(200).json({ success: true, entries });
        }
      }

      // Default mock knowledge base if none in DB
      return res.status(200).json({
        success: true,
        source: 'default',
        entries: [
          {
            id: 'kb-1',
            category: 'company',
            title: 'NextBright CRM Overview',
            content: 'NextBright CRM is a multi-tenant AI automation platform supporting WhatsApp Cloud API, Instagram Graph API, Twilio Voice Calls, and lead pipeline tracking.',
            keywords: ['nextbright', 'crm', 'saas', 'overview'],
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 5).toISOString()
          },
          {
            id: 'kb-2',
            category: 'pricing',
            title: 'Subscription Pricing & Packages',
            content: 'Starter Plan: $49/mo (includes 1,000 monthly messages & CRM pipeline). Enterprise Plan: $149/mo (includes unlimited AI auto-replies, multi-agent support, and priority SLA).',
            keywords: ['pricing', 'cost', 'plans', 'enterprise', 'starter'],
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 4).toISOString()
          },
          {
            id: 'kb-3',
            category: 'faq',
            title: 'Working Hours & Location',
            content: 'Our support team operates Monday through Friday from 9:00 AM to 6:00 PM EST. Headquartered at 100 Tech Park Way, Suite 400, San Francisco, CA.',
            keywords: ['hours', 'location', 'address', 'support', 'timing'],
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 3).toISOString()
          },
          {
            id: 'kb-4',
            category: 'booking',
            title: 'Demo & Appointment Instructions',
            content: 'Customers can request a live 1-on-1 demo by sharing their full name, company, email, and preferred date/time slot.',
            keywords: ['demo', 'booking', 'appointment', 'schedule'],
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 2).toISOString()
          }
        ]
      });
    }

    // ── 2. SAVE KNOWLEDGE ENTRY ──────────────────────────────────────────────
    if (req.method === 'POST' && (action === 'save' || action === 'create')) {
      const entry = req.body.entry || req.body;
      entry.organization_id = organizationId;
      entry.updated_at = new Date().toISOString();

      if (!entry.title || !entry.content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }

      if (supabase) {
        const { data: saved, error } = await supabase
          .from('ai_knowledge_base')
          .upsert(entry)
          .select('*')
          .single();

        if (error) {
          return res.status(500).json({ error: `Failed to save knowledge entry: ${error.message}` });
        }
        return res.status(200).json({ success: true, entry: saved });
      }

      return res.status(200).json({ success: true, entry });
    }

    // ── 3. DELETE KNOWLEDGE ENTRY ────────────────────────────────────────────
    if (req.method === 'DELETE' || action === 'delete') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Knowledge entry ID required' });

      if (supabase) {
        await supabase
          .from('ai_knowledge_base')
          .delete()
          .eq('id', id)
          .eq('organization_id', organizationId);
      }

      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[knowledge-base API error]:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
