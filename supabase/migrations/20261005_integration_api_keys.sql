-- Secure, tenant-scoped credentials for any CRM or software integration and
-- platform API keys used by third-party systems to call NexusLead.

CREATE TABLE IF NOT EXISTS public.external_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    base_url TEXT,
    api_key_encrypted TEXT NOT NULL,
    api_key_hint TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_external_integrations_organization
    ON public.external_integrations (organization_id);

CREATE TABLE IF NOT EXISTS public.organization_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_organization_api_keys_active
    ON public.organization_api_keys (organization_id, revoked_at)
    WHERE revoked_at IS NULL;

ALTER TABLE public.external_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;

-- Secrets are never queried through the Data API. The application uses its
-- server-side service-role client and returns metadata only.
REVOKE ALL ON TABLE public.external_integrations FROM anon, authenticated;
REVOKE ALL ON TABLE public.organization_api_keys FROM anon, authenticated;
