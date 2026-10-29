-- Deals + appointments persistence and the missing leads.score column.
--
-- Why this migration exists:
--   1. The CRM UI created deals and appointments only in browser memory, so both
--      disappeared on refresh. /api/deals.js and /api/appointments.js now write
--      these records here, and they answer 503 (SCHEMA_NOT_READY) until this
--      migration has been applied.
--   2. api/leads.js historically selected leads.score, a column that only exists
--      in the legacy schema files (supabase_schema.sql) and was never created by
--      any migration. On deployments provisioned from supabase/migrations every
--      leads GET/POST/PATCH failed with "column leads.score does not exist".
--      The API is now schema-tolerant, but this migration restores the column so
--      the full legacy field list works again.

-- 1. Restore the legacy score column on leads (default keeps existing rows valid).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;

-- 2. Deals ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_name TEXT,
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  stage TEXT NOT NULL DEFAULT 'New' CHECK (stage IN ('New','Contacted','Proposal','Negotiation','Won','Lost')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_org_stage ON public.deals (organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_deals_org_created ON public.deals (organization_id, created_at DESC);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant members manage deals" ON public.deals;
CREATE POLICY "tenant members manage deals" ON public.deals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_users ou WHERE ou.organization_id = deals.organization_id AND ou.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_users ou WHERE ou.organization_id = deals.organization_id AND ou.user_id = auth.uid()));

-- 3. Appointments --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  customer_name TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_appointments_org_starts ON public.appointments (organization_id, starts_at);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant members manage appointments" ON public.appointments;
CREATE POLICY "tenant members manage appointments" ON public.appointments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_users ou WHERE ou.organization_id = appointments.organization_id AND ou.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_users ou WHERE ou.organization_id = appointments.organization_id AND ou.user_id = auth.uid()));
