-- =============================================================================
-- NextBright CRM / NexusLead AI — Restore Orphaned Messages & Link Leads
-- =============================================================================
-- File    : supabase/migrations/20261004_restore_orphaned_messages.sql
-- Purpose : Restores historical messages with NULL organization_id so they
--           appear in the Messages inbox, links them to leads, and associates
--           unmatched message senders with the primary organization.
-- =============================================================================

BEGIN;

-- Helper function to normalize phone numbers for matching
CREATE OR REPLACE FUNCTION public.clean_digits(val TEXT)
RETURNS TEXT AS $$
BEGIN
  IF val IS NULL THEN RETURN ''; END IF;
  RETURN regexp_replace(val, '\D', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1. If leads have NULL organization_id, assign them to the primary organization
DO $$
DECLARE
  v_primary_org_id UUID;
  v_updated_leads INT := 0;
  v_updated_msgs INT := 0;
  v_updated_convs INT := 0;
BEGIN
  SELECT id INTO v_primary_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
  
  IF v_primary_org_id IS NOT NULL THEN
    -- Update leads with NULL organization_id
    UPDATE public.leads
    SET organization_id = v_primary_org_id
    WHERE organization_id IS NULL;
    GET DIAGNOSTICS v_updated_leads = ROW_COUNT;

    -- Update conversations with NULL organization_id
    IF to_regclass('public.conversations') IS NOT NULL THEN
      UPDATE public.conversations
      SET organization_id = v_primary_org_id
      WHERE organization_id IS NULL;
      GET DIAGNOSTICS v_updated_convs = ROW_COUNT;
    END IF;

    -- Step A: Update messages that can be matched to an existing lead's organization
    UPDATE public.messages m
    SET organization_id = l.organization_id,
        lead_id = COALESCE(m.lead_id, l.id)
    FROM public.leads l
    WHERE m.organization_id IS NULL
      AND (
        (public.clean_digits(m.sender_number) = public.clean_digits(l.phone) AND length(public.clean_digits(m.sender_number)) >= 7)
        OR (length(public.clean_digits(m.sender_number)) = 10 AND public.clean_digits(l.phone) = '91' || public.clean_digits(m.sender_number))
        OR (length(public.clean_digits(l.phone)) = 10 AND public.clean_digits(m.sender_number) = '91' || public.clean_digits(l.phone))
      );

    -- Step B: For remaining messages with NULL organization_id, assign to primary org
    UPDATE public.messages
    SET organization_id = v_primary_org_id
    WHERE organization_id IS NULL;
    GET DIAGNOSTICS v_updated_msgs = ROW_COUNT;

    -- Step C: Backfill lead_id for messages that don't have lead_id linked
    UPDATE public.messages m
    SET lead_id = l.id
    FROM public.leads l
    WHERE m.lead_id IS NULL
      AND m.organization_id = l.organization_id
      AND (
        (public.clean_digits(m.sender_number) = public.clean_digits(l.phone) AND length(public.clean_digits(m.sender_number)) >= 7)
        OR (length(public.clean_digits(m.sender_number)) = 10 AND public.clean_digits(l.phone) = '91' || public.clean_digits(m.sender_number))
        OR (length(public.clean_digits(l.phone)) = 10 AND public.clean_digits(m.sender_number) = '91' || public.clean_digits(l.phone))
      );

    RAISE NOTICE 'Restoration completed: % leads updated, % messages updated, % conversations updated.',
      v_updated_leads, v_updated_msgs, v_updated_convs;
  ELSE
    RAISE NOTICE 'No organization found in public.organizations. Please create an organization first.';
  END IF;
END $$;

COMMIT;
