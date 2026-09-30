-- Opt-out compliance audit trail
-- Records the exact timestamp a lead requested opt-out for legal/regulatory evidence.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;
