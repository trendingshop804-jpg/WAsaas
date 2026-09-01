// api/instagram-disconnect.js
// Vercel serverless function: DELETE /api/instagram-disconnect
// Removes an instagram_connections row for the given organizationId.
// Uses the service-role key (bypasses RLS) so the frontend doesn't need
// a privileged Supabase client in the browser.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { organizationId, instagramBusinessId } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    let query = supabase
      .from('instagram_connections')
      .delete()
      .eq('organization_id', organizationId);

    // If a specific Instagram Business ID is provided, scope deletion to that account
    if (instagramBusinessId) {
      query = query.eq('instagram_business_id', instagramBusinessId);
    }

    const { error } = await query;

    if (error) {
      console.error('[Instagram Disconnect] Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`[Instagram Disconnect] Disconnected Instagram for org ${organizationId}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Instagram Disconnect] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
