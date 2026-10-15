ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_normalized TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ;
UPDATE public.leads SET phone_normalized = regexp_replace(phone, '\\D', '', 'g') WHERE phone IS NOT NULL AND phone_normalized IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_org_phone_normalized ON public.leads (organization_id, phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE OR REPLACE FUNCTION public.prevent_duplicate_lead_phone()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.phone_normalized IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.organization_id = NEW.organization_id
      AND l.phone_normalized = NEW.phone_normalized
      AND l.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'duplicate normalized phone number within organization' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$func$;
DROP TRIGGER IF EXISTS prevent_duplicate_lead_phone ON public.leads;
CREATE TRIGGER prevent_duplicate_lead_phone BEFORE INSERT OR UPDATE OF organization_id, phone_normalized ON public.leads FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_lead_phone();
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON public.leads (organization_id, status);
CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE, title TEXT NOT NULL CHECK (length(btrim(title)) > 0), notes TEXT,
  due_at TIMESTAMPTZ NOT NULL, assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_org_due_open ON public.follow_up_tasks (organization_id, due_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_lead ON public.follow_up_tasks (lead_id);
ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant members manage follow up tasks" ON public.follow_up_tasks;
CREATE POLICY "tenant members manage follow up tasks" ON public.follow_up_tasks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_users ou WHERE ou.organization_id = follow_up_tasks.organization_id AND ou.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.organization_users ou WHERE ou.organization_id = follow_up_tasks.organization_id AND ou.user_id = auth.uid()));
