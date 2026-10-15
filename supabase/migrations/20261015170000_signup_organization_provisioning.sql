-- Additive, idempotent extension of the EXISTING on_auth_user_created trigger.
-- It preserves all existing rows and never selects a default/first organization.
CREATE OR REPLACE FUNCTION public.handle_new_user()
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
  INSERT INTO public.profiles (id, name, email, phone, role, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email, NEW.raw_user_meta_data->>'phone', 'customer', 'active')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();

  -- Invitation flows must insert their authorized membership separately.
  IF NEW.raw_user_meta_data ? 'invitation_organization_id' THEN RETURN NEW; END IF;
  SELECT ou.organization_id INTO organization_id FROM public.organization_users ou WHERE ou.user_id = NEW.id LIMIT 1;
  IF organization_id IS NOT NULL THEN RETURN NEW; END IF;

  workspace_name := coalesce(nullif(trim(NEW.raw_user_meta_data->>'workspace_name'), ''), split_part(NEW.email, '@', 1) || '''s Workspace');
  workspace_slug := lower(regexp_replace(workspace_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(NEW.id::text, 8);
  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (workspace_name, workspace_slug, NEW.id)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO organization_id;
  IF organization_id IS NULL THEN
    SELECT id INTO organization_id
    FROM public.organizations
    WHERE slug = workspace_slug AND owner_id = NEW.id;
    IF organization_id IS NULL THEN
      RAISE EXCEPTION 'Refusing to reuse an organization with a colliding signup slug';
    END IF;
  END IF;
  INSERT INTO public.organization_users (organization_id, user_id, role)
  VALUES (organization_id, NEW.id, 'Owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;
-- Existing trigger already calls handle_new_user(); no additional trigger is created.
