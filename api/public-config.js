/**
 * Returns only browser-safe Supabase configuration. SUPABASE_SERVICE_ROLE_KEY
 * is intentionally never read or returned from this route.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const projectUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!projectUrl || !anonKey) {
    return res.status(503).json({ error: 'Public Supabase configuration is unavailable.' });
  }

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return res.status(200).json({
    projectUrl,
    anonKey,
    metaAppId: process.env.META_APP_ID || '',
    metaApiVersion: 'v21.0'
  });
}