-- =============================================================================
-- NextBright CRM — AI Reply Agent & Knowledge Base Upgrade Migration
-- =============================================================================
-- File: supabase/migrations/20261010_ai_reply_agent_upgrade.sql
-- Purpose: Schema support for multi-tenant AI Reply Agents, Knowledge Base,
--          Visual Automation Rules, Reply Audit Logs & Human Handover state.
-- =============================================================================

BEGIN;

-- 1. AI Agents Table
CREATE TABLE IF NOT EXISTS public.ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    channels JSONB NOT NULL DEFAULT '["instagram", "whatsapp"]'::jsonb,
    business_name TEXT,
    language TEXT DEFAULT 'en',
    tone TEXT DEFAULT 'Professional',
    system_instructions TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'needs_setup', 'error')),
    working_hours JSONB DEFAULT '{"enabled": false, "start": "09:00", "end": "18:00", "timezone": "UTC"}'::jsonb,
    auto_reply_enabled BOOLEAN NOT NULL DEFAULT true,
    confidence_threshold NUMERIC DEFAULT 0.75,
    max_replies_per_conversation INT DEFAULT 10,
    handover_on_low_confidence BOOLEAN DEFAULT true,
    handover_keywords JSONB DEFAULT '["human", "agent", "person", "representative", "support", "help"]'::jsonb,
    lead_qualification_enabled BOOLEAN DEFAULT true,
    appointment_assistant_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_org ON public.ai_agents(organization_id);

-- 2. AI Knowledge Base Table
CREATE TABLE IF NOT EXISTS public.ai_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'company', 'product', 'pricing', 'faq', 'business_hours', 'policy', 'booking')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    keywords JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_org ON public.ai_knowledge_base(organization_id);

-- 3. AI Automation Rules Table
CREATE TABLE IF NOT EXISTS public.ai_automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_event TEXT NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_rules_org ON public.ai_automation_rules(organization_id);

-- 4. AI Reply Logs Table (Audit Trail & Performance Analytics)
CREATE TABLE IF NOT EXISTS public.ai_reply_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
    channel TEXT NOT NULL CHECK (channel IN ('instagram', 'whatsapp')),
    conversation_id TEXT NOT NULL,
    incoming_message TEXT NOT NULL,
    ai_draft_reply TEXT,
    final_sent_reply TEXT,
    confidence_score NUMERIC DEFAULT 1.0,
    handover_triggered BOOLEAN DEFAULT false,
    handover_reason TEXT,
    api_result JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'handover', 'blocked_by_window', 'paused')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_org ON public.ai_reply_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_channel ON public.ai_reply_logs(channel);

-- 5. Extend conversations and social_conversations for Human Handover Controls
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS ai_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS handover_notes TEXT,
    ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.social_conversations
    ADD COLUMN IF NOT EXISTS ai_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS handover_notes TEXT,
    ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 6. Row Level Security Policies (Multi-Tenant Isolation)
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reply_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_agents_tenant_policy ON public.ai_agents
    FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_knowledge_tenant_policy ON public.ai_knowledge_base
    FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_rules_tenant_policy ON public.ai_automation_rules
    FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_logs_tenant_policy ON public.ai_reply_logs
    FOR ALL USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

COMMIT;
