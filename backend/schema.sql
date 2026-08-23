-- ============================================================================
-- NexusLead AI — Multi-Tenant PostgreSQL Schema with Row Level Security (RLS)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations Table
CREATE TABLE organizations (
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

-- Users & RBAC
CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'SALES_AGENT', 'VIEWER');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(150) NOT NULL,
    role user_role DEFAULT 'SALES_AGENT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leads CRM Table
CREATE TYPE lead_category AS ENUM ('HOT', 'WARM', 'COLD', 'UNQUALIFIED');
CREATE TYPE pipeline_stage AS ENUM ('NEW', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(200) NOT NULL,
    job_title VARCHAR(150),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    website VARCHAR(255),
    industry VARCHAR(150),
    location VARCHAR(200),
    source VARCHAR(100) DEFAULT 'Discovery Engine',
    source_url TEXT,
    score INT DEFAULT 50,
    score_category lead_category DEFAULT 'WARM',
    status pipeline_stage DEFAULT 'NEW',
    opted_out BOOLEAN DEFAULT FALSE,
    notes TEXT,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    ai_summary TEXT,
    assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
    last_contacted_at TIMESTAMP WITH TIME ZONE,
    next_follow_up_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leads_org_phone ON leads(organization_id, phone);
CREATE INDEX idx_leads_org_status ON leads(organization_id, status);
CREATE INDEX idx_leads_org_score ON leads(organization_id, score);

-- WhatsApp Connections Table
CREATE TYPE wa_provider_type AS ENUM ('META_CLOUD_API', 'AUTHORIZED_QR_GATEWAY');

CREATE TABLE whatsapp_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider wa_provider_type DEFAULT 'META_CLOUD_API',
    phone_number VARCHAR(50) NOT NULL,
    waba_id VARCHAR(100),
    phone_number_id VARCHAR(100),
    access_token_encrypted TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Message Templates
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) DEFAULT 'MARKETING',
    language VARCHAR(50) DEFAULT 'en_US',
    body TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    meta_status VARCHAR(50) DEFAULT 'APPROVED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Campaigns Table
CREATE TYPE campaign_status AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED');

CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    status campaign_status DEFAULT 'SCHEDULED',
    template_id UUID NOT NULL REFERENCES templates(id),
    daily_limit INT DEFAULT 150,
    sending_window VARCHAR(100) DEFAULT '09:30 AM - 06:30 PM IST',
    total_leads INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    delivered_count INT DEFAULT 0,
    reply_count INT DEFAULT 0,
    qualified_count INT DEFAULT 0,
    won_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Conversations & Messages
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID UNIQUE NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    mode VARCHAR(20) DEFAULT 'AI',
    unread_count INT DEFAULT 0,
    last_message TEXT,
    last_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL, -- 'INBOUND' / 'OUTBOUND'
    is_ai BOOLEAN DEFAULT FALSE,
    body TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'SENT',
    meta_message_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Opt-Out Blacklist
CREATE TABLE opt_outs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    phone VARCHAR(50) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, phone)
);

-- Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action VARCHAR(150) NOT NULL,
    entity VARCHAR(200) NOT NULL,
    actor VARCHAR(150) NOT NULL,
    details TEXT,
    status VARCHAR(50) DEFAULT 'Success',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_org_time ON audit_logs(organization_id, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- User Integration Keys (Encrypted API credentials per user)
-- Encryption is handled by the manage-integration-keys Edge Function (AES-GCM)
-- NEVER store plaintext keys — only encrypted_value and masked_value are stored
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE user_integration_keys (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_name         VARCHAR(100) NOT NULL,        -- e.g. 'openai_api_key'
    encrypted_value  TEXT NOT NULL,                -- AES-GCM encrypted, base64-encoded
    masked_value     VARCHAR(60) NOT NULL,          -- e.g. 'sk-proj-••••••••1a2b'
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_user_key UNIQUE (user_id, key_name)
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_integration_key_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_integration_keys_updated_at
  BEFORE UPDATE ON user_integration_keys
  FOR EACH ROW EXECUTE PROCEDURE update_integration_key_updated_at();

-- Indexes
CREATE INDEX idx_integration_keys_user ON user_integration_keys(user_id);

-- ── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE user_integration_keys ENABLE ROW LEVEL SECURITY;

-- Users can SELECT only their own keys
CREATE POLICY "Users can view own integration keys"
  ON user_integration_keys
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can INSERT only for themselves
CREATE POLICY "Users can insert own integration keys"
  ON user_integration_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can UPDATE only their own keys
CREATE POLICY "Users can update own integration keys"
  ON user_integration_keys
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can DELETE only their own keys
CREATE POLICY "Users can delete own integration keys"
  ON user_integration_keys
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service-role bypass (needed by Edge Functions calling supabaseAdmin)
CREATE POLICY "Service role full access to integration keys"
  ON user_integration_keys
  USING (auth.role() = 'service_role');

-- ── Revoke direct plaintext access from anon role ─────────────────────────
-- The encrypted_value column is never returned by the Edge Function.
-- This additional column-level restriction is a defence-in-depth measure.
REVOKE SELECT (encrypted_value) ON user_integration_keys FROM anon;
REVOKE SELECT (encrypted_value) ON user_integration_keys FROM authenticated;

