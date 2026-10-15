CREATE TABLE IF NOT EXISTS public.wa_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
    template_name TEXT NOT NULL,
    template_language TEXT NOT NULL DEFAULT 'en_US',
    audience_type TEXT NOT NULL DEFAULT 'manual',
    scheduled_at TIMESTAMPTZ,
    total_recipients INTEGER NOT NULL DEFAULT 0,
    queued_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    read_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_campaigns_organization_created
    ON public.wa_campaigns (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_scheduled
    ON public.wa_campaigns (scheduled_at)
    WHERE status = 'scheduled';

ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.audience_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audience_segments_organization ON public.audience_segments (organization_id, created_at DESC);
ALTER TABLE public.audience_segments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.wa_optouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone_normalized TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'manual',
    opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (organization_id, phone_normalized)
);
ALTER TABLE public.wa_optouts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    post_type TEXT NOT NULL DEFAULT 'post',
    media_urls TEXT[] NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    scheduled_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'processing', 'published', 'failed', 'cancelled')),
    ig_container_id TEXT,
    ig_post_id TEXT,
    error_message TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due ON public.scheduled_posts (scheduled_time) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_organization ON public.scheduled_posts (organization_id, created_at DESC);
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
