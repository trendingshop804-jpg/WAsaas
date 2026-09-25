import { getIntegrationStatuses } from './_integration-status.js';

/**
 * api/admin-system.js — Master Admin Platform System Health API
 *
 * Integration health is fetched live from the server-side provider checks.
 * No provider is reported as connected merely because a demo card exists.
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

  try {
    const integrations = await getIntegrationStatuses();
    const monitoredServices = Object.values(integrations);
    const hasProviderError = monitoredServices.some(item => ['error', 'unavailable'].includes(item.status));
    const allConfigured = monitoredServices.every(item => item.status === 'connected');

    const healthStatus = allConfigured
      ? 'healthy'
      : hasProviderError
        ? 'degraded'
        : 'not_configured';

    return res.status(200).json({
      success: true,
      health: {
        status: healthStatus,
        checkedAt: new Date().toISOString(),
        uptime: null,
        database: {
          status: 'not_checked',
          message: 'Database health is not reported by this endpoint.'
        },
        services: {
          whatsapp: integrations.whatsapp,
          instagram: integrations.instagram,
          calls: integrations.twilio,
          stripe: integrations.stripe
        },
        platformStats: null,
        recentAuditLogs: [],
        recentWebhookEvents: []
      }
    });
  } catch (error) {
    console.error('[Admin System Error]', error);
    return res.status(503).json({
      success: false,
      error: 'System health check failed.',
      checkedAt: new Date().toISOString()
    });
  }
}
