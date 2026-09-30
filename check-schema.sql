SELECT
  to_regclass('public.leads') AS leads,
  to_regclass('public.messages') AS messages,
  to_regclass('public.conversations') AS conversations,
  to_regclass('public.profiles') AS profiles,
  to_regclass('public.organizations') AS organizations,
  to_regclass('public.organization_users') AS organization_users,
  to_regclass('public.whatsapp_connections') AS whatsapp_connections;
