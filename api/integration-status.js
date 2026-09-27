import {
  getIntegrationStatus,
  getIntegrationStatuses,
  normalizeIntegrationKey,
  INTEGRATION_KEYS
} from './_integration-status.js';

/**
 * GET /api/integration-status[?integration=whatsapp]
 * GET, POST /api/test-connection (via rewrite route=test-connection)
 *
 * Performs live provider checks on the server without exposing secrets or tokens.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const query = req.query || {};
  const isTestConnection = query.route === 'test-connection';

  // ── Route: /api/test-connection backward-compatibility adapter ──────────
  if (isTestConnection) {
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

  // ── Route: /api/integration-status standard endpoint ────────────────────
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const requested = query.integration || new URL(req.url || '/api/integration-status', 'http://localhost').searchParams.get('integration');
  let keys = INTEGRATION_KEYS;
  let normalized = null;

  if (requested) {
    normalized = normalizeIntegrationKey(requested);
    if (!INTEGRATION_KEYS.includes(normalized)) {
      return res.status(400).json({
        error: 'Unknown integration.',
        supported: INTEGRATION_KEYS
      });
    }
    keys = [normalized];
  }

  try {
    const integrations = await getIntegrationStatuses(keys);
    return res.status(200).json({
      success: true,
      integrations,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Integration Status Error]', error);
    return res.status(503).json({
      success: false,
      error: 'Integration status check failed.',
      checkedAt: new Date().toISOString()
    });
  }
}
