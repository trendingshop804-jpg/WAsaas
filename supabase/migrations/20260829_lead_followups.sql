-- Scheduled WhatsApp follow-up state. The existing pipeline uses uppercase statuses.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS followup_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ;

ALTER TYPE public.pipeline_stage ADD VALUE IF NOT EXISTS 'COLD';

CREATE INDEX IF NOT EXISTS idx_leads_followup_due
  ON public.leads (next_followup_at)
  WHERE status = 'CONTACTED' AND opted_out = false;