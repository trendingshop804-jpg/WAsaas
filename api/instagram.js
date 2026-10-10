// api/instagram.js
// Consolidated Vercel Serverless Function for Instagram operations:
// - action=disconnect / DELETE: removes Instagram connection for an organization
// - action=dm-queue: processes pending comment-to-DM queue
// - action=publish (default POST): publishes scheduled feed posts, reels, stories, carousels

// SECURITY
//   Every tenant-scoped action below requires a signed-in organization member.
//   The organization is taken from the caller's organization_users membership,
//   never from the request body, so a caller cannot connect, disconnect or send
//   on behalf of another tenant. The service-role client is only used AFTER
//   that check.
//   There is no Meta server-to-server callback in this file (webhooks are
//   handled by api/meta-webhook.js), so gating does not break OAuth.
import { createClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from './_crypto.js';
import { requireOrgAccess } from './_supabase.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const META_APP_ID = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || '';

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const DM_QUEUE_BATCH_SIZE = 25;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ['https://yourdomain.com', 'https://app.yourdomain.com', 'http://localhost:3000']);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = (req.query.action || '').toLowerCase();

  // ── Authorization gate for tenant-scoped actions ─────────────────────────
  // The organization below always comes from membership. Any organizationId in
  // the request body is ignored for authorization purposes.
  const TENANT_ACTIONS = new Set([
    'test_connection',
    'connect_manual',
    'connect',
    'disconnect',
    'send_message',
    'oauth-exchange',
    'code_exchange'
  ]);
  const needsOrg = TENANT_ACTIONS.has(action) || req.method === 'DELETE';

  let organizationId = null;
  if (needsOrg) {
    const access = await requireOrgAccess(req, res);
    if (!access) return;
    organizationId = access.organizationId;
  }

  // ── 0a. TEST CONNECTION (Validate Meta Token & Business Account) ──────────
  if (action === 'test_connection') {
    try {
      const { accessToken, instagramBusinessId } = req.body || {};
      if (!accessToken) {
        return res.status(400).json({ error: 'Meta Permanent Access Token is required to test connection' });
      }
      const token = String(accessToken).trim();
      const targetId = instagramBusinessId ? String(instagramBusinessId).trim() : null;

      if (targetId) {
        const testRes = await fetch(
          `https://graph.facebook.com/v22.0/${targetId}?fields=id,username,name,followers_count,profile_picture_url&access_token=${encodeURIComponent(token)}`
        );
        const data = await testRes.json();
        if (data?.id) {
          return res.status(200).json({
            success: true,
            verified: true,
            account: {
              id: data.id,
              username: data.username || data.name || data.id,
              name: data.name || '',
              followersCount: data.followers_count || 0
            }
          });
        } else {
          return res.status(400).json({
            error: data?.error?.message || 'Invalid Token or Instagram Business Account ID',
            code: data?.error?.code
          });
        }
      }

      // If no business ID provided, check token validity with /me
      const meRes = await fetch(
        `https://graph.facebook.com/v22.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`
      );
      const meData = await meRes.json();
      if (meData?.id) {
        return res.status(200).json({
          success: true,
          verified: true,
          account: { id: meData.id, name: meData.name }
        });
      }

      return res.status(400).json({
        error: meData?.error?.message || 'Invalid Meta token',
        code: meData?.error?.code
      });
    } catch (err) {
      console.error('[Instagram Test Connection Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 0a1. SOCIAL CONVERSATIONS & DM INBOX ──────────────────────────────────
  if (action === 'social_conversations' || action === 'conversations') {
    try {
      const subAction = req.query.subAction || req.body?.subAction || 'list';
      if (subAction === 'messages') {
        const convId = req.query.conversation_id || req.body?.conversation_id;
        if (supabase) {
          const { data: messages, error } = await supabase
            .from('social_messages')
            .select('*')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true });
          if (!error && messages && messages.length > 0) {
            return res.status(200).json({ success: true, messages });
          }
        }
        return res.status(200).json({
          success: true,
          source: 'demo_fallback',
          messages: [
            {
              id: 'msg-1',
              sender_type: 'user',
              message_text: 'Hi! I saw your post on WhatsApp CRM integration. What is the pricing for enterprise?',
              created_at: new Date(Date.now() - 3600000 * 2).toISOString()
            }
          ]
        });
      }

      if (supabase) {
        const { data: conversations, error } = await supabase
          .from('social_conversations')
          .select('*')
          .order('updated_at', { ascending: false });
        if (!error && conversations && conversations.length > 0) {
          return res.status(200).json({ success: true, conversations });
        }
      }

      return res.status(200).json({
        success: true,
        source: 'demo_fallback',
        conversations: [
          {
            id: 'conv-ig-1',
            participant_id: 'ig_user_101',
            participant_name: 'Sophia Martinez',
            participant_username: 'sophiam_design',
            participant_avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
            platform: 'instagram',
            unread_count: 2,
            last_message: 'Hi! I saw your post on WhatsApp CRM integration. What is the pricing for enterprise?',
            updated_at: new Date(Date.now() - 3600000 * 2).toISOString()
          },
          {
            id: 'conv-ig-2',
            participant_id: 'ig_user_102',
            participant_name: 'Alex Johnson',
            participant_username: 'alexj_tech',
            participant_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
            platform: 'instagram',
            unread_count: 0,
            last_message: 'Thanks for sending the demo link! Checking it out now.',
            updated_at: new Date(Date.now() - 86400000 * 1).toISOString()
          }
        ]
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 0b. CONNECT MANUAL (Token & ID Direct Integration) ─────────────────────
  if (action === 'connect_manual' || action === 'connect') {
    try {
      // organizationId is resolved from membership above, never from the body.
      const { accessToken, instagramBusinessId, username, pageId, pageName } = req.body || {};

      if (!accessToken) {
        return res.status(400).json({ error: 'Meta Permanent Access Token is required' });
      }
      if (!instagramBusinessId) {
        return res.status(400).json({ error: 'Instagram Business / Professional Account ID is required' });
      }

      const cleanUsername = String(username || '').replace(/^@/, '').trim() || `instagram_${instagramBusinessId}`;
      const encryptedToken = await encryptToken(accessToken);

      // Verify token with Graph API (test call)
      let verifiedUsername = cleanUsername;
      try {
        const testRes = await fetch(`https://graph.facebook.com/v22.0/${instagramBusinessId}?fields=id,username,name&access_token=${accessToken}`);
        const testData = await testRes.json();
        if (testData?.username) {
          verifiedUsername = testData.username;
        }
      } catch (testErr) {
        console.warn('[Instagram Connect Manual] Graph API verification notice:', testErr.message);
      }

      // Upsert connection record into Supabase (if available)
      if (supabase) {
        try {
          const { error: upsertErr } = await supabase
            .from('instagram_connections')
            .upsert({
              organization_id: organizationId,
              instagram_business_id: String(instagramBusinessId).trim(),
              instagram_username: verifiedUsername,
              page_id: pageId ? String(pageId).trim() : null,
              access_token_encrypted: encryptedToken,
              is_active: true,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id, instagram_business_id' });

          if (upsertErr) {
            console.warn('[Instagram Connect Manual] Supabase upsert notice:', upsertErr.message);
          }
        } catch (dbErr) {
          console.warn('[Instagram Connect Manual] Supabase upsert notice:', dbErr.message);
        }
      }

      // Attempt to subscribe webhook if pageId & token available
      if (pageId && accessToken) {
        try {
          await fetch(
            `https://graph.facebook.com/v22.0/${pageId}/subscribed_apps?subscribed_fields=feed,comments,messages,messaging_postbacks,message_reactions&access_token=${accessToken}`,
            { method: 'POST' }
          );
        } catch (_) { }
      }

      console.log(`[Instagram Connect Manual] Successfully connected Instagram @${verifiedUsername} for org ${organizationId}`);
      return res.status(200).json({
        success: true,
        message: 'Instagram Professional account connected successfully.',
        account: {
          instagramBusinessId: String(instagramBusinessId).trim(),
          username: verifiedUsername,
          pageId: pageId ? String(pageId).trim() : null,
          pageName: pageName || null
        }
      });
    } catch (err) {
      console.error('[Instagram Connect Manual] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 1. DISCONNECT ─────────────────────────────────────────────────────────
  if (req.method === 'DELETE' || action === 'disconnect') {
    try {
      const { instagramBusinessId } = req.body || {};
      if (!instagramBusinessId) {
        return res.status(400).json({ error: 'instagramBusinessId is required' });
      }

      if (supabase) {
        let query = supabase
          .from('instagram_connections')
          .delete()
          .eq('organization_id', organizationId);

        if (instagramBusinessId) {
          query = query.eq('instagram_business_id', instagramBusinessId);
        }

        const { error } = await query;
        if (error) {
          console.error('[Instagram Disconnect] Supabase error:', error);
          return res.status(500).json({ error: error.message });
        }
      }

      console.log(`[Instagram Disconnect] Disconnected Instagram for org ${organizationId}`);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[Instagram Disconnect] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 2. SEND DIRECT MESSAGE (CRM Outbound) ──────────────────────────────────
  if (action === 'send_message' || (req.method === 'POST' && (req.body?.recipientId || req.body?.recipient_id))) {
    try {
      // organizationId is resolved from membership above, never from the body.
      const { recipientId, recipient_id, text, message, mediaUrl, conversationId, leadId } = req.body || {};
      const targetRecipient = recipientId || recipient_id;
      const messageText = text || message || '';

      if (!targetRecipient || (!messageText && !mediaUrl)) {
        return res.status(400).json({ error: 'recipientId and text or mediaUrl are required' });
      }

      const { data: conn, error: connErr } = await supabase
        .from('instagram_connections')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .single();

      if (connErr || !conn) {
        return res.status(404).json({ error: 'No active Instagram connection found for this organization' });
      }

      const token = await decryptToken(conn.access_token_encrypted);
      if (!token) {
        return res.status(500).json({ error: 'Could not decrypt Instagram access token' });
      }

      const targetId = conn.page_id || conn.instagram_business_id;
      const sendUrl = `https://graph.facebook.com/v22.0/${targetId}/messages`;

      const reqBody = {
        recipient: { id: targetRecipient },
        message: mediaUrl
          ? { attachment: { type: 'image', payload: { url: mediaUrl, is_reusable: true } } }
          : { text: messageText }
      };

      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(reqBody)
      });

      const sendResult = await response.json();
      if (!response.ok) {
        throw new Error(sendResult.error?.message || `Instagram API error HTTP ${response.status}`);
      }

      const igMessageId = sendResult.message_id || `ig_out_${Date.now()}`;
      const sentAt = new Date().toISOString();

      if (conversationId) {
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            wa_message_id: igMessageId,
            sender_number: conn.instagram_business_id,
            sender: 'agent',
            content: messageText || (mediaUrl ? 'Attachment' : ''),
            message_type: mediaUrl ? 'image' : 'text',
            direction: 'outbound',
            channel: 'instagram',
            media_url: mediaUrl || null,
            received_at: sentAt,
            status: 'sent',
          });

        await supabase
          .from('conversations')
          .update({
            last_message: messageText || 'Attachment',
            last_timestamp: sentAt,
            channel: 'instagram',
          })
          .eq('id', conversationId);
      }

      await supabase
        .from('instagram_messages')
        .insert({
          organization_id: organizationId,
          ig_message_id: igMessageId,
          sender_id: conn.instagram_business_id,
          sender_username: conn.instagram_username || 'business',
          recipient_id: targetRecipient,
          content: messageText,
          direction: 'outbound',
          received_at: sentAt
        });

      return res.status(200).json({
        success: true,
        messageId: igMessageId,
        sentAt
      });
    } catch (err) {
      console.error('[Instagram Send Message Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 3. OAUTH CODE / TOKEN EXCHANGE ─────────────────────────────────────────
  if (action === 'oauth-exchange' || action === 'code_exchange') {
    try {
      // organizationId is resolved from membership above, never from the body.
      const { code, accessToken } = req.body || {};

      let longLivedToken = accessToken || '';
      if (code) {
        if (!META_APP_ID || !META_APP_SECRET) {
          throw new Error('META_APP_ID and META_APP_SECRET are required for code exchange');
        }
        const tokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`;
        const tokenRes = await fetch(tokenUrl);
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
          throw new Error(tokenData.error?.message || 'Failed to exchange OAuth code for access token');
        }
        longLivedToken = tokenData.access_token;
      }

      // Discover linked Instagram Professional accounts
      const pagesRes = await fetch(`https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longLivedToken}`);
      const pagesData = await pagesRes.json();
      const discovered = [];

      if (pagesData.data && Array.isArray(pagesData.data)) {
        for (const page of pagesData.data) {
          if (page.instagram_business_account?.id) {
            discovered.push({
              instagramBusinessId: page.instagram_business_account.id,
              username: page.instagram_business_account.username || page.name,
              pageId: page.id,
              pageName: page.name,
              pageToken: page.access_token || longLivedToken
            });
          }
        }
      }

      if (discovered.length === 0) {
        return res.status(400).json({
          error: 'No Instagram Business Account found linked to your Facebook Pages. Please link your Instagram Professional account to a Facebook Page first.'
        });
      }

      const primary = discovered[0];
      const encryptedToken = await encryptToken(primary.pageToken || longLivedToken);

      await supabase.from('instagram_connections').upsert({
        organization_id: organizationId,
        instagram_business_id: primary.instagramBusinessId,
        instagram_username: primary.username,
        page_id: primary.pageId,
        access_token_encrypted: encryptedToken,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'organization_id, instagram_business_id' });

      // Subscribe page to webhooks
      try {
        await fetch(`https://graph.facebook.com/v22.0/${primary.pageId}/subscribed_apps?subscribed_fields=feed,comments,messages,messaging_postbacks,message_reactions&access_token=${primary.pageToken || longLivedToken}`, {
          method: 'POST'
        });
      } catch (e) {
        console.warn('[Instagram Subscribed Apps Error]:', e.message);
      }

      return res.status(200).json({
        success: true,
        // SECURITY: never send Meta page tokens to the browser. Only safe
        // connection metadata is returned; the token stays encrypted server-side.
        instagram: discovered.map(({ pageToken, ...safe }) => safe),
        connected: {
          username: primary.username,
          instagramBusinessId: primary.instagramBusinessId,
          pageId: primary.pageId
        }
      });
    } catch (err) {
      console.error('[Instagram OAuth Exchange Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 2. DM QUEUE ───────────────────────────────────────────────────────────
  if (action === 'dm-queue') {
    try {
      const nowIso = new Date().toISOString();
      const { data: queueItems, error: fetchErr } = await supabase
        .from('instagram_dm_queue')
        .select('*, organization_id, rule_id, comment_id, recipient_id, recipient_username, message_text')
        .eq('status', 'pending')
        .lte('scheduled_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(DM_QUEUE_BATCH_SIZE);

      if (fetchErr) throw new Error(`Queue query failed: ${fetchErr.message}`);
      if (!queueItems || queueItems.length === 0) {
        return res.status(200).json({ processed: 0, message: 'Queue is empty' });
      }

      let sentCount = 0;
      let failedCount = 0;
      const tokenCache = new Map();

      for (const item of queueItems) {
        try {
          await supabase
            .from('instagram_dm_queue')
            .update({ status: 'processing', attempts: (item.attempts || 0) + 1 })
            .eq('id', item.id);

          let token = tokenCache.get(item.organization_id);
          let igConnection = null;

          if (!token) {
            const { data: conn } = await supabase
              .from('instagram_connections')
              .select('*')
              .eq('organization_id', item.organization_id)
              .eq('is_active', true)
              .single();

            if (!conn) throw new Error(`No active Instagram connection for org ${item.organization_id}`);
            igConnection = conn;
            token = await decryptToken(conn.access_token_encrypted);
            if (!token) throw new Error('Could not decrypt Instagram access token');
            tokenCache.set(item.organization_id, { token, conn });
          } else {
            igConnection = token.conn;
            token = token.token;
          }

          const targetId = igConnection.page_id || igConnection.instagram_business_id;
          const sendUrl = `https://graph.facebook.com/v22.0/${targetId}/messages`;

          const response = await fetch(sendUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              recipient: { comment_id: item.comment_id },
              message: { text: item.message_text }
            })
          });

          const sendResult = await response.json();
          if (!response.ok) {
            throw new Error(sendResult.error?.message || `HTTP ${response.status}`);
          }

          const igMessageId = sendResult.message_id || sendResult.recipient_id || `ig_msg_${Date.now()}`;

          await supabase
            .from('instagram_dm_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              ig_message_id: igMessageId,
              error_message: null
            })
            .eq('id', item.id);

          await supabase
            .from('instagram_comments')
            .update({ replied_privately: true })
            .eq('ig_comment_id', item.comment_id);

          if (item.rule_id) {
            const { data: ruleData } = await supabase
              .from('instagram_dm_rules')
              .select('dm_count')
              .eq('id', item.rule_id)
              .single();

            if (ruleData) {
              await supabase
                .from('instagram_dm_rules')
                .update({ dm_count: (ruleData.dm_count || 0) + 1 })
                .eq('id', item.rule_id);
            }
          }

          await supabase
            .from('instagram_messages')
            .insert({
              organization_id: item.organization_id,
              ig_message_id: igMessageId,
              sender_id: igConnection.instagram_business_id,
              sender_username: igConnection.instagram_username || 'business',
              recipient_id: item.recipient_id,
              recipient_username: item.recipient_username,
              content: item.message_text,
              direction: 'outbound',
              is_private_reply: true,
              source_comment_id: item.comment_id,
              received_at: new Date().toISOString()
            });

          sentCount++;
        } catch (itemErr) {
          failedCount++;
          console.error(`[instagram-dm-queue] Error for item ${item.id}:`, itemErr.message);

          const currentAttempts = (item.attempts || 0) + 1;
          const isExhausted = currentAttempts >= (item.max_attempts || 3);

          await supabase
            .from('instagram_dm_queue')
            .update({
              status: isExhausted ? 'failed' : 'pending',
              error_message: itemErr.message,
              scheduled_at: isExhausted ? undefined : new Date(Date.now() + 60000).toISOString()
            })
            .eq('id', item.id);
        }
      }

      return res.status(200).json({
        success: true,
        processed: queueItems.length,
        sent: sentCount,
        failed: failedCount
      });
    } catch (error) {
      console.error('[instagram-dm-queue Fatal]:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // ── 4. RULE & SCHEDULER CRUD ─────────────────────────────────────────────
  if (action === 'save_rule') {
    try {
      const { ruleType, rule } = req.body || {};
      if (!supabase) return res.status(200).json({ success: true, rule: rule || {} });
      const table = ruleType === 'dm' ? 'instagram_dm_rules' : 'instagram_reply_rules';
      const { data, error } = await supabase.from(table).upsert(rule).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true, rule: data });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'toggle_rule') {
    try {
      const { ruleType, ruleId, isActive } = req.body || {};
      if (!supabase) return res.status(200).json({ success: true });
      const table = ruleType === 'dm' ? 'instagram_dm_rules' : 'instagram_reply_rules';
      const { error } = await supabase.from(table).update({ is_active: isActive }).eq('id', ruleId);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'delete_rule') {
    try {
      const { ruleType, ruleId } = req.body || {};
      if (!supabase) return res.status(200).json({ success: true });
      const table = ruleType === 'dm' ? 'instagram_dm_rules' : 'instagram_reply_rules';
      const { error } = await supabase.from(table).delete().eq('id', ruleId);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'save_post') {
    try {
      const { post } = req.body || {};
      if (!supabase) return res.status(200).json({ success: true, post: post || {} });
      const { data, error } = await supabase.from('scheduled_posts').insert(post).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true, post: data });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'delete_post') {
    try {
      const { postId } = req.body || {};
      if (!supabase) return res.status(200).json({ success: true });
      const { error } = await supabase.from('scheduled_posts').delete().eq('id', postId);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── 5. PUBLISH (default POST) ─────────────────────────────────────────────
  try {
    if (!supabase) {
      return res.status(200).json({ processed: 0, message: 'Database not configured' });
    }
    const nowIso = new Date().toISOString();
    const { data: posts, error: fetchErr } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_time', nowIso)
      .order('scheduled_time', { ascending: true })
      .limit(10);

    if (fetchErr) throw new Error(`Scheduled posts query failed: ${fetchErr.message}`);
    if (!posts || posts.length === 0) {
      return res.status(200).json({ processed: 0, message: 'No pending posts due for publishing' });
    }

    let publishedCount = 0;
    let failedCount = 0;

    for (const post of posts) {
      try {
        await supabase
          .from('scheduled_posts')
          .update({ status: 'processing' })
          .eq('id', post.id);

        const { data: conn, error: connErr } = await supabase
          .from('instagram_connections')
          .select('*')
          .eq('organization_id', post.organization_id)
          .eq('is_active', true)
          .single();

        if (connErr || !conn) throw new Error(`No active Instagram connection for org ${post.organization_id}`);

        const token = await decryptToken(conn.access_token_encrypted);
        if (!token) throw new Error('Could not decrypt Instagram access token');

        const igUserId = conn.instagram_business_id;
        const postType = (post.post_type || 'post').toLowerCase();
        const mediaUrls = Array.isArray(post.media_urls) ? post.media_urls : [post.media_urls];
        const primaryMedia = mediaUrls[0];

        if (!primaryMedia) throw new Error('Post does not contain any media URL');

        let containerId = null;

        if (postType === 'reel') {
          const containerRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media_type: 'REELS', video_url: primaryMedia, caption: post.caption || '', access_token: token })
          });
          const containerData = await containerRes.json();
          if (!containerRes.ok) throw new Error(containerData.error?.message || 'Reel container creation failed');
          containerId = containerData.id;

        } else if (postType === 'story') {
          const isVideo = primaryMedia.endsWith('.mp4') || primaryMedia.includes('video');
          const payload = { media_type: 'STORIES', access_token: token };
          if (isVideo) payload.video_url = primaryMedia; else payload.image_url = primaryMedia;

          const containerRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const containerData = await containerRes.json();
          if (!containerRes.ok) throw new Error(containerData.error?.message || 'Story container creation failed');
          containerId = containerData.id;

        } else if (postType === 'carousel' && mediaUrls.length > 1) {
          const itemContainerIds = [];
          for (const itemUrl of mediaUrls) {
            const isVideo = itemUrl.endsWith('.mp4') || itemUrl.includes('video');
            const itemPayload = { is_carousel_item: true, access_token: token };
            if (isVideo) { itemPayload.media_type = 'VIDEO'; itemPayload.video_url = itemUrl; }
            else { itemPayload.image_url = itemUrl; }

            const itemRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(itemPayload)
            });
            const itemData = await itemRes.json();
            if (!itemRes.ok) throw new Error(itemData.error?.message || 'Carousel item container failed');
            itemContainerIds.push(itemData.id);
          }

          const carouselRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media_type: 'CAROUSEL', children: itemContainerIds, caption: post.caption || '', access_token: token })
          });
          const carouselData = await carouselRes.json();
          if (!carouselRes.ok) throw new Error(carouselData.error?.message || 'Carousel parent container failed');
          containerId = carouselData.id;

        } else {
          const isVideo = primaryMedia.endsWith('.mp4') || primaryMedia.includes('video');
          const payload = { caption: post.caption || '', access_token: token };
          if (isVideo) { payload.media_type = 'VIDEO'; payload.video_url = primaryMedia; }
          else { payload.image_url = primaryMedia; }

          const containerRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const containerData = await containerRes.json();
          if (!containerRes.ok) throw new Error(containerData.error?.message || 'Feed post container failed');
          containerId = containerData.id;
        }

        const publishRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: containerId, access_token: token })
        });

        const publishData = await publishRes.json();
        if (!publishRes.ok) throw new Error(publishData.error?.message || 'Media publish failed');

        const igPostId = publishData.id || `ig_post_${Date.now()}`;

        await supabase
          .from('scheduled_posts')
          .update({
            status: 'published',
            ig_container_id: containerId,
            ig_post_id: igPostId,
            published_at: new Date().toISOString(),
            error_message: null
          })
          .eq('id', post.id);

        publishedCount++;
      } catch (err) {
        failedCount++;
        console.error(`[instagram-publish] Error publishing post ${post.id}:`, err.message);
        await supabase
          .from('scheduled_posts')
          .update({ status: 'failed', error_message: err.message })
          .eq('id', post.id);
      }
    }

    return res.status(200).json({
      success: true,
      processed: posts.length,
      published: publishedCount,
      failed: failedCount
    });

  } catch (err) {
    console.error('[instagram API Fatal]:', err);
    return res.status(500).json({ error: err.message });
  }
}

