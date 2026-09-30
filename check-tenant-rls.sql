select
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'organizations',
    'organization_users',
    'whatsapp_connections',
    'profiles',
    'leads',
    'messages',
    'conversations'
  )
order by tablename;

select
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organizations',
    'organization_users',
    'whatsapp_connections',
    'profiles',
    'leads',
    'messages',
    'conversations'
  )
order by tablename, policyname;
