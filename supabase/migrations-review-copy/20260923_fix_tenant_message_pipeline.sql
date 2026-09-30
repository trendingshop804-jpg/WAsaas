-- Keep webhook-written message rows aligned with the tenant-scoped CRM schema.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.messages AS message
SET organization_id = conversation.organization_id
FROM public.conversations AS conversation
WHERE message.organization_id IS NULL
  AND message.conversation_id = conversation.id;

CREATE INDEX IF NOT EXISTS idx_messages_organization_received_at
  ON public.messages (organization_id, received_at DESC);

-- A NULL auth.uid() represents an unauthenticated caller; it must not grant
-- tenant-wide access. Server-side webhook code uses a secret/service key and
-- continues to bypass RLS as intended.
DROP POLICY IF EXISTS "Tenant isolation for customers" ON public.customers;
DROP POLICY IF EXISTS "Tenant isolation for leads" ON public.leads;
DROP POLICY IF EXISTS "Tenant isolation for conversations" ON public.conversations;
DROP POLICY IF EXISTS "Tenant isolation for messages" ON public.messages;

CREATE POLICY "Tenant isolation for customers" ON public.customers
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = customers.organization_id
      AND membership.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = customers.organization_id
      AND membership.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Tenant isolation for leads" ON public.leads
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = leads.organization_id
      AND membership.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = leads.organization_id
      AND membership.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Tenant isolation for conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = conversations.organization_id
      AND membership.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = conversations.organization_id
      AND membership.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Tenant isolation for messages" ON public.messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = messages.organization_id
      AND membership.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    WHERE membership.organization_id = messages.organization_id
      AND membership.user_id = (SELECT auth.uid())
  ));
