import {
  getIntegrationStatuses,
  normalizeIntegrationKey,
  INTEGRATION_KEYS
} from './_integration-status.js';

/**
 * GET /api/integration-status[?integration=whatsapp]
 *
 * Performs live provider checks on the server. The response intentionally
 * contains no access tokens or other secrets.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const query = req.query || {};
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
