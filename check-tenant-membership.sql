select
  o.id as organization_id,
  o.name as organization_name,
  o.slug,
  ou.user_id,
  ou.role
from public.organizations o
join public.organization_users ou
  on ou.organization_id = o.id
order by o.name;
