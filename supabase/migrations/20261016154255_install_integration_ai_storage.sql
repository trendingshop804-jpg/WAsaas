begin;

create table if not exists public.external_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  base_url text,
  api_key_encrypted text not null,
  api_key_hint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists idx_external_integrations_organization
  on public.external_integrations (organization_id);

create table if not exists public.organization_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists idx_organization_api_keys_active
  on public.organization_api_keys (organization_id, revoked_at)
  where revoked_at is null;

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channels jsonb not null default '["instagram", "whatsapp"]'::jsonb,
  business_name text,
  language text not null default 'en',
  tone text not null default 'Professional',
  system_instructions text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'needs_setup', 'error')),
  working_hours jsonb not null default '{"enabled": false, "start": "09:00", "end": "18:00", "timezone": "UTC"}'::jsonb,
  auto_reply_enabled boolean not null default false,
  confidence_threshold numeric not null default 0.75 check (confidence_threshold between 0 and 1),
  max_replies_per_conversation integer not null default 10 check (max_replies_per_conversation > 0),
  handover_on_low_confidence boolean not null default true,
  handover_keywords jsonb not null default '["human", "agent", "person", "representative", "support", "help"]'::jsonb,
  lead_qualification_enabled boolean not null default true,
  appointment_assistant_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_agents alter column auto_reply_enabled set default false;

create index if not exists idx_ai_agents_org on public.ai_agents (organization_id);

create table if not exists public.ai_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null default 'general' check (category in ('general', 'company', 'product', 'pricing', 'faq', 'business_hours', 'policy', 'booking')),
  title text not null,
  content text not null,
  keywords jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_knowledge_org on public.ai_knowledge_base (organization_id);

create table if not exists public.ai_reply_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.ai_agents(id) on delete set null,
  channel text not null check (channel in ('instagram', 'whatsapp')),
  conversation_id text not null,
  incoming_message text not null,
  ai_draft_reply text,
  final_sent_reply text,
  confidence_score numeric check (confidence_score between 0 and 1),
  handover_triggered boolean not null default false,
  handover_reason text,
  api_result jsonb not null default '{}'::jsonb,
  status text not null default 'sent' check (status in ('sent', 'failed', 'handover', 'blocked_by_window', 'paused')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_logs_org_created
  on public.ai_reply_logs (organization_id, created_at desc);

alter table public.external_integrations enable row level security;
alter table public.organization_api_keys enable row level security;
alter table public.ai_agents enable row level security;
alter table public.ai_knowledge_base enable row level security;
alter table public.ai_reply_logs enable row level security;

revoke all on table public.external_integrations from anon, authenticated;
revoke all on table public.organization_api_keys from anon, authenticated;

grant select, insert, update, delete on table public.ai_agents to authenticated;
grant select, insert, update, delete on table public.ai_knowledge_base to authenticated;
grant select on table public.ai_reply_logs to authenticated;

drop policy if exists ai_agents_tenant_policy on public.ai_agents;
drop policy if exists ai_knowledge_tenant_policy on public.ai_knowledge_base;
drop policy if exists ai_logs_tenant_policy on public.ai_reply_logs;

drop policy if exists nb_ai_agents_read on public.ai_agents;
create policy nb_ai_agents_read on public.ai_agents
  for select to authenticated
  using (exists (
    select 1 from public.organization_users membership
    where membership.organization_id = ai_agents.organization_id
      and membership.user_id = (select auth.uid())
  ));

drop policy if exists nb_ai_agents_manage on public.ai_agents;
create policy nb_ai_agents_manage on public.ai_agents
  for all to authenticated
  using (exists (
    select 1 from public.organization_users membership
    where membership.organization_id = ai_agents.organization_id
      and membership.user_id = (select auth.uid())
      and upper(membership.role::text) in ('OWNER', 'ADMIN')
  ))
  with check (exists (
    select 1 from public.organization_users membership
    where membership.organization_id = ai_agents.organization_id
      and membership.user_id = (select auth.uid())
      and upper(membership.role::text) in ('OWNER', 'ADMIN')
  ));

drop policy if exists nb_ai_knowledge_read on public.ai_knowledge_base;
create policy nb_ai_knowledge_read on public.ai_knowledge_base
  for select to authenticated
  using (exists (
    select 1 from public.organization_users membership
    where membership.organization_id = ai_knowledge_base.organization_id
      and membership.user_id = (select auth.uid())
  ));

drop policy if exists nb_ai_knowledge_manage on public.ai_knowledge_base;
create policy nb_ai_knowledge_manage on public.ai_knowledge_base
  for all to authenticated
  using (exists (
    select 1 from public.organization_users membership
    where membership.organization_id = ai_knowledge_base.organization_id
      and membership.user_id = (select auth.uid())
      and upper(membership.role::text) in ('OWNER', 'ADMIN')
  ))
  with check (exists (
    select 1 from public.organization_users membership
    where membership.organization_id = ai_knowledge_base.organization_id
      and membership.user_id = (select auth.uid())
      and upper(membership.role::text) in ('OWNER', 'ADMIN')
  ));

drop policy if exists nb_ai_logs_read on public.ai_reply_logs;
create policy nb_ai_logs_read on public.ai_reply_logs
  for select to authenticated
  using (exists (
    select 1 from public.organization_users membership
    where membership.organization_id = ai_reply_logs.organization_id
      and membership.user_id = (select auth.uid())
  ));

commit;
