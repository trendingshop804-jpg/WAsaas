-- 20261001_twilio_connections.sql
--
-- Purpose
--   Store per-organization Twilio Voice credentials so an operator can configure
--   Twilio from inside the app instead of only through deployment environment
--   variables. Until now the Integrations form saved every field to browser
--   localStorage, so the server never saw the values and the status badge stayed
--   "Twilio Voice is not configured on the server" forever.
--
-- Design notes
--   * The auth token is NEVER stored in plain text. It is written as
--     AES-GCM ciphertext via api/_crypto.js encryptToken(), exactly like
--     whatsapp_connections.access_token_encrypted and
--     instagram_connections.access_token_encrypted.
--   * account_sid is not a secret (it appears in the Twilio console and in
--     request URLs), so it is stored readable. from_number / region are not
--     secrets either.
--   * One active connection per organization per account, enforced by UNIQUE.
--   * Purely additive: creates a new table, touches no existing table or row.
--
-- RLS
--   * No policy for anon, so the browser anon key can never read this table.
--   * Members of the owning organization may read the row so the Integrations UI
--     can show which account is connected (and the auth token is not selected
--     by any read path that reaches the client).
--   * Only OWNER / ADMIN members may write. api/integration-status.js additionally
--     re-checks the role through requireOrgAccess() before issuing any write.

CREATE TABLE IF NOT EXISTS public.twilio_connections (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    account_sid          TEXT NOT NULL,
    auth_token_encrypted TEXT,
    from_number          TEXT,
    region               TEXT NOT NULL DEFAULT 'US1',
    is_active            BOOLEAN NOT NULL DEFAULT true,
    connected_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    connected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT twilio_connections_account_sid_format CHECK (account_sid ~ '^AC[0-9a-fA-F]{32}$'),
    CONSTRAINT twilio_connections_region_known CHECK (region IN ('US1', 'IE1', 'IN1', 'AU1', 'JP1', 'BR1', 'DE1', 'SG1')),
    UNIQUE (organization_id, account_sid)
);

CREATE INDEX IF NOT EXISTS idx_twilio_connections_org
    ON public.twilio_connections (organization_id);

CREATE INDEX IF NOT EXISTS idx_twilio_connections_active
    ON public.twilio_connections (organization_id, is_active);

ALTER TABLE public.twilio_connections ENABLE ROW LEVEL SECURITY;

-- Read: any member of the owning organization. Deliberately exposes ciphertext
-- only; no code path returns auth_token_encrypted to a browser.
DROP POLICY IF EXISTS "members read twilio connection" ON public.twilio_connections;
CREATE POLICY "members read twilio connection" ON public.twilio_connections
    FOR SELECT TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

-- Write: OWNER / ADMIN of the owning organization only.
DROP POLICY IF EXISTS "admins manage twilio connection" ON public.twilio_connections;
CREATE POLICY "admins manage twilio connection" ON public.twilio_connections
    FOR ALL TO authenticated
    USING (
        organization_id IN (
            SELECT ou.organization_id
            FROM public.organization_users ou
            WHERE ou.user_id = auth.uid()
              AND ou.role IN ('OWNER', 'ADMIN')
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT ou.organization_id
            FROM public.organization_users ou
            WHERE ou.user_id = auth.uid()
              AND ou.role IN ('OWNER', 'ADMIN')
        )
    );
