-- =============================================================================
-- WhatsApp Business Profile Management — Schema Extension
-- Adds: about column to whatsapp_connections, public profile-photos bucket
-- =============================================================================

-- 1. Add 'about' column to whatsapp_connections for caching WhatsApp About text
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS about TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT DEFAULT 'https://wa.me/profile-picture/placeholder';

-- 2. Public storage bucket for profile photo uploads
-- Meta's Media API requires a publicly accessible image_url
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-photos-public', 'profile-photos-public', true, 5242880, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies for profile-photos bucket
-- Public read (Meta needs to fetch), authenticated write
CREATE POLICY "Public read access for profile photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-photos-public');

CREATE POLICY "Authenticated upload for profile photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-photos-public' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update profile photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-photos-public' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated delete profile photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-photos-public' AND auth.uid() IS NOT NULL);

-- 4. Audit logs table (matches backend/schema.sql convention)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action VARCHAR(150) NOT NULL,
  entity VARCHAR(200) NOT NULL,
  actor VARCHAR(150) NOT NULL,
  details TEXT,
  status VARCHAR(50) DEFAULT 'Success',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_time
  ON public.audit_logs(organization_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Org admins can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.users WHERE id = auth.uid() AND role IN ('OWNER', 'ADMIN'))
  );
