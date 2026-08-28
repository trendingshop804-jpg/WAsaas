-- Persist accepted outbound sends with an explicit author and canonical body.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS message_body TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.messages(conversation_id, created_at);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;