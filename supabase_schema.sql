-- =============================================================================
-- Lead Follow-up Management Application - Supabase Production Schema & Migration
-- Safe to execute on new or existing Supabase projects.
-- =============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. LEADS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    phone TEXT,
    email TEXT,
    company TEXT,
    source TEXT,
    interested_in TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    follow_up_date DATE,
    last_contacted_at TIMESTAMPTZ,
    next_follow_up_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all required columns exist (safe for existing tables)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS interested_in TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_follow_up_date DATE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- -----------------------------------------------------------------------------
-- 2. FOLLOW UP MESSAGES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follow_up_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    stage TEXT,
    channel TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.follow_up_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.follow_up_messages ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.follow_up_messages ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
ALTER TABLE public.follow_up_messages ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE public.follow_up_messages ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE public.follow_up_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- -----------------------------------------------------------------------------
-- 3. USER SETTINGS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    display_name TEXT,
    default_interval INTEGER DEFAULT 3,
    default_tone TEXT DEFAULT 'Professional',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS default_interval INTEGER DEFAULT 3;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS default_tone TEXT DEFAULT 'Professional';

-- -----------------------------------------------------------------------------
-- 4. INDEXES FOR PERFORMANCE
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON public.leads (user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up_date ON public.leads (next_follow_up_date);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.follow_up_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.follow_up_messages (lead_id);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON public.user_settings (user_id);

-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Clean existing policies to prevent conflicts
DROP POLICY IF EXISTS "Users can SELECT their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can INSERT their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can UPDATE their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can DELETE their own leads" ON public.leads;

DROP POLICY IF EXISTS "Users can SELECT their own follow_up_messages" ON public.follow_up_messages;
DROP POLICY IF EXISTS "Users can INSERT their own follow_up_messages" ON public.follow_up_messages;
DROP POLICY IF EXISTS "Users can UPDATE their own follow_up_messages" ON public.follow_up_messages;
DROP POLICY IF EXISTS "Users can DELETE their own follow_up_messages" ON public.follow_up_messages;

DROP POLICY IF EXISTS "Users can SELECT their own user_settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can INSERT their own user_settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can UPDATE their own user_settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can DELETE their own user_settings" ON public.user_settings;

-- LEADS Policies
CREATE POLICY "Users can SELECT their own leads" ON public.leads
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can INSERT their own leads" ON public.leads
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can UPDATE their own leads" ON public.leads
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can DELETE their own leads" ON public.leads
    FOR DELETE USING (auth.uid() = user_id);

-- FOLLOW UP MESSAGES Policies
CREATE POLICY "Users can SELECT their own follow_up_messages" ON public.follow_up_messages
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can INSERT their own follow_up_messages" ON public.follow_up_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can UPDATE their own follow_up_messages" ON public.follow_up_messages
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can DELETE their own follow_up_messages" ON public.follow_up_messages
    FOR DELETE USING (auth.uid() = user_id);

-- USER SETTINGS Policies
CREATE POLICY "Users can SELECT their own user_settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can INSERT their own user_settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can UPDATE their own user_settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can DELETE their own user_settings" ON public.user_settings
    FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 6. AUTOMATIC UPDATED_AT TRIGGER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_leads_updated_at ON public.leads;
CREATE TRIGGER set_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER set_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
