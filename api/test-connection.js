import { getIntegrationStatus } from './_integration-status.js';

/**
 * GET, POST /api/test-connection
 *
 * Backward-compatible adapter for frontend settings callers
 * (e.g., settings.js and settings-integrations.js). Delegates health
 * check logic to the shared checker in _integration-status.js without
 * exposing credentials or tokens.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const waResult = await getIntegrationStatus('whatsapp');

    if (!waResult) {
      return res.status(500).json({
        connected: false,
        status: 'Error',
        message: 'WhatsApp status checker unavailable.'
      });
    }

    const isConnected = Boolean(waResult.connected);
    const statusLabel = isConnected
      ? 'Connected'
      : waResult.status === 'not_configured'
        ? 'Not Configured'
        : 'Error';

    const verifiedName = waResult.verifiedName || waResult.displayName || 'Meta WhatsApp Cloud API Verified';

    return res.status(200).json({
      connected: isConnected,
      status: statusLabel,
      message: isConnected
        ? '✓ WhatsApp Cloud API connection successful'
        : waResult.message || 'WhatsApp connection failed.',
      verifiedName,
      displayName: waResult.displayName || null,
      checkedAt: waResult.checkedAt || new Date().toISOString(),
      latencyMs: waResult.latencyMs ?? null
    });
  } catch (err) {
    console.error('[Test Connection Error]', err);
    return res.status(500).json({
      connected: false,
      status: 'Error',
      message: `WhatsApp connection failed: ${err.message}`
    });
  }
}
