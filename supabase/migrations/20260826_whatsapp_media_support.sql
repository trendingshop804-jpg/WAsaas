-- ============================================================================
-- WhatsApp Media Support + Inbound Message Storage — Schema Migration
-- ============================================================================
-- This migration adds ALL columns required by:
--   - api/meta-webhook.js        (INSERT on webhook receive)
--   - api/messages.js            (SELECT for frontend polling)
--   - js/services/whatsapp-service.js (field mapping)
--   - supabase/functions/meta-webhook/index.ts (Edge Function)
--
-- The error "column messages.media_url does not exist" indicates these
-- columns were never added to the live Supabase messages table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add WhatsApp-specific columns to messages table
--    Using ADD COLUMN IF NOT EXISTS so this is safe to run on any state
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.messages
    ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
    ADD COLUMN IF NOT EXISTS sender_number TEXT,
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS direction TEXT,
    ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now();

-- ---------------------------------------------------------------------------
-- 2. Add media columns (some may already exist from schema_crm_inbox.sql)
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.messages
    ADD COLUMN IF NOT EXISTS media_url TEXT,
    ADD COLUMN IF NOT EXISTS media_mime_type TEXT,
    ADD COLUMN IF NOT EXISTS file_name TEXT,
    ADD COLUMN IF NOT EXISTS media_caption TEXT,
    ADD COLUMN IF NOT EXISTS media_size BIGINT DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Migrate existing data: map legacy columns if needed
--    If the table was created with 'body' instead of 'content', copy it
--    If it used 'meta_message_id' instead of 'wa_message_id', copy it
--    If it used 'created_at' instead of 'received_at', copy it
-- ---------------------------------------------------------------------------

UPDATE public.messages
    SET content = body
WHERE content IS NULL AND body IS NOT NULL;

UPDATE public.messages
    SET wa_message_id = meta_message_id
WHERE wa_message_id IS NULL AND meta_message_id IS NOT NULL;

UPDATE public.messages
    SET received_at = created_at
WHERE received_at IS NULL AND created_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Create private storage bucket for WhatsApp media
--    This bucket is NOT public — files require a signed URL (via /api/messages)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  FALSE,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp',
    'audio/mpeg', 'audio/ogg', 'audio/aac',
    'application/pdf', 'application/zip',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'application/msword'
  ]
) ON CONFLICT (id) DO UPDATE
    SET file_size_limit = EXCLUDED.file_size_limit;

-- ---------------------------------------------------------------------------
-- 5. RLS Policies on storage.objects for the whatsapp-media bucket
--    (Storage buckets in Supabase use the storage.objects table for RLS)
-- ---------------------------------------------------------------------------

-- Authenticated users can READ media files (via signed URLs from /api/messages)
CREATE POLICY "Authenticated users can read WhatsApp media"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'whatsapp-media');

-- Service role can INSERT/UPDATE/DELETE (used by webhook handler)
CREATE POLICY "Service role can manage WhatsApp media"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can update WhatsApp media"
ON storage.objects
FOR UPDATE
TO service_role
USING (bucket_id = 'whatsapp-media');

-- ---------------------------------------------------------------------------
-- 6. Indexes for fast querying
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON public.messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_number ON public.messages(sender_number);
CREATE INDEX IF NOT EXISTS idx_messages_received_at ON public.messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_media_url ON public.messages(media_url) WHERE media_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_media_type ON public.messages(message_type) WHERE message_type != 'text';

-- ---------------------------------------------------------------------------
-- 7. Enable Supabase Realtime for the messages table (for live updates)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        PERFORM pg_catalog.pg_replication_origin_advance('supabase_realtime', 0);
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
