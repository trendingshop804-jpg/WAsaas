-- Persist each organization's encrypted Instagram Business connection.
-- The API writes this table with the service-role key; browser sessions may
-- read connection metadata only, never the encrypted access token.

CREATE TABLE IF NOT EXISTS public.instagram_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    instagram_business_id TEXT NOT NULL,
    instagram_username TEXT,
    page_id TEXT,
    access_token_encrypted TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, instagram_business_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_connections_active_org
    ON public.instagram_connections (organization_id)
    WHERE is_active;

ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.instagram_connections FROM anon, authenticated;
GRANT SELECT (
    id,
    organization_id,
    instagram_business_id,
    instagram_username,
    page_id,
    is_active,
    connected_at,
    updated_at
) ON TABLE public.instagram_connections TO authenticated;

DROP POLICY IF EXISTS "members read instagram connection metadata" ON public.instagram_connections;
CREATE POLICY "members read instagram connection metadata"
    ON public.instagram_connections
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.organization_users
            WHERE user_id = (SELECT auth.uid())
        )
    );
