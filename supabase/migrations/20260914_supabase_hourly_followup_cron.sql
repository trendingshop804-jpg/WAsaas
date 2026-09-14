-- ============================================================================
-- Supabase Server-Side Hourly Scheduler for Daily Follow-up Automation
-- Replaces Vercel Hobby-restricted hourly cron with Supabase pg_cron + pg_net
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enable required PostgreSQL extensions in extensions schema
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant permissions to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
GRANT USAGE ON SCHEMA net TO postgres;

-- ---------------------------------------------------------------------------
-- 2. Configuration storage for scheduler endpoint & secrets
--    Protected by RLS: secrets are NEVER accessible to anon or authenticated users.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_scheduler_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    api_url TEXT NOT NULL DEFAULT 'https://your-vercel-app.vercel.app',
    cron_secret TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    last_http_request_id BIGINT,
    last_status TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row-Level Security
ALTER TABLE public.automation_scheduler_config ENABLE ROW LEVEL SECURITY;

-- Revoke all direct client-side access (never expose secrets in frontend)
REVOKE ALL ON TABLE public.automation_scheduler_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.automation_scheduler_config TO postgres, service_role;

-- Initialize default configuration row if not already present
INSERT INTO public.automation_scheduler_config (id, api_url, cron_secret, is_active)
VALUES ('default', 'https://your-vercel-app.vercel.app', '', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Secure Admin Function to Update Scheduler Configuration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_automation_scheduler_config(
    p_api_url TEXT,
    p_cron_secret TEXT,
    p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_clean_url TEXT;
BEGIN
    v_clean_url := RTRIM(TRIM(p_api_url), '/');
    
    INSERT INTO public.automation_scheduler_config (
        id,
        api_url,
        cron_secret,
        is_active,
        updated_at
    ) VALUES (
        'default',
        v_clean_url,
        TRIM(p_cron_secret),
        p_is_active,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        api_url = EXCLUDED.api_url,
        cron_secret = CASE 
            WHEN EXCLUDED.cron_secret IS NOT NULL AND EXCLUDED.cron_secret <> '' 
            THEN EXCLUDED.cron_secret 
            ELSE automation_scheduler_config.cron_secret 
        END,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'status', 'success',
        'api_url', v_clean_url,
        'is_active', p_is_active,
        'message', 'Automation scheduler configuration saved securely.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_automation_scheduler_config(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_automation_scheduler_config(TEXT, TEXT, BOOLEAN) TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 4. Master Trigger Function: Invoked by pg_cron every hour
--    Executes an authenticated HTTP POST to /api/daily-followup via pg_net
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_hourly_followup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, pg_temp
AS $$
DECLARE
    v_config RECORD;
    v_target_url TEXT;
    v_secret TEXT;
    v_headers JSONB;
    v_body JSONB;
    v_request_id BIGINT;
    v_run_id TEXT;
    v_vault_secret TEXT;
BEGIN
    v_run_id := 'pg_cron_' || to_char(NOW(), 'YYYYMMDD_HH24MISS');

    -- 1. Fetch configuration from automation_scheduler_config
    SELECT * INTO v_config
    FROM public.automation_scheduler_config
    WHERE id = 'default'
    LIMIT 1;

    -- Check if scheduler is paused/disabled
    IF v_config IS NOT NULL AND v_config.is_active IS FALSE THEN
        INSERT INTO public.whatsapp_automation_logs (run_id, event_type, lead_id, details, created_at)
        VALUES (v_run_id, 'scheduler_skipped', NULL, 'Hourly scheduler is disabled (is_active = false).', NOW());
        
        RETURN jsonb_build_object('status', 'skipped', 'reason', 'Scheduler is disabled');
    END IF;

    -- Determine secret: check Supabase Vault first, fallback to config table
    v_secret := COALESCE(v_config.cron_secret, '');
    BEGIN
        SELECT decrypted_secret INTO v_vault_secret
        FROM vault.decrypted_secrets
        WHERE name = 'CRON_SECRET' OR name = 'cron_secret'
        LIMIT 1;
        
        IF v_vault_secret IS NOT NULL AND v_vault_secret <> '' THEN
            v_secret := v_vault_secret;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Vault extension not active or accessible, use config table secret
        NULL;
    END;

    -- Determine target base URL
    IF v_config IS NULL OR v_config.api_url IS NULL OR v_config.api_url = '' OR v_config.api_url LIKE '%your-vercel-app%' THEN
        BEGIN
            v_target_url := current_setting('app.settings.api_url', true);
        EXCEPTION WHEN OTHERS THEN
            v_target_url := NULL;
        END;
    ELSE
        v_target_url := RTRIM(v_config.api_url, '/');
    END IF;

    -- If target URL is not configured, log error and exit safely
    IF v_target_url IS NULL OR v_target_url = '' OR v_target_url LIKE '%your-vercel-app%' THEN
        INSERT INTO public.whatsapp_automation_logs (run_id, event_type, lead_id, details, created_at)
        VALUES (
            v_run_id,
            'scheduler_error',
            NULL,
            'Scheduler failed: api_url is not configured. Call set_automation_scheduler_config(''https://your-domain.vercel.app'', ''secret'') to set your production URL.',
            NOW()
        );
        
        UPDATE public.automation_scheduler_config
        SET 
            last_status = 'Error: api_url not configured', 
            last_error = 'api_url is placeholder or empty', 
            updated_at = NOW()
        WHERE id = 'default';

        RETURN jsonb_build_object('status', 'error', 'message', 'api_url is not configured');
    END IF;

    v_target_url := v_target_url || '/api/daily-followup';

    -- Construct HTTP Headers securely (Authorization: Bearer <CRON_SECRET>)
    IF v_secret IS NOT NULL AND v_secret <> '' THEN
        v_headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'User-Agent', 'Supabase-pg_cron/1.0',
            'Authorization', 'Bearer ' || v_secret
        );
    ELSE
        v_headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'User-Agent', 'Supabase-pg_cron/1.0'
        );
    END IF;

    v_body := jsonb_build_object(
        'trigger', 'supabase_pg_cron',
        'run_id', v_run_id,
        'scheduled_at', NOW()
    );

    -- 2. Dispatch non-blocking HTTP POST via pg_net
    BEGIN
        SELECT net.http_post(
            url := v_target_url,
            headers := v_headers,
            body := v_body
        ) INTO v_request_id;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.whatsapp_automation_logs (run_id, event_type, lead_id, details, created_at)
        VALUES (v_run_id, 'scheduler_http_exception', NULL, 'pg_net HTTP dispatch exception: ' || SQLERRM, NOW());
        
        UPDATE public.automation_scheduler_config
        SET 
            last_status = 'HTTP Exception', 
            last_error = SQLERRM, 
            updated_at = NOW()
        WHERE id = 'default';

        RETURN jsonb_build_object('status', 'error', 'error', SQLERRM);
    END;

    -- 3. Update scheduler config state and log event
    UPDATE public.automation_scheduler_config
    SET
        last_triggered_at = NOW(),
        last_http_request_id = v_request_id,
        last_status = 'Dispatched (request_id: ' || COALESCE(v_request_id::text, 'unknown') || ')',
        last_error = NULL,
        updated_at = NOW()
    WHERE id = 'default';

    INSERT INTO public.whatsapp_automation_logs (run_id, event_type, lead_id, details, created_at)
    VALUES (
        v_run_id,
        'scheduler_http_triggered',
        NULL,
        jsonb_build_object(
            'target_url', v_target_url,
            'http_request_id', v_request_id,
            'auth_present', (v_secret IS NOT NULL AND v_secret <> ''),
            'triggered_at', NOW()
        )::text,
        NOW()
    );

    RETURN jsonb_build_object(
        'status', 'dispatched',
        'run_id', v_run_id,
        'target_url', v_target_url,
        'request_id', v_request_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_hourly_followup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_hourly_followup() TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 5. Register pg_cron Job (No duplicates)
--    Runs every hour at minute 0 (0 * * * *)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'hourly-daily-followup'
    ) THEN
        PERFORM cron.unschedule('hourly-daily-followup');
    END IF;
END $$;

SELECT cron.schedule(
    'hourly-daily-followup',
    '0 * * * *',
    $$SELECT public.trigger_hourly_followup();$$
);
