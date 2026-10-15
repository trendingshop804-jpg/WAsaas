-- Additive signup provisioning for the active tenant model.
-- Existing organizations, memberships, and auth users are preserved.
CREATE OR REPLACE FUNCTION public.provision_signup_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  organization_id uuid;
  workspace_name text;
  workspace_slug text;
BEGIN
  -- Invited users are provisioned by the invitation flow, never assigned here.
  IF NEW.raw_user_meta_data ? 'invitation_organization_id' THEN
    RETURN NEW;
  END IF;
  SELECT ou.organization_id INTO organization_id FROM public.organization_users ou WHERE ou.user_id = NEW.id LIMIT 1;
  IF organization_id IS NOT NULL THEN RETURN NEW; END IF;
  workspace_name := nullif(trim(coalesce(NEW.raw_user_meta_data->>'workspace_name', '')), '');
  workspace_name := coalesce(workspace_name, split_part(coalesce(NEW.email, 'My Workspace'), '@', 1) || '''s Workspace');
  workspace_slug := lower(regexp_replace(workspace_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(NEW.id::text, 8);
  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (workspace_name, workspace_slug, NEW.id)
  ON CONFLICT (slug) DO UPDATE SET owner_id = coalesce(public.organizations.owner_id, excluded.owner_id)
  RETURNING id INTO organization_id;
  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (organization_id, NEW.id, 'Owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS on_auth_user_created_provision_organization ON auth.users;
CREATE TRIGGER on_auth_user_created_provision_organization
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.provision_signup_organization();

ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read own membership" ON public.organization_users;
CREATE POLICY "members read own membership" ON public.organization_users
FOR SELECT TO authenticated USING (user_id = auth.uid());
