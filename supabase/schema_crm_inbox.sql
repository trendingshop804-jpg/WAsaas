-- ============================================================================
-- NexusLead AI — WhatsApp CRM Inbox Schema Migration
-- Enhances conversations and messages tables with CRM fields & Supabase Realtime
-- ============================================================================

-- 1. Enhance Conversations Table
ALTER TABLE IF EXISTS public.conversations
    ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    ADD COLUMN IF NOT EXISTS internal_notes JSONB DEFAULT '[]'::jsonb;

-- 2. Enhance Messages Table with WhatsApp & Media Support
ALTER TABLE IF EXISTS public.messages
    ADD COLUMN IF NOT EXISTS media_url TEXT,
    ADD COLUMN IF NOT EXISTS media_caption TEXT,
    ADD COLUMN IF NOT EXISTS media_mime_type TEXT,
    ADD COLUMN IF NOT EXISTS file_name TEXT,
    ADD COLUMN IF NOT EXISTS media_size BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
    ADD COLUMN IF NOT EXISTS sender_number TEXT,
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'SENT',
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL;

-- 3. Indexes for fast CRM querying & filtering
CREATE INDEX IF NOT EXISTS idx_conversations_org_assigned ON public.conversations(organization_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_status ON public.conversations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_received_at ON public.messages(received_at);
CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON public.messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_number ON public.messages(sender_number);
CREATE INDEX IF NOT EXISTS idx_messages_media_type ON public.messages(message_type) WHERE message_type != 'text';

-- 4. Enable Supabase Realtime Replication for Instant Two-Way Chat
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignore if already added or not supported in local environment
    NULL;
END $$;
