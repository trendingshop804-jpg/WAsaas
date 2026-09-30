select
  (select count(*) from public.organizations) as organizations,
  (select count(*) from public.organization_users) as organization_users,
  (select count(*) from public.whatsapp_connections) as whatsapp_connections,
  (select count(*) from public.leads) as leads,
  (select count(*) from public.messages) as messages,
  (select count(*) from public.messages where organization_id is not null) as messages_with_org;
