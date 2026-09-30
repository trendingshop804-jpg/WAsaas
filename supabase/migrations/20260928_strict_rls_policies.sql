-- Fix insecure RLS policies that allowed unauthenticated access (OR auth.uid() IS NULL)

-- 1. Customers Table
DROP POLICY IF EXISTS "Tenant isolation for customers" ON public.customers;
CREATE POLICY "Tenant isolation for customers" ON public.customers
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

-- 2. Leads Table
DROP POLICY IF EXISTS "Tenant isolation for leads" ON public.leads;
CREATE POLICY "Tenant isolation for leads" ON public.leads
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

-- 3. Conversations Table
DROP POLICY IF EXISTS "Tenant isolation for conversations" ON public.conversations;
CREATE POLICY "Tenant isolation for conversations" ON public.conversations
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
        )
    );

-- Note: In the existing database, ensure that API webhooks and server-side operations
-- use the service_role key to bypass these strict RLS policies, since they no longer
-- allow anonymous (unauthenticated) access.
