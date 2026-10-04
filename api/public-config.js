/**
 * Returns only browser-safe Supabase configuration. SUPABASE_SERVICE_ROLE_KEY
 * is intentionally never read or returned from this route.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const projectUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://mdrxnycolkuuvszzzwqi.supabase.co';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kcnhueWNvbGt1dXZzenp6d3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzkwNTcsImV4cCI6MjEwMjgxNTA1N30.hEl52V14VF47U1hQF6uzJGuMSQ05XLVsBq3x6fcimTI';

  if (!projectUrl || !anonKey) {
    const missing = [];
    if (!projectUrl) missing.push('VITE_SUPABASE_URL (or SUPABASE_URL)');
    if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)');
    console.error(`[Supabase Config Error] Missing required environment variable(s): ${missing.join(', ')}`);
    return res.status(503).json({
      error: 'Public Supabase configuration is unavailable.',
      missing: missing,
      details: `Please configure ${missing.join(' and ')} in your environment settings.`
    });
  }

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return res.status(200).json({
    projectUrl,
    anonKey,
    metaAppId: process.env.META_APP_ID || '',
    instagramAppId: process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '',
    metaApiVersion: 'v21.0',
    whatsappConfigId: process.env.WHATSAPP_CONFIG_ID || '',
    instagramConfigId: process.env.INSTAGRAM_CONFIG_ID || '4616502125294134'
  });
}