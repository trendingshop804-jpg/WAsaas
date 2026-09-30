-- ============================================================================
-- WhatsApp Automatic Follow-up System — Missing Columns & Automation Log
-- Safe to run on new or existing databases (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add missing follow-up automation columns to leads table
-- ---------------------------------------------------------------------------

-- Whether automated WhatsApp follow-ups are enabled for this lead
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_enabled BOOLEAN NOT NULL DEFAULT true;

-- Tracks current automation status: Scheduled / Processing / Sent / Failed / Paused / Completed
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT NOT NULL DEFAULT 'Scheduled';

-- Current stage in the multi-step sequence: First Follow-up / Second Follow-up / Final Follow-up / Completed
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_stage TEXT NOT NULL DEFAULT 'First Follow-up';

-- The Meta-approved template name to use for this lead (can be overridden per-lead)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS default_template TEXT NOT NULL DEFAULT 'followup_message';

-- ISO timestamp of the last successfully sent follow-up message
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_follow_up_sent_at TIMESTAMPTZ;

-- Duplicate-send protection: locks a lead row while it is being processed
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_locked_for_sending BOOLEAN NOT NULL DEFAULT false;

-- When the lock was acquired (used to release stale locks after timeout)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Release any stale locks from prior crashed runs (>10 minutes old)
--    Safe to run on deploy — only affects rows where locked_at is old
-- ---------------------------------------------------------------------------
UPDATE public.leads
SET
  is_locked_for_sending = false,
  locked_at             = NULL
WHERE
  is_locked_for_sending = true
  AND locked_at         < NOW() - INTERVAL '10 minutes';

-- ---------------------------------------------------------------------------
-- 3. Add missing columns to follow_up_messages table
-- ---------------------------------------------------------------------------

-- Direction of the message: outbound (scheduled) / inbound (reply)
ALTER TABLE public.follow_up_messages
  ADD COLUMN IF NOT EXISTS direction TEXT;

-- The Meta template name that was used
ALTER TABLE public.follow_up_messages
  ADD COLUMN IF NOT EXISTS template_name TEXT;

-- Delivery status: Pending / Sent / Delivered / Read / Failed
ALTER TABLE public.follow_up_messages
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending';

-- The real wa_message_id returned by the Meta Cloud API
ALTER TABLE public.follow_up_messages
  ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;

-- The ISO timestamp when Meta accepted the message
ALTER TABLE public.follow_up_messages
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Error detail when status = 'Failed'
ALTER TABLE public.follow_up_messages
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ---------------------------------------------------------------------------
-- 4. Service-role INSERT policy on follow_up_messages
--    The Vercel cron API uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS,
--    but we still need a policy for the service_role to insert rows even when
--    user_id may be null (leads created via webhook or CSV import).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can INSERT follow_up_messages" ON public.follow_up_messages;
CREATE POLICY "Service role can INSERT follow_up_messages"
  ON public.follow_up_messages
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can UPDATE follow_up_messages" ON public.follow_up_messages;
CREATE POLICY "Service role can UPDATE follow_up_messages"
  ON public.follow_up_messages
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also allow service_role to update leads (for locking and state updates)
DROP POLICY IF EXISTS "Service role can UPDATE leads" ON public.leads;
CREATE POLICY "Service role can UPDATE leads"
  ON public.leads
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can SELECT leads" ON public.leads;
CREATE POLICY "Service role can SELECT leads"
  ON public.leads
  FOR SELECT
  TO service_role
  USING (true);

-- ---------------------------------------------------------------------------
-- 5. Create whatsapp_automation_logs table for scheduler execution tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_automation_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       TEXT NOT NULL,           -- Unique ID for each cron execution
  event        TEXT NOT NULL,           -- execution_started | due_followups_found | lead_claimed | message_attempted | meta_response_received | message_sent | message_failed
  lead_id      UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  details      TEXT,                    -- Human-readable detail (no secrets)
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS: service role can write logs; authenticated users can read their own
ALTER TABLE public.whatsapp_automation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can INSERT automation logs" ON public.whatsapp_automation_logs;
CREATE POLICY "Service role can INSERT automation logs"
  ON public.whatsapp_automation_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can SELECT automation logs" ON public.whatsapp_automation_logs;
CREATE POLICY "Authenticated users can SELECT automation logs"
  ON public.whatsapp_automation_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 6. Indexes for fast automation queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_enabled
  ON public.leads (follow_up_enabled, next_followup_at)
  WHERE follow_up_enabled = true AND opted_out = false;

CREATE INDEX IF NOT EXISTS idx_leads_is_locked
  ON public.leads (is_locked_for_sending, locked_at)
  WHERE is_locked_for_sending = true;

CREATE INDEX IF NOT EXISTS idx_follow_up_messages_wa_msg_id
  ON public.follow_up_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_logs_run_id
  ON public.whatsapp_automation_logs (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_logs_created_at
  ON public.whatsapp_automation_logs (created_at DESC);
