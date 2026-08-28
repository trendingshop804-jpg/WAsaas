-- Bring older inbox schemas up to the CRM message shape before adding indexes.
-- New columns are nullable so existing inbound history remains intact.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS direction VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS message_body TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS sender_number TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id
  ON public.messages(wa_message_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;