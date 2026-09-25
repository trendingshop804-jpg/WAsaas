-- ============================================================================
-- NexusLead AI — Supabase Auth, Profiles, WhatsApp & Instagram Connect Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations (Workspaces) Table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    industry VARCHAR(150),
    website VARCHAR(255),
    location VARCHAR(200),
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    plan VARCHAR(50) DEFAULT 'growth',
    credits_used INT DEFAULT 0,
    credits_limit INT DEFAULT 5000,
    is_paused BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Public Users (Profiles) Table linked to Supabase auth.users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    role VARCHAR(50) DEFAULT 'OWNER',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Automatic Trigger: Creates Workspace & Profile on auth.users Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_org_id UUID;
    ws_name TEXT;
    u_name TEXT;
BEGIN
    ws_name := COALESCE(NEW.raw_user_meta_data->>'workspace_name', 'My Workspace');
    u_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

    -- Create default organization for new user
    INSERT INTO public.organizations (name, slug)
    VALUES (
        ws_name,
        LOWER(REGEXP_REPLACE(ws_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(NEW.id::text, 1, 8)
    )
    RETURNING id INTO new_org_id;

    -- Create public profile linked to organization
    INSERT INTO public.users (id, organization_id, email, name, role)
    VALUES (
        NEW.id,
        new_org_id,
        NEW.email,
        u_name,
        'OWNER'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. WhatsApp Connections Table (Stores Encrypted Tokens)
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) DEFAULT 'META_CLOUD_API',
    phone_number VARCHAR(50) NOT NULL,
    display_name VARCHAR(150),
    waba_id VARCHAR(100) NOT NULL,
    phone_number_id VARCHAR(100) NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, phone_number_id)
);

-- 5. Instagram Connections Table (Stores Encrypted Tokens)
CREATE TABLE IF NOT EXISTS public.instagram_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    instagram_business_id VARCHAR(100) NOT NULL,
    instagram_username VARCHAR(100),
    page_id VARCHAR(100),
    access_token_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, instagram_business_id)
);

-- 6. Row Level Security (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Organizations policies
CREATE POLICY "Org members can view their organization" ON public.organizations
    FOR SELECT USING (
        id IN (SELECT organization_id FROM public.users WHERE id = auth.uid())
    );

CREATE POLICY "Org owners can update their organization" ON public.organizations
    FOR UPDATE USING (
        id IN (SELECT organization_id FROM public.users WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN'))
    );

-- WhatsApp connection policies
CREATE POLICY "Org members can view whatsapp connections" ON public.whatsapp_connections
    FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid())
    );

CREATE POLICY "Org admins can manage whatsapp connections" ON public.whatsapp_connections
    FOR ALL USING (
        organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN'))
    );

-- Instagram connection policies
CREATE POLICY "Org members can view instagram connections" ON public.instagram_connections
    FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid())
    );

CREATE POLICY "Org admins can manage instagram connections" ON public.instagram_connections
    FOR ALL USING (
        organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN'))
    );
