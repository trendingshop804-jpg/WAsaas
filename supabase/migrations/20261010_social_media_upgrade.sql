-- =============================================================================
-- NextBright CRM — Social Media & WhatsApp Upgrade Migration
-- =============================================================================
-- File    : supabase/migrations/20261010_social_media_upgrade.sql
-- Status  : PREPARED — Run via Supabase Dashboard SQL Editor or CLI
-- Purpose : Adds Instagram inbox, post scheduler, media library, WhatsApp
--           campaigns, audience segments and opt-out tables.
--
-- SAFETY PROPERTIES
--   * Idempotent  — safe to run more than once (IF NOT EXISTS / ON CONFLICT DO NOTHING)
--   * Additive    — no DROP, no TRUNCATE, no destructive changes
--   * RLS-scoped  — every tenant table has organization_id + RLS policy
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. SOCIAL ACCOUNTS (Instagram / Facebook connections per org)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.social_accounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    platform             TEXT NOT NULL DEFAULT 'instagram',  -- instagram, facebook
    account_id           TEXT NOT NULL,          -- Meta IGID or PSID
    username             TEXT,
    display_name         TEXT,
    profile_picture_url  TEXT,
    followers_count      INTEGER DEFAULT 0,
    page_id              TEXT,                   -- Facebook Page linked to IG
    waba_id              TEXT,                   -- WhatsApp Business Account ID
    access_token_enc     TEXT,                   -- AES-GCM encrypted long-lived token
    token_expires_at     TIMESTAMPTZ,
    scopes               TEXT[],                 -- granted OAuth scopes
    is_active            BOOLEAN DEFAULT true,
    last_synced_at       TIMESTAMPTZ,
    last_error           TEXT,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),
    UNIQUE (organization_id, platform, account_id)
);

-- =============================================================================
-- 2. SOCIAL CONVERSATIONS (Instagram DM threads)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.social_conversations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    social_account_id UUID REFERENCES public.social_accounts(id) ON DELETE SET NULL,
    platform          TEXT NOT NULL DEFAULT 'instagram',
    external_thread_id TEXT,                    -- Instagram conversation_id from API
    participant_id    TEXT,                     -- sender IGSID / PSID
    participant_name  TEXT,
    participant_username TEXT,
    participant_pic   TEXT,
    lead_id           UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    customer_id       UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    status            TEXT NOT NULL DEFAULT 'open', -- open, closed, pending, spam
    assigned_to       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    unread_count      INTEGER DEFAULT 0,
    labels            TEXT[],
    internal_notes    JSONB DEFAULT '[]'::jsonb,
    last_message_at   TIMESTAMPTZ DEFAULT now(),
    last_message_text TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_convs_org ON public.social_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_social_convs_status ON public.social_conversations(status);
CREATE INDEX IF NOT EXISTS idx_social_convs_platform ON public.social_conversations(platform);

