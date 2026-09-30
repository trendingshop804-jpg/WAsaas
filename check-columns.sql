SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('leads', 'messages', 'conversations', 'profiles')
  AND column_name IN (
    'id',
    'user_id',
    'organization_id',
    'channel',
    'phone',
    'phone_number',
    'contact_id'
  )
ORDER BY table_name, ordinal_position;
