-- Scheduled WhatsApp follow-up state for both minimal and full CRM lead schemas.
-- Existing leads are initialized as NEW so they receive the welcome sequence.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;

-- Full CRM installations may use this enum; minimal installations use text status.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'pipeline_stage' AND t.typtype = 'e'
  ) THEN
    ALTER TYPE public.pipeline_stage ADD VALUE IF NOT EXISTS 'COLD';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_followup_due
  ON public.leads (next_followup_at)
  WHERE status = 'CONTACTED' AND opted_out = false;