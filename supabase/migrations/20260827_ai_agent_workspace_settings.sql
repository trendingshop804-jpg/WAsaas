-- ============================================================================
-- WAsaas AI Agent — Workspace Settings for Lead Generation Prompts
-- Adds per-organization columns for the AI assistant system prompt placeholders
-- ============================================================================

ALTER TABLE IF EXISTS public.organizations
    ADD COLUMN IF NOT EXISTS product_description TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS pricing_summary TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS booking_link TEXT DEFAULT '';
