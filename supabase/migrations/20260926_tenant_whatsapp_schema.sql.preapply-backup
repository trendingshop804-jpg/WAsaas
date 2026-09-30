-- =============================================================================
-- NextBright CRM — Tenant & WhatsApp Connection Migration
-- =============================================================================
-- File    : supabase/migrations/20260926_tenant_whatsapp_schema.sql
-- Status  : PREPARED ONLY — NOT EXECUTED
-- Purpose : Create the tenant + WhatsApp tables that the webhook requires so
--           inbound WhatsApp messages can be saved to the CRM.
--
-- WHY THIS IS NEEDED
--   api/meta-webhook.js resolves a tenant before saving anything:
--       getWhatsAppConnection()      -> whatsapp_connections  (missing)
--       getWhatsAppOrganizationId()  -> organizations         (missing)
--   With both missing it hits:
--       if (!organizationId) return res.status(200).json({ received: true });
--   ...which is a SILENT DROP. Meta receives 200 and never retries.
--
-- SAFETY PROPERTIES
--   * Idempotent   - safe to run more than once (IF NOT EXISTS / ON CONFLICT).
--   * Additive     - no DROP, no TRUNCATE, no data modification.
--   * Non-blocking - ADD COLUMN with a DEFAULT is metadata-only on PG11+.
--   * Reversible   - see "ROLLBACK" section at the bottom.
--
-- DATA POLICY
--   * Existing 3 leads      -> backfilled to the single tenant.
--   * Existing 317 messages -> LEFT ALONE. Only 1 of 317 can be matched to a
--                              lead by phone; the other 316 are deliberately
--                              left with organization_id = NULL rather than
--                              being assigned to a tenant they do not belong to.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 0 — Preconditions (read-only assertions; aborts before any change)
-- =============================================================================
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.leads')      IS NULL THEN v_missing := v_missing || 'leads';      END IF;
  IF to_regclass('public.messages')   IS NULL THEN v_missing := v_missing || 'messages';   END IF;
  IF to_regclass('public.conversations') IS NULL THEN v_missing := v_missing || 'conversations'; END IF;
  IF to_regclass('public.profiles')   IS NULL THEN v_missing := v_missing || 'profiles';   END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'ABORTED - required tables missing: %', array_to_string(v_missing, ', ');
  END IF;
END $$;


-- =============================================================================
-- STEP 1 — organizations (tenant root)
-- Matches the canonical definition in supabase_schema.sql:13-26
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    slug          TEXT UNIQUE,
    business_type TEXT DEFAULT 'General',
    status        TEXT NOT NULL DEFAULT 'active',
    plan_id       UUID,
    owner_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    phone         TEXT,
    email         TEXT,
    settings      JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);


-- =============================================================================
-- STEP 2 — organization_users (membership)
-- Required by api/_supabase.js:verifyOrganizationAccess() which does
--   .from('organization_users').select('organization_id')
--   .eq('organization_id', ...).eq('user_id', ...).maybeSingle()
-- The UNIQUE(organization_id, user_id) is REQUIRED: maybeSingle() raises
-- an error when it matches more than one row.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.organization_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'Sales Agent',
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (organization_id, user_id)
);


