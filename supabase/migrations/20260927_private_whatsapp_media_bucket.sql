-- =============================================================================
-- 20260927_private_whatsapp_media_bucket.sql
-- =============================================================================
-- Status : PREPARED FOR REVIEW — NOT APPLIED. DO NOT RUN `supabase db push`
--           until this file has been reviewed and you have confirmed that no
--           <img src> or other consumer depends on a PUBLIC media URL.
-- Purpose : Make the `whatsapp-media` storage bucket PRIVATE and replace the
--           world-readable storage policy with a tenant/authenticated-scoped one.
--
-- WHY
--   The 20260826 migration created this bucket with `public = TRUE` plus
--   `CREATE POLICY "Public can read WhatsApp media" ... TO public`. That means
--   every customer attachment (photos, voice notes, PDFs, spreadsheets) is
--   readable by anyone who can guess or enumerate the object path.
--
--   This is already inconsistent with the application: api/messages.js issues
--   24-hour SIGNED URLs, which only makes sense for a private bucket.
--
-- WHAT THIS CHANGES
--   1. storage.buckets.public -> false for 'whatsapp-media'
--   2. drops the `TO public` read policy on storage.objects
--   3. adds an `authenticated`-scoped read policy so signed-in tenant users can
--      still read their own media through the API
--
-- SAFETY
--   * Idempotent (IF EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE).
--   * Touches NO application table and NO customer row.
--   * Reversible - see ROLLBACK at the bottom.
--   * Does NOT delete any stored object.
--
-- BEFORE YOU APPLY
--   Confirm nothing renders media via a bare public URL. api/messages.js
--   already returns signed URLs, so it is compatible. Grep the frontend for
--   getPublicUrl / direct storage URLs first.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Make the bucket private
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
   SET public = false
 WHERE id = 'whatsapp-media'
   AND public IS DISTINCT FROM false;

-- -----------------------------------------------------------------------------
-- 2. Remove world-readable access to objects in this bucket
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read WhatsApp media" ON storage.objects;

-- Belt and braces: drop any other public/anonymous policy on this bucket.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND ('public'::name = ANY(roles) OR 'anon'::name = ANY(roles))
       AND policyname NOT LIKE '%WhatsApp media (authenticated)%'
  LOOP
    -- only remove policies that reference this bucket
    IF EXISTS (
      SELECT 1 FROM pg_policies p2
       WHERE p2.schemaname='storage' AND p2.tablename='objects'
         AND p2.policyname = r.policyname
         AND p2.qual LIKE '%whatsapp-media%'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
      RAISE NOTICE 'Dropped public policy on whatsapp-media: %', r.policyname;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Authenticated-scoped read for this bucket
--    Signed-in users may read objects in this bucket. Row-level tenant
--    enforcement for media is done in api/messages.js, which only ever signs
--    URLs for rows the caller's organization owns.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant members can read WhatsApp media (authenticated)" ON storage.objects;

CREATE POLICY "Tenant members can read WhatsApp media (authenticated)"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'whatsapp-media');

-- -----------------------------------------------------------------------------
-- Verification (runs inside the transaction; rolls back on failure)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_public BOOLEAN;
  v_open   BIGINT;
BEGIN
  SELECT public INTO v_public FROM storage.buckets WHERE id = 'whatsapp-media';
  RAISE NOTICE 'whatsapp-media bucket public = % (expected false)', v_public;

  SELECT count(*) INTO v_open
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND ('public'::name = ANY(roles) OR 'anon'::name = ANY(roles))
     AND policyname = 'Public can read WhatsApp media';

  IF v_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ABORTED: whatsapp-media bucket is still public';
  END IF;
  IF v_open > 0 THEN
    RAISE EXCEPTION 'ABORTED: a public read policy on whatsapp-media still exists';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (make it public again)
--   BEGIN;
--     DROP POLICY IF EXISTS "Tenant members can read WhatsApp media (authenticated)"
--       ON storage.objects;
--     CREATE POLICY "Public can read WhatsApp media" ON storage.objects
--       FOR SELECT TO public USING (bucket_id = 'whatsapp-media');
--     UPDATE storage.buckets SET public = true WHERE id = 'whatsapp-media';
--   COMMIT;
-- =============================================================================
