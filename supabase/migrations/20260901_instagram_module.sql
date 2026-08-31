-- ============================================================================
-- WAsaas — Instagram Integration Module Database Schema & Migrations
-- Adds: instagram_comments, instagram_messages, instagram_reply_rules,
--       instagram_dm_rules, instagram_dm_queue, scheduled_posts,
--       and public storage bucket for media containers.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Ensure instagram_connections table exists with proper structure
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

-- 2. Inbound Instagram Comments Table
CREATE TABLE IF NOT EXISTS public.instagram_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    ig_comment_id VARCHAR(100) UNIQUE NOT NULL,
    ig_media_id VARCHAR(100) NOT NULL,
    from_id VARCHAR(100) NOT NULL,
    from_username VARCHAR(100),
    text TEXT NOT NULL,
    parent_id VARCHAR(100),
    comment_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    replied_publicly BOOLEAN DEFAULT FALSE,
    replied_privately BOOLEAN DEFAULT FALSE,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ig_comments_org ON public.instagram_comments(organization_id);
CREATE INDEX IF NOT EXISTS idx_ig_comments_media ON public.instagram_comments(ig_media_id);
CREATE INDEX IF NOT EXISTS idx_ig_comments_created ON public.instagram_comments(created_at DESC);

-- 3. Inbound/Outbound Instagram Direct Messages Table
CREATE TABLE IF NOT EXISTS public.instagram_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    ig_message_id VARCHAR(100) UNIQUE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    sender_id VARCHAR(100) NOT NULL,
    sender_username VARCHAR(100),
    recipient_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    media_url TEXT,
    direction VARCHAR(20) DEFAULT 'inbound', -- 'inbound' | 'outbound'
    is_private_reply BOOLEAN DEFAULT FALSE,
    source_comment_id VARCHAR(100),
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ig_messages_org ON public.instagram_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_ig_messages_sender ON public.instagram_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ig_messages_conv ON public.instagram_messages(conversation_id);

-- 4. Auto-Reply to Comments Rules Table (Keyword Triggered)
CREATE TABLE IF NOT EXISTS public.instagram_reply_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL DEFAULT 'Comment Reply Rule',
    trigger_keyword VARCHAR(255) NOT NULL, -- comma-separated or single keyword
    reply_message TEXT NOT NULL,
    media_id VARCHAR(100), -- Optional: scopes rule to a specific IG post/reel
    match_type VARCHAR(50) DEFAULT 'contains', -- 'contains' | 'exact' | 'regex'
    is_active BOOLEAN DEFAULT TRUE,
    reply_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ig_reply_rules_org ON public.instagram_reply_rules(organization_id);

-- 5. Auto-DM Rules Table (Comment-to-DM Private Reply Trigger)
CREATE TABLE IF NOT EXISTS public.instagram_dm_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL DEFAULT 'Comment-to-DM Rule',
    trigger_keyword VARCHAR(255) NOT NULL,
    dm_message TEXT NOT NULL,
    media_id VARCHAR(100), -- Optional: scopes rule to a specific post
    match_type VARCHAR(50) DEFAULT 'contains',
    is_active BOOLEAN DEFAULT TRUE,
    dm_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ig_dm_rules_org ON public.instagram_dm_rules(organization_id);

-- 6. Paced Auto-DM Queue Table (Enforces Rate-Limiting & Customer-Initiated Constraints)
CREATE TABLE IF NOT EXISTS public.instagram_dm_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.instagram_dm_rules(id) ON DELETE SET NULL,
    comment_id VARCHAR(100) NOT NULL, -- The specific user comment we are privately replying to
    recipient_id VARCHAR(100) NOT NULL,
    recipient_username VARCHAR(100),
    message_text TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'processing' | 'sent' | 'failed'
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    error_message TEXT,
    ig_message_id VARCHAR(100),
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, comment_id) -- One private reply per public comment (Instagram Policy)
);

CREATE INDEX IF NOT EXISTS idx_ig_dm_queue_status ON public.instagram_dm_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ig_dm_queue_org ON public.instagram_dm_queue(organization_id);

-- 7. Post / Reel / Story Scheduled Posts Table
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    media_urls TEXT[] NOT NULL,
    caption TEXT DEFAULT '',
    post_type VARCHAR(50) DEFAULT 'post', -- 'post' | 'reel' | 'story' | 'carousel'
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'processing' | 'published' | 'failed'
    ig_container_id VARCHAR(100),
    ig_post_id VARCHAR(100),
    error_message TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON public.scheduled_posts(status, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_org ON public.scheduled_posts(organization_id);

-- 8. Storage bucket for public Instagram media uploads (needed by Meta Container API)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'instagram-media-public',
    'instagram-media-public',
    true,
    104857600, -- 100 MB max for videos/reels
    ARRAY['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Public read access for instagram media'
    ) THEN
        CREATE POLICY "Public read access for instagram media"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'instagram-media-public');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Authenticated upload for instagram media'
    ) THEN
        CREATE POLICY "Authenticated upload for instagram media"
            ON storage.objects FOR INSERT
            WITH CHECK (bucket_id = 'instagram-media-public' AND auth.uid() IS NOT NULL);
    END IF;
END $$;

-- 9. Row Level Security (RLS) Enablement
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_reply_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_dm_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_dm_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Helper security definer function to avoid recursive RLS checks
CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS TABLE (organization_id UUID) 
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE AS $$
    SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_org_admin(target_org_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.organization_id = target_org_id
          AND u.role IN ('OWNER', 'ADMIN')
    );
$$;

-- RLS Policies using helper functions
-- instagram_connections
CREATE POLICY "Org members view ig connections" ON public.instagram_connections
    FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.current_user_org_ids()));
CREATE POLICY "Org admins manage ig connections" ON public.instagram_connections
    FOR ALL USING (public.current_user_is_org_admin(organization_id));

-- instagram_comments
CREATE POLICY "Org members view ig comments" ON public.instagram_comments
    FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.current_user_org_ids()));
CREATE POLICY "Org admins manage ig comments" ON public.instagram_comments
    FOR ALL USING (public.current_user_is_org_admin(organization_id));

-- instagram_messages
CREATE POLICY "Org members view ig messages" ON public.instagram_messages
    FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.current_user_org_ids()));
CREATE POLICY "Org admins manage ig messages" ON public.instagram_messages
    FOR ALL USING (public.current_user_is_org_admin(organization_id));

-- instagram_reply_rules
CREATE POLICY "Org members view ig reply rules" ON public.instagram_reply_rules
    FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.current_user_org_ids()));
CREATE POLICY "Org admins manage ig reply rules" ON public.instagram_reply_rules
    FOR ALL USING (public.current_user_is_org_admin(organization_id));

-- instagram_dm_rules
CREATE POLICY "Org members view ig dm rules" ON public.instagram_dm_rules
    FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.current_user_org_ids()));
CREATE POLICY "Org admins manage ig dm rules" ON public.instagram_dm_rules
    FOR ALL USING (public.current_user_is_org_admin(organization_id));

-- instagram_dm_queue
CREATE POLICY "Org members view ig dm queue" ON public.instagram_dm_queue
    FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.current_user_org_ids()));
CREATE POLICY "Org admins manage ig dm queue" ON public.instagram_dm_queue
    FOR ALL USING (public.current_user_is_org_admin(organization_id));

-- scheduled_posts
CREATE POLICY "Org members view scheduled posts" ON public.scheduled_posts
    FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.current_user_org_ids()));
CREATE POLICY "Org admins manage scheduled posts" ON public.scheduled_posts
    FOR ALL USING (public.current_user_is_org_admin(organization_id));
