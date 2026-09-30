SELECT
  (SELECT count(*) FROM public.leads) AS leads,
  (SELECT count(*) FROM public.messages) AS messages,
  (SELECT count(*) FROM public.conversations) AS conversations,
  (SELECT count(*) FROM public.profiles) AS profiles;