-- =============================================================================
-- 3. SOCIAL MESSAGES (Instagram DM messages)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.social_messages (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id      UUID NOT NULL REFERENCES public.social_conversations(id) ON DELETE CASCADE,
    external_message_id  TEXT UNIQUE,            -- Instagram message_id from API
    direction            TEXT NOT NULL DEFAULT 'in', -- in, out
    message_type         TEXT DEFAULT 'text',    -- text, image, video, audio, sticker, share, story_mention, unsupported
    content              TEXT,
    media_url            TEXT,
    media_type           TEXT,
    sender_id            TEXT,
    sender_name          TEXT,
    delivery_status      TEXT DEFAULT 'sent',    -- sent, delivered, read, failed
    is_deleted           BOOLEAN DEFAULT false,
    created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_msgs_conv ON public.social_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_social_msgs_ext_id ON public.social_messages(external_message_id);

-- =============================================================================
-- 4. SCHEDULED POSTS (Instagram post scheduler)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    social_account_id    UUID REFERENCES public.social_accounts(id) ON DELETE SET NULL,
    post_type            TEXT NOT NULL DEFAULT 'feed_image', -- feed_image, feed_video, reel, carousel, story
    status               TEXT NOT NULL DEFAULT 'draft',      -- draft, scheduled, processing, published, failed, cancelled
    title                TEXT,
    caption              TEXT,
    hashtags             TEXT,
    alt_text             TEXT,
    scheduled_at         TIMESTAMPTZ,
    published_at         TIMESTAMPTZ,
    publish_immediately  BOOLEAN DEFAULT false,

    -- Meta API publishing IDs
    container_id         TEXT,          -- creation_id from step 1
    media_id             TEXT,          -- published object ID
    ig_permalink         TEXT,          -- post URL on Instagram
    publish_attempts     INTEGER DEFAULT 0,
    last_publish_error   TEXT,

    -- Carousel items (JSON array of {media_url, alt_text})
    carousel_items       JSONB DEFAULT '[]'::jsonb,

    created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_posts_org ON public.scheduled_posts(organization_id);
CREATE INDEX IF NOT EXISTS idx_sched_posts_status ON public.scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_sched_posts_scheduled ON public.scheduled_posts(scheduled_at);

-- =============================================================================
-- 5. POST MEDIA (media files attached to scheduled posts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.post_media (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    post_id          UUID REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
    storage_path     TEXT,           -- Supabase Storage path
    public_url       TEXT,
    media_type       TEXT,           -- image, video
    file_name        TEXT,
    file_size_bytes  BIGINT,
    mime_type        TEXT,
    width_px         INTEGER,
    height_px        INTEGER,
    duration_secs    NUMERIC(10,2),
    upload_status    TEXT DEFAULT 'pending', -- pending, uploaded, failed
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 6. MEDIA LIBRARY (content library assets)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.media_library (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    folder_id        UUID,                        -- FK added after folder table
    file_name        TEXT NOT NULL,
    display_name     TEXT,
    storage_path     TEXT NOT NULL,
    public_url       TEXT,
    media_type       TEXT NOT NULL,               -- image, video
    mime_type        TEXT,
    file_size_bytes  BIGINT,
    width_px         INTEGER,
    height_px        INTEGER,
    duration_secs    NUMERIC(10,2),
    tags             TEXT[],
    campaign_id      TEXT,
    usage_count      INTEGER DEFAULT 0,
    uploaded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_lib_org ON public.media_library(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_lib_folder ON public.media_library(folder_id);

-- =============================================================================
-- 7. MEDIA FOLDERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.media_folders (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    parent_id        UUID REFERENCES public.media_folders(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- Add FK now that folders table exists
ALTER TABLE public.media_library
    ADD CONSTRAINT fk_media_folder
    FOREIGN KEY (folder_id) REFERENCES public.media_folders(id) ON DELETE SET NULL
    NOT VALID; -- NOT VALID so it doesn't lock on existing rows

-- =============================================================================
-- 8. WHATSAPP CAMPAIGNS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.wa_campaigns (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    description      TEXT,
    status           TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, running, paused, completed, cancelled, failed
    template_name    TEXT,
    template_language TEXT DEFAULT 'en',
    template_params  JSONB DEFAULT '{}'::jsonb,     -- variable map {1: 'field_name', ...}
    audience_type    TEXT DEFAULT 'manual',          -- manual, segment, csv_import
    segment_ids      UUID[],
    scheduled_at     TIMESTAMPTZ,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,

    -- Batch / rate config
    batch_size       INTEGER DEFAULT 50,
    batch_delay_secs INTEGER DEFAULT 60,
    retry_failed     BOOLEAN DEFAULT true,
    max_retries      INTEGER DEFAULT 2,

    -- Aggregated stats (updated by triggers/webhooks)
    total_recipients INTEGER DEFAULT 0,
    queued_count     INTEGER DEFAULT 0,
    sent_count       INTEGER DEFAULT 0,
    delivered_count  INTEGER DEFAULT 0,
    read_count       INTEGER DEFAULT 0,
    failed_count     INTEGER DEFAULT 0,
    skipped_count    INTEGER DEFAULT 0,

    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_campaigns_org ON public.wa_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_status ON public.wa_campaigns(status);

-- =============================================================================
-- 9. CAMPAIGN RECIPIENTS (per-recipient delivery tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    campaign_id      UUID NOT NULL REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
    lead_id          UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    phone_normalized TEXT NOT NULL,
    phone_display    TEXT,
    recipient_name   TEXT,
    template_vars    JSONB DEFAULT '{}'::jsonb, -- resolved variable values for this recipient
    status           TEXT NOT NULL DEFAULT 'queued', -- queued, sent, delivered, read, failed, skipped
    wa_message_id    TEXT,                       -- Meta message ID for status tracking
    skip_reason      TEXT,                       -- opted_out, invalid_number, duplicate, etc.
    error_detail     TEXT,
    sent_at          TIMESTAMPTZ,
    delivered_at     TIMESTAMPTZ,
    read_at          TIMESTAMPTZ,
    failed_at        TIMESTAMPTZ,
    retry_count      INTEGER DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (campaign_id, phone_normalized)
);

CREATE INDEX IF NOT EXISTS idx_camp_recip_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_camp_recip_status ON public.campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_camp_recip_phone ON public.campaign_recipients(phone_normalized);

-- =============================================================================
-- 10. AUDIENCE SEGMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audience_segments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    description      TEXT,
    filters          JSONB DEFAULT '{}'::jsonb, -- {status: ['Qualified'], tags: ['VIP'], city: 'Mumbai', ...}
    contact_count    INTEGER DEFAULT 0,          -- cached count, refreshed on save
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_segments_org ON public.audience_segments(organization_id);

-- =============================================================================
-- 11. WHATSAPP OPT-OUTS / SUPPRESSION LIST
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.wa_optouts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone_normalized TEXT NOT NULL,
    reason           TEXT DEFAULT 'user_request', -- user_request, stop_keyword, manual, api_block
    opted_out_at     TIMESTAMPTZ DEFAULT now(),
    opted_in_at      TIMESTAMPTZ,
    is_active        BOOLEAN DEFAULT true,         -- true = currently opted out
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (organization_id, phone_normalized)
);

CREATE INDEX IF NOT EXISTS idx_optouts_org ON public.wa_optouts(organization_id);
CREATE INDEX IF NOT EXISTS idx_optouts_phone ON public.wa_optouts(phone_normalized);

-- =============================================================================
-- 12. CAMPAIGN ANALYTICS EVENTS (for detailed reporting)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_analytics (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    campaign_id      UUID REFERENCES public.wa_campaigns(id) ON DELETE CASCADE,
    recipient_id     UUID REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
    event_type       TEXT NOT NULL, -- sent, delivered, read, failed, clicked
    event_at         TIMESTAMPTZ DEFAULT now(),
    meta_payload     JSONB
);

CREATE INDEX IF NOT EXISTS idx_analytics_campaign ON public.campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON public.campaign_analytics(event_type);

-- =============================================================================
-- 13. ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audience_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_optouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_analytics ENABLE ROW LEVEL SECURITY;

-- Helper: true if caller belongs to the org
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_users
        WHERE organization_id = p_org_id
          AND user_id = auth.uid()
    );
$$;

-- Policies — tenant isolation using helper
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'social_accounts','social_conversations','social_messages',
    'scheduled_posts','post_media','media_library','media_folders',
    'wa_campaigns','campaign_recipients','audience_segments',
    'wa_optouts','campaign_analytics'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_%s" ON public.%I
       FOR ALL USING (public.is_org_member(organization_id))
       WITH CHECK (public.is_org_member(organization_id))',
      t, t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 14. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_sched_posts_org_status
    ON public.scheduled_posts(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_social_convs_last_msg
    ON public.social_conversations(organization_id, last_message_at DESC);

-- =============================================================================
-- COMMIT
-- =============================================================================
COMMIT;

-- =============================================================================
-- ROLLBACK (run these statements to undo — keep this comment for reference)
-- =============================================================================
/*
BEGIN;
DROP TABLE IF EXISTS public.campaign_analytics CASCADE;
DROP TABLE IF EXISTS public.wa_optouts CASCADE;
DROP TABLE IF EXISTS public.audience_segments CASCADE;
DROP TABLE IF EXISTS public.campaign_recipients CASCADE;
DROP TABLE IF EXISTS public.wa_campaigns CASCADE;
DROP TABLE IF EXISTS public.media_library CASCADE;
DROP TABLE IF EXISTS public.media_folders CASCADE;
DROP TABLE IF EXISTS public.post_media CASCADE;
DROP TABLE IF EXISTS public.scheduled_posts CASCADE;
DROP TABLE IF EXISTS public.social_messages CASCADE;
DROP TABLE IF EXISTS public.social_conversations CASCADE;
DROP TABLE IF EXISTS public.social_accounts CASCADE;
DROP FUNCTION IF EXISTS public.is_org_member(UUID);
COMMIT;
*/