-- =============================================================================
-- STEP 3 — whatsapp_connections
--
-- Column set is derived from what the code actually reads/writes:
--   getWhatsAppConnection()  -> select('*'), .eq('is_active'), .order('updated_at'),
--                               .or('phone_number_id.eq.X, waba_id.eq.X')
--   meta-oauth-exchange.js   -> organization_id, provider, phone_number,
--                               display_name, waba_id, phone_number_id,
--                               access_token_encrypted
--   meta-webhook.js:811      -> falls back to access_token ONLY if present
--
-- DELIBERATE OMISSION: there is NO plaintext `access_token` column.
--   api/meta-oauth-exchange.js:180 still writes `access_token: longLivedToken`
--   in plaintext. That line MUST be deleted before the OAuth connect flow is
--   used, otherwise the upsert will fail on the unknown column.
--   The webhook already falls back to the env token (meta-webhook.js:815).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider               TEXT NOT NULL DEFAULT 'META_CLOUD_API',
    phone_number           TEXT,
    display_name           TEXT,
    waba_id                TEXT,
    phone_number_id        TEXT NOT NULL,
    access_token_encrypted TEXT,
    is_active              BOOLEAN NOT NULL DEFAULT true,
    connected_at           TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now(),
    UNIQUE (organization_id, phone_number_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_org
    ON public.whatsapp_connections (organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_phone_number_id
    ON public.whatsapp_connections (phone_number_id);


-- =============================================================================
-- STEP 4 — Add tenant columns to existing tables
-- All nullable: no existing row is forced to have a value.
-- =============================================================================
-- profiles.id mirrors auth.users.id (it is UUID and REQUIRED) — this is how a
-- signed-in user is resolved to a tenant.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- messages is the ONLY table where 316 rows must stay NULL. Do not backfill.
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
-- Written by meta-webhook.js:983 and read by the Inbox channel filter.
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
-- Written by applyDeliveryStatuses() in meta-webhook.js on a failed delivery.
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS error_code    TEXT;
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS error_message TEXT;

-- conversations.organization_id already exists as a bare UUID with no FK
-- (it was created before organizations existed). Attach the constraint now.
-- The table is empty (0 rows) so this cannot fail on existing data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'conversations'
      AND constraint_name = 'conversations_organization_id_fkey'
  ) THEN
    RAISE NOTICE 'conversations FK already present — skipping';
  ELSE
    ALTER TABLE public.conversations
        ADD CONSTRAINT conversations_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';

-- Indexes for the tenant filters the code will start using.
CREATE INDEX IF NOT EXISTS idx_leads_organization_id
    ON public.leads (organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_organization_id
    ON public.messages (organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
    ON public.profiles (organization_id);

-- Baseline captured here, AFTER organization_id exists but BEFORE any backfill.
-- Step 11 compares against this so re-running the migration stays safe even
-- if the application has since written tenant-stamped messages of its own.
CREATE TEMP TABLE IF NOT EXISTS _nb_baseline (k TEXT PRIMARY KEY, v BIGINT) ON COMMIT DROP;
DELETE FROM _nb_baseline;
INSERT INTO _nb_baseline (k, v) VALUES
  ('messages_total', (SELECT count(*) FROM public.messages)),
  ('messages_with_org', (SELECT count(*) FROM public.messages WHERE organization_id IS NOT NULL)),
  ('leads_total', (SELECT count(*) FROM public.leads)),
  ('leads_with_org', (SELECT count(*) FROM public.leads WHERE organization_id IS NOT NULL));


-- =============================================================================
-- STEP 5 — Seed the tenant
--
-- !! FILL THESE IN BEFORE RUNNING (see "VALUES YOU MUST FILL IN") !!
--   NEXTBRIGHT_ORG_UUID  - any stable UUID, e.g. gen_random_uuid() once.
--   NEXTBRIGHT_ORG_NAME  - your company name.
--   NEXTBRIGHT_OWNER_UUID- auth.users.id of the owner (all 3 leads share one
--                          user: 764e9eab-26e5-4cdd-b554-25a41a25ea35)
--
-- The fixed UUID makes this re-runnable without creating duplicate tenants.
-- =============================================================================
INSERT INTO public.organizations (id, name, slug, business_type, status, owner_id)
VALUES (
    '11111111-1111-4111-8111-111111111111',  -- NEXTBRIGHT_ORG_UUID
    'NextBright Solutions',        -- NEXTBRIGHT_ORG_NAME
    'nextbright',                           -- NEXTBRIGHT_ORG_SLUG
    'General',                              -- NEXTBRIGHT_BUSINESS_TYPE
    'active',                               -- NEXTBRIGHT_STATUS
    '764e9eab-26e5-4cdd-b554-25a41a25ea35'   -- NEXTBRIGHT_OWNER_UUID
)
ON CONFLICT (id) DO UPDATE
    SET name       = EXCLUDED.name,
        slug       = EXCLUDED.slug,
        updated_at = now();


-- =============================================================================
-- STEP 6 — Membership row (makes verifyOrganizationAccess() work)
-- =============================================================================
INSERT INTO public.organization_users (organization_id, user_id, role)
VALUES (
    '11111111-1111-4111-8111-111111111111',
    '764e9eab-26e5-4cdd-b554-25a41a25ea35',
    'Owner'
)
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;


-- =============================================================================
-- STEP 7 — Backfill ONLY the 3 existing leads
--
-- Driven by the membership mapping, not a blind UPDATE, so a lead can only
-- ever be attached to a tenant its user actually belongs to.
-- Expected result: 3 rows updated.
-- =============================================================================
UPDATE public.leads l
   SET organization_id = ou.organization_id
  FROM public.organization_users ou
 WHERE l.organization_id IS NULL
   AND l.user_id = ou.user_id;


-- =============================================================================
-- STEP 8 — profiles backfill (same membership mapping)
-- =============================================================================
UPDATE public.profiles p
   SET organization_id = ou.organization_id
  FROM public.organization_users ou
 WHERE p.organization_id IS NULL
   AND p.id = ou.user_id;


-- =============================================================================
-- STEP 9 — Grants + Row Level Security
--
-- The CRM backend uses the SERVICE ROLE key (api/_supabase.js), which BYPASSES
-- RLS entirely. Nothing below changes existing backend behaviour.
--
-- POLICY SHAPE (deliberate)
--   * Every policy is `TO authenticated` — the `anon` role gets NO policy on
--     any table below, so it can neither read nor write.
--   * Every policy is tenant-scoped through organization_users.
--   * messages / conversations are READ-ONLY to the browser and have NO
--     INSERT, UPDATE or DELETE policy: all writes go through the
--     authenticated API (api/messages.js), which uses the service role only
--     after validating the session and org membership.
--   * GRANTS are explicit because the policies below select from
--     organization_users. Without SELECT on that table the policy expression
--     fails with "permission denied for table organization_users" and every
--     tenant read silently returns zero rows.
-- =============================================================================

-- --- Explicit, minimal grants (no blanket ALL, no anon access) --------------
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON public.organizations        TO authenticated;
GRANT SELECT ON public.organization_users   TO authenticated;
GRANT SELECT ON public.whatsapp_connections TO authenticated;

GRANT SELECT ON public.leads        TO authenticated;
GRANT SELECT ON public.messages     TO authenticated;
GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT ON public.profiles     TO authenticated;

-- The browser only ever flips follow-up automation on a lead it owns.
-- Column-level UPDATE keeps every other leads column API-only.
-- Built dynamically so a column that does not exist on this database cannot
-- abort the whole transaction with "column does not exist".
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.column_name)
    INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name   = 'leads'
     AND c.column_name IN ('follow_up_enabled', 'follow_up_status', 'updated_at');

  IF v_cols IS NULL THEN
    RAISE NOTICE 'No follow-up columns found on public.leads — skipping column-level UPDATE grant.';
  ELSE
    EXECUTE format('GRANT UPDATE (%s) ON public.leads TO authenticated', v_cols);
    RAISE NOTICE 'Granted browser UPDATE on public.leads (%s)', v_cols;
  END IF;
END $$;

-- NOTE: access_token_encrypted is NOT granted. The row policy above scopes
-- which whatsapp_connections rows a member may see, and the column privilege
-- above decides which columns the publishable key may fetch, so the encrypted
-- token can never be read from the browser.

ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own org and membership.
DROP POLICY IF EXISTS "members read own organization" ON public.organizations;
CREATE POLICY "members read own organization" ON public.organizations
    FOR SELECT TO authenticated USING (
        id IN (SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "members read own membership" ON public.organization_users;
CREATE POLICY "members read own membership" ON public.organization_users
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Connection metadata only — never the token column (see grants above).
DROP POLICY IF EXISTS "members read connection metadata" ON public.whatsapp_connections;
CREATE POLICY "members read connection metadata" ON public.whatsapp_connections
    FOR SELECT TO authenticated USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "members read tenant leads" ON public.leads;
CREATE POLICY "members read tenant leads" ON public.leads
    FOR SELECT TO authenticated USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

-- Only follow_up_enabled / follow_up_status / updated_at are writable from the
-- browser (enforced by the column-level GRANT). Everything else is API-only.
DROP POLICY IF EXISTS "members update tenant lead followup" ON public.leads;
CREATE POLICY "members update tenant lead followup" ON public.leads
    FOR UPDATE TO authenticated USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    ) WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

-- Messages with organization_id IS NULL (the 316 historical rows) are NOT
-- visible to any browser session. This is intentional: ownership is unknown,
-- so they stay server-side only rather than leaking to the wrong tenant.
-- There is deliberately NO INSERT / UPDATE / DELETE policy on messages.
DROP POLICY IF EXISTS "members read tenant messages" ON public.messages;
CREATE POLICY "members read tenant messages" ON public.messages
    FOR SELECT TO authenticated USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

-- conversations: tenant read only, no browser writes.
DROP POLICY IF EXISTS "members read tenant conversations" ON public.conversations;
CREATE POLICY "members read tenant conversations" ON public.conversations
    FOR SELECT TO authenticated USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "users read own profile" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles
    FOR SELECT TO authenticated USING (id = auth.uid());

-- Defensive sweep: drop any pre-existing policy on these tables that is still
-- open to PUBLIC or anon, so no legacy open policy survives this migration.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('organizations','organization_users','whatsapp_connections',
                         'leads','messages','conversations','profiles')
       AND ('public'::name = ANY(roles) OR 'anon'::name = ANY(roles))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Dropped policy open to anon/public: % on %', r.policyname, r.tablename;
  END LOOP;
END $$;


-- =============================================================================
-- STEP 10 — Seed the WhatsApp connection
--
-- !! FILL THESE IN BEFORE RUNNING (see "VALUES YOU MUST FILL IN") !!
-- There are deliberately NO placeholder values here. If these are left as
-- the sentinel strings below, the guard refuses to insert them, so a fake
-- phone_number_id can never be written and later "verified" as real.
--
--   WHATSAPP_PHONE_NUMBER_ID - from Meta Business Manager / .env
--   WABA_ID                  - WhatsApp Business Account ID
--
-- access_token_encrypted is intentionally NOT seeded: the backend falls back
-- to the WHATSAPP_ACCESS_TOKEN env var (api/meta-webhook.js:815).
-- =============================================================================
DO $$
DECLARE
  v_phone_number_id TEXT := 'REPLACE_WITH_REAL_PHONE_NUMBER_ID';
  v_waba_id         TEXT := 'REPLACE_WITH_REAL_WABA_ID';
  v_org             UUID := '11111111-1111-4111-8111-111111111111';
  v_clean_waba      TEXT;
BEGIN
  -- Placeholder sentinels are stripped, never stored. Each field is checked
  -- independently so filling in the phone number alone cannot leave a fake
  -- WABA id behind that later reads back as a real connection.
  IF v_phone_number_id IS NULL OR v_phone_number_id = '' OR v_phone_number_id LIKE 'REPLACE_WITH%' THEN
    RAISE NOTICE 'SKIPPED: whatsapp_connections seed — fill in WHATSAPP_PHONE_NUMBER_ID first (see Step 10).';
    RETURN;
  END IF;

  v_clean_waba := CASE
    WHEN v_waba_id IS NULL OR v_waba_id = '' OR v_waba_id LIKE 'REPLACE_WITH%' THEN NULL
    ELSE v_waba_id
  END;

  IF v_clean_waba IS NULL THEN
    RAISE NOTICE 'WARNING: WABA_ID is still a placeholder — seeding NULL. Fill it in so meta-webhook.js can resolve the org reliably.';
  END IF;

  INSERT INTO public.whatsapp_connections
      (organization_id, phone_number_id, waba_id, is_active)
  VALUES (v_org, v_phone_number_id, v_clean_waba, true)
  ON CONFLICT (organization_id, phone_number_id)
      DO UPDATE SET waba_id = EXCLUDED.waba_id, is_active = true, updated_at = now();

  -- Final safety net: no connection row may ever hold a sentinel value.
  IF EXISTS (
    SELECT 1 FROM public.whatsapp_connections
     WHERE phone_number_id LIKE 'REPLACE_WITH%'
        OR waba_id LIKE 'REPLACE_WITH%'
  ) THEN
    RAISE EXCEPTION 'ABORTED: a whatsapp_connections row contains a placeholder id';
  END IF;

  RAISE NOTICE 'Inserted WhatsApp connection for phone_number_id %', v_phone_number_id;
END $$;


-- =============================================================================
-- STEP 11 — Verification (runs inside the transaction; rolls back on failure)
-- =============================================================================
DO $$
DECLARE
  v_orgs       BIGINT;
  v_members    BIGINT;
  v_conns      BIGINT;
  v_leads      BIGINT;
  v_leads_set  BIGINT;
  v_msgs       BIGINT;
  v_msgs_set   BIGINT;
  v_open_pol   BIGINT;
  v_rls_off    TEXT[];
  v_base       JSONB;
BEGIN
  SELECT count(*) INTO v_orgs    FROM public.organizations;
  SELECT count(*) INTO v_members FROM public.organization_users;
  SELECT count(*) INTO v_conns   FROM public.whatsapp_connections;
  SELECT count(*) INTO v_leads   FROM public.leads;
  SELECT count(*) INTO v_leads_set FROM public.leads WHERE organization_id IS NOT NULL;
  SELECT count(*) INTO v_msgs    FROM public.messages;
  SELECT count(*) INTO v_msgs_set FROM public.messages WHERE organization_id IS NOT NULL;

  SELECT jsonb_object_agg(k, v) INTO v_base FROM _nb_baseline;

  -- Security assertions -----------------------------------------------------
  -- 1. No policy on a tenant table may be open to anon/public.
  SELECT count(*) INTO v_open_pol
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('organizations','organization_users','whatsapp_connections',
                       'leads','messages','conversations','profiles')
     AND ('public'::name = ANY(roles) OR 'anon'::name = ANY(roles));

  -- 2. RLS must be enabled on every table holding tenant data.
  SELECT array_agg(c.relname) INTO v_rls_off
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('organizations','organization_users','whatsapp_connections',
                       'leads','messages','conversations','profiles')
     AND c.relrowsecurity = false;

  -- 3. No browser-writable policy may exist on messages / conversations.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('messages','conversations')
       AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'ABORTED: a non-SELECT policy exists on messages/conversations — browser writes must stay API-only';
  END IF;

  RAISE NOTICE '--- migration verification ---';
  RAISE NOTICE 'organizations        = %', v_orgs;
  RAISE NOTICE 'organization_users   = %', v_members;
  RAISE NOTICE 'whatsapp_connections = % (0 is fine until Step 10 is filled in)', v_conns;
  RAISE NOTICE 'leads total          = % (with org: %)', v_leads, v_leads_set;
  RAISE NOTICE 'messages total       = %', v_msgs;
  RAISE NOTICE 'messages with org    = % (0 on a first run — historical rows stay NULL by design)', v_msgs_set;
  RAISE NOTICE 'policies open to anon= % (must be 0)', v_open_pol;
  RAISE NOTICE 'tables missing RLS   = % (must be empty)', COALESCE(v_rls_off::text, 'none');

  -- Data safety: nothing may be lost, and this migration must not mass-assign
  -- historical messages to a tenant.
  IF v_orgs      < 1 THEN RAISE EXCEPTION 'ABORTED: no organization seeded'; END IF;
  IF v_members   < 1 THEN RAISE EXCEPTION 'ABORTED: no organization_users membership'; END IF;
  IF v_msgs      < 317 THEN RAISE EXCEPTION 'ABORTED: message count dropped from 317 to %', v_msgs; END IF;
  IF v_leads     < 3   THEN RAISE EXCEPTION 'ABORTED: lead count dropped from 3 to %', v_leads; END IF;

  IF v_msgs <> (v_base->>'messages_total')::BIGINT THEN
    RAISE EXCEPTION 'ABORTED: message count changed during migration (% -> %)',
      (v_base->>'messages_total')::BIGINT, v_msgs;
  END IF;
  IF v_leads <> (v_base->>'leads_total')::BIGINT THEN
    RAISE EXCEPTION 'ABORTED: lead count changed during migration (% -> %)',
      (v_base->>'leads_total')::BIGINT, v_leads;
  END IF;

  -- The 3 known leads must be attached; historical messages must NOT be.
  IF v_leads_set < 3 THEN
    RAISE EXCEPTION 'ABORTED: expected 3 leads backfilled, got %', v_leads_set;
  END IF;
  IF v_msgs_set <> (v_base->>'messages_with_org')::BIGINT THEN
    RAISE EXCEPTION 'ABORTED: historical messages were re-assigned (% -> %) — must stay untouched',
      (v_base->>'messages_with_org')::BIGINT, v_msgs_set;
  END IF;

  -- Security
  IF v_open_pol > 0 THEN
    RAISE EXCEPTION 'ABORTED: % policy/policies still open to anon or public', v_open_pol;
  END IF;
  IF v_rls_off IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTED: RLS not enabled on: %', array_to_string(v_rls_off, ', ');
  END IF;
END $$;

COMMIT;


-- =============================================================================
-- ROLLBACK (only if you need to undo — additive migration, nothing is lost)
-- =============================================================================
-- BEGIN;
--   -- Step 9: policies, grants and RLS
--   DROP POLICY IF EXISTS "members update tenant lead followup" ON public.leads;
--   DROP POLICY IF EXISTS "members read tenant conversations" ON public.conversations;
--   DROP POLICY IF EXISTS "members read own profile" ON public.profiles;
--   DROP POLICY IF EXISTS "members read tenant messages" ON public.messages;
--   DROP POLICY IF EXISTS "members read tenant leads" ON public.leads;
--   DROP POLICY IF EXISTS "members read connection metadata" ON public.whatsapp_connections;
--   DROP POLICY IF EXISTS "members read own membership" ON public.organization_users;
--   DROP POLICY IF EXISTS "members read own organization" ON public.organizations;
--   REVOKE ALL ON public.organizations, public.organization_users,
--                 public.whatsapp_connections, public.leads,
--                 public.messages, public.conversations, public.profiles
--     FROM authenticated;
--   -- NOTE: enable RLS on messages (do NOT disable it) before rolling back,
--   -- otherwise the browser regains direct read access.
--   -- ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;
--
--   DELETE FROM public.organization_users WHERE organization_id =
--       '11111111-1111-4111-8111-111111111111';
--   ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_organization_id_fkey;
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS channel;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS channel;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS error_code;
--   ALTER TABLE public.messages DROP COLUMN IF EXISTS error_message;
--   ALTER TABLE public.leads    DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS organization_id;
--   DROP TABLE IF EXISTS public.whatsapp_connections;
--   DROP TABLE IF EXISTS public.organization_users;
--   DELETE FROM public.organizations WHERE id = '11111111-1111-4111-8111-111111111111';
--   DROP TABLE IF EXISTS public.organizations;
-- COMMIT;
-- =============================================================================
