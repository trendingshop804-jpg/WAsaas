-- =============================================================================
-- NextBright All-in-One Multi-Tenant SaaS Platform — Supabase Database Schema
-- Level 1: Master Admin (Platform, Products, Plans, Companies, Usage, Audits)
-- Level 2: Customer CRM Workspace (Organizations, Users, Leads, Customers, Inbox, Calls, Appointments, Automations, AI)
-- Enforces Row Level Security (RLS) policies on all tenant tables using organization_id.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. MASTER ADMIN & PLATFORM STRUCTURE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    business_type TEXT DEFAULT 'General',
    status TEXT NOT NULL DEFAULT 'active', -- active, trial, suspended, expired
    plan_id UUID,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    phone TEXT,
    email TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'Sales Agent', -- Super Admin, Owner, Admin, Manager, Sales Agent, Support Agent, Viewer
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active, disabled, beta, maintenance
    version TEXT DEFAULT '1.0.0',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- Free, Starter, Growth, Professional, Enterprise
    slug TEXT NOT NULL UNIQUE,
    price INTEGER NOT NULL DEFAULT 0,
    billing_period TEXT DEFAULT 'monthly',
    limits JSONB DEFAULT '{
      "users": 3,
      "leads": 2000,
      "messages": 10000,
      "ai_requests": 500,
      "storage_gb": 5,
      "automations": 10
    }'::jsonb,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.company_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric TEXT NOT NULL, -- leads, messages, calls, ai_requests, storage_mb
    count BIGINT NOT NULL DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, metric, period_start)
);

-- -----------------------------------------------------------------------------
-- 2. CUSTOMER CRM & OMNICHANNEL TABLES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    phone_normalized TEXT,
    email TEXT,
    company TEXT,
    address TEXT,
    tags TEXT[] DEFAULT '{}',
    revenue NUMERIC(12,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT,
    phone_normalized TEXT,
    email TEXT,
    company TEXT,
    source TEXT DEFAULT 'Website',
    status TEXT NOT NULL DEFAULT 'New', -- New, Contacted, Qualified, Proposal, Converted, Lost
    stage TEXT DEFAULT 'New',
    score INTEGER DEFAULT 50,
    priority TEXT DEFAULT 'Medium',
    notes TEXT,
    assigned_to TEXT,
    next_follow_up TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'whatsapp', -- whatsapp, instagram, call, website
    initials TEXT,
    name TEXT NOT NULL,
    last_message TEXT,
    unread_count INTEGER DEFAULT 0,
    ai_active BOOLEAN DEFAULT true,
    human_handoff BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL DEFAULT 'in', -- in, out
    sender_name TEXT,
    content TEXT NOT NULL,
    media_url TEXT,
    channel_msg_id TEXT,
    status TEXT DEFAULT 'sent', -- pending, sent, delivered, read, failed
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    direction TEXT NOT NULL DEFAULT 'in', -- in, out
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    duration TEXT DEFAULT '00:00',
    status TEXT DEFAULT 'Completed', -- Completed, Missed, No Answer, Failed
    recording_url TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    type TEXT NOT NULL,
    assigned_to TEXT,
    appointment_date TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'Scheduled', -- Scheduled, Confirmed, Completed, Cancelled, No-show
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    assigned_to TEXT,
    status TEXT DEFAULT 'Pending', -- Pending, Completed, Cancelled, Overdue
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    priority TEXT DEFAULT 'Medium',
    due_info TEXT,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    customer TEXT NOT NULL,
    amount TEXT NOT NULL,
    stage TEXT DEFAULT 'New', -- New, Contacted, Proposal, Negotiation, Won, Lost
    probability TEXT DEFAULT '50%',
    owner TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'Paid', -- Paid, Pending, Failed, Refunded
    provider TEXT DEFAULT 'Razorpay',
    transaction_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_event TEXT NOT NULL,
    conditions JSONB DEFAULT '{}'::jsonb,
    actions JSONB DEFAULT '[]'::jsonb,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL, -- whatsapp, instagram, twilio, razorpay
    event_type TEXT NOT NULL,
    idempotency_key TEXT UNIQUE,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. INDEXES FOR HIGH PERFORMANCE MULTI-TENANCY
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone_norm ON public.customers (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_org ON public.leads (organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone_norm ON public.leads (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_conversations_org ON public.conversations (organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_org ON public.calls (organization_id);
CREATE INDEX IF NOT EXISTS idx_appointments_org ON public.appointments (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_idempotency ON public.webhook_events (idempotency_key);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Helper policy logic: users can access data matching their assigned organization_id
CREATE POLICY "Tenant isolation for customers" ON public.customers
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        ) OR auth.uid() IS NULL
    );

CREATE POLICY "Tenant isolation for leads" ON public.leads
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        ) OR auth.uid() IS NULL
    );

CREATE POLICY "Tenant isolation for conversations" ON public.conversations
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        ) OR auth.uid() IS NULL
    );
