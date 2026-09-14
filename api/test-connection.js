import {
  WHATSAPP_ACCESS_TOKEN,
  PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION,
  hasRequiredConfig
} from './_lead-followups.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const configured = hasRequiredConfig();
  if (!configured) {
    return res.status(200).json({
      connected: false,
      status: 'Not Configured',
      message: 'WhatsApp integration is not configured. Missing WHATSAPP_ACCESS_TOKEN or PHONE_NUMBER_ID in environment settings.'
    });
  }

  try {
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${PHONE_NUMBER_ID}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || `HTTP ${response.status} error from Meta API`;
      return res.status(200).json({
        connected: false,
        status: 'Error',
        message: `WhatsApp connection failed: ${errMsg}`
      });
    }

    return res.status(200).json({
      connected: true,
      status: 'Connected',
      phoneNumberId: PHONE_NUMBER_ID,
      verifiedName: data.verified_name || data.display_phone_number || 'Meta WhatsApp Cloud API Verified',
      message: '✓ WhatsApp Cloud API connection successful'
    });
  } catch (err) {
    return res.status(200).json({
      connected: false,
      status: 'Error',
      message: `WhatsApp connection failed: ${err.message}`
    });
  }
}
