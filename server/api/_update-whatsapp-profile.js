// api/update-whatsapp-profile.js
// Handles WhatsApp Business profile updates (photo, about, and fetch) for local dev-server & Vercel
import { decryptToken } from './_crypto.js';
import { createSupabaseAdminClient, requireOrgAccess } from './_supabase.js';

const GRAPH_API_VERSION = 'v21.0';

function validateImage(fileExt, mimeType, byteSize) {
  const validExts = ['jpeg', 'jpg', 'png'];
  const validMimes = ['image/jpeg', 'image/png'];
  const normalizedExt = String(fileExt || '').toLowerCase().replace('.', '');

  if (!validExts.includes(normalizedExt)) {
    return { valid: false, error: 'Image must be JPEG or PNG format.' };
  }
  if (!validMimes.includes(mimeType)) {
    return { valid: false, error: 'Invalid MIME type. Only image/jpeg and image/png are accepted.' };
  }
  if (byteSize > 5 * 1024 * 1024) {
    return { valid: false, error: 'Image exceeds 5MB limit. Please upload an image under 5MB.' };
  }
  return { valid: true };
}

async function metaApi(endpoint, accessToken, options = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${endpoint}`);

  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const fetchOpts = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body) {
    if (options.body instanceof FormData) {
      fetchOpts.body = options.body;
    } else {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(url.toString(), fetchOpts);
  const data = await res.json().catch(() => ({}));

  return { status: res.status, data, ok: res.ok };
}

function mapMetaError(data) {
  if (!data || !data.error) {
    return 'Meta API did not confirm the profile update.';
  }
  const err = data.error;
  if (err.code === 4) {
    return 'Permission denied: WhatsApp Business Management permission (whatsapp_business_management) is required in your Meta App Review.';
  }
  if (err.code === 190) {
    return 'WhatsApp access token expired or invalid. Please reconnect your WhatsApp Business account.';
  }
  if (err.code === 100) {
    return err.error_user_msg || err.message || 'Invalid parameters sent to Meta WhatsApp Business API.';
  }
  if (err.error_user_title) {
    return `${err.error_user_title}: ${err.error_user_msg || err.message || ''}`;
  }
  if (err.message) {
    return `Meta API error: ${err.message}`;
  }
  return 'Meta API encountered an error processing your WhatsApp Business profile update.';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', ['https://yourdomain.com', 'https://app.yourdomain.com', 'http://localhost:3000']);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const access = await requireOrgAccess(req, res, null);
    if (!access) return;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return res.status(503).json({ error: 'WhatsApp profile service is not configured.' });
    }

    const { action, imageBase64, fileName, about } = req.body || {};
    if (!action) {
      return res.status(400).json({ error: "Missing required 'action' field" });
    }

    const normalizedRole = String(access.role || '').trim().toUpperCase();
    if (action !== 'fetch_profile' && !['OWNER', 'ADMIN'].includes(normalizedRole)) {
      return res.status(403).json({
        error: 'Only organization owners or admins can update the WhatsApp Business profile.',
        code: 'INSUFFICIENT_ROLE'
      });
    }

    const organizationId = access.organizationId;
    const userEmail = access.user?.email || 'Authenticated user';
    const { data: connections, error: connectionError } = await supabase
      .from('whatsapp_connections')
      .select('access_token_encrypted, access_token, phone_number_id, waba_id, phone_number, is_active, organization_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (connectionError) {
      console.error('[WhatsApp Profile] Connection lookup failed:', connectionError.message);
      return res.status(500).json({ error: 'Could not load this organization\'s WhatsApp connection.' });
    }

    const connection = connections?.[0];
    if (!connection) {
      return res.status(409).json({
        error: 'No active WhatsApp connection is configured for this organization.',
        code: 'NO_WHATSAPP_CONNECTION'
      });
    }

    let accessToken = null;
    if (connection.access_token_encrypted) {
      try {
        accessToken = await decryptToken(connection.access_token_encrypted);
      } catch (e) {
        console.warn('Could not decrypt token, falling back to plaintext:', e.message);
      }
    }
    if (!accessToken && connection.access_token) {
      accessToken = connection.access_token;
    }
    if (!accessToken) {
      return res.status(409).json({
        error: 'No WhatsApp access token available. Please reconnect your WhatsApp Business account.',
        code: 'WHATSAPP_CREDENTIAL_UNAVAILABLE'
      });
    }

    const { phone_number_id, waba_id } = connection;
    const targetPhoneId = phone_number_id || waba_id;
    if (!targetPhoneId) {
      return res.status(409).json({
        error: 'The saved WhatsApp connection is missing its Phone Number ID.',
        code: 'WHATSAPP_PHONE_ID_MISSING'
      });
    }

    // ─── Action: update_profile_picture ──────────────────────────────────
    if (action === 'update_profile_picture') {
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Missing imageBase64 data' });
      }

      let base64Data = imageBase64;
      let mimeType = 'image/jpeg';
      let fileExt = 'jpg';

      if (imageBase64.startsWith('data:')) {
        const match = imageBase64.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1].toLowerCase();
          base64Data = match[2];
          fileExt = mimeType.split('/')[1].replace('jpeg', 'jpg');
        }
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const validation = validateImage(fileExt, mimeType, buffer.length);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const safeFileName = fileName || `profile_${Date.now()}.${fileExt}`;
      const uploadPath = `profile-${organizationId}-${Date.now()}.${fileExt}`;

      // Upload temporary file to profile-photos-public storage bucket
      const { error: uploadError } = await supabase.storage
        .from('profile-photos-public')
        .upload(uploadPath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.warn('Storage temp upload warning:', uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from('profile-photos-public')
        .getPublicUrl(uploadPath);
      const publicUrl = publicUrlData?.publicUrl || '';

      // Upload to Meta Media API
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', new Blob([buffer], { type: mimeType }), safeFileName);
      formData.append('type', mimeType);

      let mediaRes = await metaApi(`${targetPhoneId}/media`, accessToken, {
        method: 'POST',
        body: formData,
      });

      if ((!mediaRes.ok || !mediaRes.data?.id) && publicUrl) {
        mediaRes = await metaApi(`${targetPhoneId}/media`, accessToken, {
          method: 'POST',
          params: {
            messaging_product: 'whatsapp',
            image_url: publicUrl,
          },
        });
      }

      if (!mediaRes.ok || !mediaRes.data?.id) {
        if (uploadPath) {
          await supabase.storage.from('profile-photos-public').remove([uploadPath]);
        }
        return res.status(400).json({
          error: mapMetaError(mediaRes.data) || 'Meta Media API did not accept the uploaded image.',
          meta_response: mediaRes.data,
        });
      }

      const mediaId = mediaRes.data.id;

      // Set profile picture handle via WhatsApp Business Profile API
      let profileRes = await metaApi(`${targetPhoneId}/whatsapp_business_profile`, accessToken, {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          profile_picture_handle: mediaId,
        },
      });

      if (!profileRes.ok && waba_id && waba_id !== targetPhoneId) {
        profileRes = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
          method: 'POST',
          body: {
            messaging_product: 'whatsapp',
            profile_picture_handle: mediaId,
          },
        });
      }

      // Cleanup: Delete temporary image from storage
      if (uploadPath) {
        await supabase.storage.from('profile-photos-public').remove([uploadPath]);
      }

      if (!profileRes.ok || (profileRes.data?.success !== true && !profileRes.data?.id)) {
        return res.status(400).json({
          error: mapMetaError(profileRes.data),
          meta_response: profileRes.data,
        });
      }

      // Fetch confirmed profile picture from Meta
      let confirmedPictureUrl = '';
      const fetchProfileRes = await metaApi(`${targetPhoneId}/whatsapp_business_profile`, accessToken, {
        method: 'GET',
        params: { fields: 'profile_picture_url,about' },
      });

      if (fetchProfileRes.ok && fetchProfileRes.data) {
        const item = Array.isArray(fetchProfileRes.data.data) ? fetchProfileRes.data.data[0] : fetchProfileRes.data;
        confirmedPictureUrl = item?.profile_picture_url || '';
      }

      if (confirmedPictureUrl) {
        await supabase
          .from('whatsapp_connections')
          .update({
            profile_picture_url: confirmedPictureUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);
      }

      try {
        await supabase.from('audit_logs').insert({
          organization_id: organizationId,
          action: 'WhatsApp Profile Picture Updated',
          entity: connection.phone_number || phone_number_id || waba_id,
          actor: userEmail,
          details: `Profile picture updated via Meta Business Profile API. Media ID: ${mediaId}`,
          status: 'Success',
        });
      } catch (auditErr) {
        console.warn('Audit log insert error (non-fatal):', auditErr);
      }

      return res.status(200).json({
        success: true,
        message: 'Profile picture updated successfully on WhatsApp Business.',
        media_id: mediaId,
        profile_picture_url: confirmedPictureUrl || null,
      });
    }

    // ─── Action: update_about ─────────────────────────────────────────────
    if (action === 'update_about') {
      if (!about || typeof about !== 'string') {
        return res.status(400).json({ error: "Missing 'about' field" });
      }

      const trimmed = about.trim();
      if (trimmed.length > 139) {
        return res.status(400).json({
          error: `About text exceeds 139 character limit (${trimmed.length}/139).`,
        });
      }

      let updateRes = await metaApi(`${targetPhoneId}/whatsapp_business_profile`, accessToken, {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          about: trimmed,
        },
      });

      if (!updateRes.ok && waba_id && waba_id !== targetPhoneId) {
        updateRes = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
          method: 'POST',
          body: {
            messaging_product: 'whatsapp',
            about: trimmed,
          },
        });
      }

      if (!updateRes.ok || (updateRes.data?.success !== true && !updateRes.data?.id)) {
        return res.status(400).json({
          error: mapMetaError(updateRes.data),
          meta_response: updateRes.data,
        });
      }

      await supabase
        .from('whatsapp_connections')
        .update({
          about: trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId);

      try {
        await supabase.from('audit_logs').insert({
          organization_id: organizationId,
          action: 'WhatsApp About Text Updated',
          entity: connection.phone_number || phone_number_id || waba_id,
          actor: userEmail,
          details: `About text set to: "${trimmed}"`,
          status: 'Success',
        });
      } catch (auditErr) {
        console.warn('Audit log insert error (non-fatal):', auditErr);
      }

      return res.status(200).json({
        success: true,
        message: 'About text updated successfully on WhatsApp Business.',
        about: trimmed,
      });
    }

    // ─── Action: fetch_profile ───────────────────────────────────────────
    if (action === 'fetch_profile') {
      let fetchRes = await metaApi(`${targetPhoneId}/whatsapp_business_profile`, accessToken, {
        method: 'GET',
        params: {
          fields: 'profile_picture_url,about,address,description,name,websites,vertical',
        },
      });

      if (!fetchRes.ok && waba_id && waba_id !== targetPhoneId) {
        fetchRes = await metaApi(`${waba_id}/whatsapp_business_profile`, accessToken, {
          method: 'GET',
          params: {
            fields: 'profile_picture_url,about,address,description,name,websites,vertical',
          },
        });
      }

      if (!fetchRes.ok) {
        return res.status(400).json({
          error: mapMetaError(fetchRes.data),
          meta_response: fetchRes.data,
        });
      }

      const profileData = Array.isArray(fetchRes.data?.data) ? fetchRes.data.data[0] : fetchRes.data;

      if (profileData?.profile_picture_url || profileData?.about) {
        const updateFields = { updated_at: new Date().toISOString() };
        if (profileData.profile_picture_url) updateFields.profile_picture_url = profileData.profile_picture_url;
        if (profileData.about) updateFields.about = profileData.about;

        await supabase
          .from('whatsapp_connections')
          .update(updateFields)
          .eq('organization_id', organizationId);
      }

      return res.status(200).json({
        success: true,
        profile: profileData,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[API Error] update-whatsapp-profile:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
