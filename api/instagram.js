// api/instagram.js
// Consolidated Vercel Serverless Function for Instagram operations:
// - action=disconnect / DELETE: removes Instagram connection for an organization
// - action=dm-queue: processes pending comment-to-DM queue
// - action=publish (default POST): publishes scheduled feed posts, reels, stories, carousels

import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './_crypto.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DM_QUEUE_BATCH_SIZE = 25;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = (req.query.action || '').toLowerCase();

  // ── 1. DISCONNECT ─────────────────────────────────────────────────────────
  if (req.method === 'DELETE' || action === 'disconnect') {
    try {
      const { organizationId, instagramBusinessId } = req.body || {};
      if (!organizationId) {
        return res.status(400).json({ error: 'organizationId is required' });
      }

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

      console.log(`[Instagram Disconnect] Disconnected Instagram for org ${organizationId}`);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[Instagram Disconnect] Error:', err);
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

  // ── 3. PUBLISH (default POST) ─────────────────────────────────────────────
  try {
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
    console.error('[instagram-publish Fatal]:', err);
    return res.status(500).json({ error: err.message });
  }
}
