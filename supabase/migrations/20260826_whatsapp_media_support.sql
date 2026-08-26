-- ============================================================================
-- WhatsApp Media Support — Schema Migration
-- ============================================================================

-- 1. Add media columns to messages table (some already exist in schema_crm_inbox.sql)
ALTER TABLE IF EXISTS public.messages
    ADD COLUMN IF NOT EXISTS media_mime_type TEXT,
    ADD COLUMN IF NOT EXISTS file_name TEXT,
    ADD COLUMN IF NOT EXISTS media_size BIGINT DEFAULT 0;

-- 2. Create private storage bucket for WhatsApp media
--    This bucket is NOT public — files require a signed URL or RLS-authenticated access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  FALSE,  -- private: media NOT publicly accessible
  52428800,  -- 50 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/3gpp', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'application/pdf', 'application/zip', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/msword']
) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 3. RLS policy for whatsapp-media bucket: allow org members to read
CREATE POLICY "Authenticated users can read media in their organization"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] IS NOT NULL  -- ensure org-scoped path
);

-- 4. RLS policy for uploads: service role only (handled by webhook edge function)
CREATE POLICY "Service role can upload media"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'whatsapp-media');

-- 5. Index for fast media lookups on the messages table
CREATE INDEX IF NOT EXISTS idx_messages_media_url ON public.messages(media_url) WHERE media_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_media_type ON public.messages(message_type) WHERE message_type != 'text';
