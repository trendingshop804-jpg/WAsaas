// api/meta-oauth-exchange.js
// Handles WhatsApp Embedded Signup & Meta OAuth code and token exchange
import { createClient } from '@supabase/supabase-js';
import { encryptToken } from './_crypto.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function subscribeToWebhook(wabaId, accessToken) {
  try {
    const res = await fetch(`https://graph.facebook.com/v22.0/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json().catch(() => ({}));
    console.log('[Webhook Subscription Result]:', data);
  } catch (err) {
    console.warn('[Webhook Subscription Notice]:', err.message);
  }
}

async function subscribeToInstagramWebhook(pageId, accessToken) {
  try {
    await fetch(
      `https://graph.facebook.com/v22.0/${pageId}/subscribed_apps?subscribed_fields=feed,comments,messages,messaging_postbacks,message_reactions&access_token=${accessToken}`,
      { method: 'POST' }
    );
  } catch (e) {
    console.warn('[Instagram Webhook Subscription Notice]:', e.message);
  }
}

async function discoverAccounts(longLivedToken) {
  const wabas = [];
  const instagram = [];

  try {
    const bizRes = await fetch(`https://graph.facebook.com/v22.0/me/businesses?access_token=${longLivedToken}`);
    const bizData = await bizRes.json();

    if (bizData.data && Array.isArray(bizData.data)) {
      for (const biz of bizData.data) {
        const wabaRes = await fetch(`https://graph.facebook.com/v22.0/${biz.id}/client_whatsapp_business_accounts?access_token=${longLivedToken}`);
        const wabaData = await wabaRes.json();

        if (wabaData.data && Array.isArray(wabaData.data)) {
          for (const waba of wabaData.data) {
            const phoneRes = await fetch(`https://graph.facebook.com/v22.0/${waba.id}/phone_numbers?access_token=${longLivedToken}`);
            const phoneData = await phoneRes.json();

            wabas.push({
              wabaId: waba.id,
              wabaName: waba.name || biz.name,
              phoneNumbers: phoneData.data || []
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[Graph API WABA Discovery]:', err.message);
  }

  try {
    const pagesRes = await fetch(`https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longLivedToken}`);
    const pagesData = await pagesRes.json();

    if (pagesData.data && Array.isArray(pagesData.data)) {
      for (const page of pagesData.data) {
        if (page.instagram_business_account?.id) {
          instagram.push({
            instagramBusinessId: page.instagram_business_account.id,
            username: page.instagram_business_account.username || page.name,
            pageId: page.id,
            pageName: page.name
          });
        }
      }
    }
  } catch (err) {
    console.error('[Graph API Instagram Discovery]:', err.message);
  }

  return { wabas, instagram };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, accessToken, organizationId, wabaId, phoneNumberId, mode } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    let token = accessToken || '';

    // 1. Exchange OAuth code for access token if code provided
    if (code) {
      if (!META_APP_ID || !META_APP_SECRET) {
        throw new Error('META_APP_ID and META_APP_SECRET must be configured');
      }
      const tokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error?.message || 'Failed to exchange authorization code for token');
      }
      token = tokenData.access_token;
    }

    // 2. Exchange for long-lived token
    let longLivedToken = token;
    if (META_APP_ID && META_APP_SECRET && token) {
      try {
        const exchangeUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${token}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        if (exData.access_token) {
          longLivedToken = exData.access_token;
        }
      } catch (e) {
        console.warn('[Meta Token Exchange Notice]:', e.message);
      }
    }

    // 3. Handle explicit Embedded Signup or Direct Connection callback
    if ((wabaId && phoneNumberId) || mode === 'direct_save') {
      let displayName = req.body?.displayName || 'WhatsApp Business';
      let displayPhone = req.body?.phoneNumber || phoneNumberId || 'WhatsApp Connected';

      if (longLivedToken && phoneNumberId) {
        try {
          const phoneRes = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}?fields=verified_name,display_phone_number&access_token=${longLivedToken}`);
          const phoneData = await phoneRes.json().catch(() => ({}));
          if (phoneData.display_phone_number) displayPhone = phoneData.display_phone_number;
          if (phoneData.verified_name) displayName = phoneData.verified_name;
        } catch (_) {}
      }

      if (longLivedToken && wabaId) {
        try {
          const wabaRes = await fetch(`https://graph.facebook.com/v22.0/${wabaId}?fields=name&access_token=${longLivedToken}`);
          const wabaData = await wabaRes.json().catch(() => ({}));
          if (wabaData.name && displayName === 'WhatsApp Business') displayName = wabaData.name;
        } catch (_) {}
      }

      let encryptedToken = null;
      if (longLivedToken) {
        try {
          encryptedToken = await encryptToken(longLivedToken);
        } catch (_) {}
      }

      await supabase.from('whatsapp_connections').upsert({
        organization_id: organizationId,
        provider: mode === 'direct_save' ? 'META_CLOUD_API' : 'META_EMBEDDED_SIGNUP',
        phone_number: displayPhone,
        display_name: displayName,
        waba_id: wabaId || null,
        phone_number_id: phoneNumberId || 'default',
        access_token_encrypted: encryptedToken,
        access_token: longLivedToken || null,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, phone_number_id' });

      if (wabaId && longLivedToken) {
        await subscribeToWebhook(wabaId, longLivedToken).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        phone_number: displayPhone,
        waba_id: wabaId
      });
    }

    // 4. Auto-discovery of WABAs and Instagram accounts
    const discovery = await discoverAccounts(longLivedToken);
    const encryptedToken = await encryptToken(longLivedToken);

    let savedWhatsapp = false;
    let savedInstagram = 0;
    let connectedPhoneNumber = '';
    let connectedWabaId = '';

    const firstWaba = discovery.wabas.find(w => w.phoneNumbers.length > 0);
    if (firstWaba) {
      const phone = firstWaba.phoneNumbers[0];
      connectedPhoneNumber = phone.display_phone_number;
      connectedWabaId = firstWaba.wabaId;

      await supabase.from('whatsapp_connections').upsert({
        organization_id: organizationId,
        provider: 'META_CLOUD_API',
        phone_number: phone.display_phone_number,
        display_name: phone.verified_name || firstWaba.wabaName,
        waba_id: firstWaba.wabaId,
        phone_number_id: phone.id,
        access_token_encrypted: encryptedToken,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, phone_number_id' });

      savedWhatsapp = true;
      await subscribeToWebhook(firstWaba.wabaId, longLivedToken);
    }

    for (const ig of discovery.instagram) {
      await supabase.from('instagram_connections').upsert({
        organization_id: organizationId,
        instagram_business_id: ig.instagramBusinessId,
        instagram_username: ig.username,
        page_id: ig.pageId,
        access_token_encrypted: encryptedToken,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, instagram_business_id' });

      savedInstagram++;
      if (ig.pageId) {
        await subscribeToInstagramWebhook(ig.pageId, longLivedToken);
      }
    }

    return res.status(200).json({
      success: true,
      whatsapp: savedWhatsapp,
      instagram: savedInstagram,
      phone_number: connectedPhoneNumber || (savedInstagram > 0 ? 'Instagram Connected' : 'Connected'),
      waba_id: connectedWabaId,
      wabas: discovery.wabas,
      instagramAccounts: discovery.instagram
    });
  } catch (err) {
    console.error('[meta-oauth-exchange API Error]:', err);
    return res.status(500).json({ error: err.message });
  }
}
