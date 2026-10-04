-- Migration: Add increment_unread RPC for atomic unread badge updates
-- Used by api/meta-webhook.js when an inbound message arrives

CREATE OR REPLACE FUNCTION public.increment_unread(conv_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE conversations
  SET unread_count = COALESCE(unread_count, 0) + 1,
      updated_at = now()
  WHERE id = conv_id;
$$;

-- Grant execute to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.increment_unread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_unread(uuid) TO service_role;
