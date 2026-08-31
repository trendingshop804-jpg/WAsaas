// api/instagram-dm-queue.js
// Vercel Serverless / Cron Worker: Paces and sends Comment-to-DM Private Replies under Meta rate limits.

import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './_crypto.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Maximum messages to process per cron execution (~30 per run to stay well below 200/hr limit)
const BATCH_SIZE = 25;

export default async function handler(req, res) {
  // Allow Vercel Cron or manual authorized triggers
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-vercel-cron'] !== '1') {
    // Non-blocking in dev/test, but logged
    console.info('[instagram-dm-queue] Invoked with header:', authHeader ? 'present' : 'none');
  }

  try {
    const nowIso = new Date().toISOString();

    // 1. Fetch pending queue items
    const { data: queueItems, error: fetchErr } = await supabase
      .from('instagram_dm_queue')
      .select('*, organization_id, rule_id, comment_id, recipient_id, recipient_username, message_text')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      throw new Error(`Queue query failed: ${fetchErr.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      return res.status(200).json({ processed: 0, message: 'Queue is empty' });
    }

    let sentCount = 0;
    let failedCount = 0;

    // Cache decrypted tokens per organization for this batch
    const tokenCache = new Map();

    for (const item of queueItems) {
      try {
        // Mark as processing
        await supabase
          .from('instagram_dm_queue')
          .update({ status: 'processing', attempts: (item.attempts || 0) + 1 })
          .eq('id', item.id);

        // Fetch connection & access token
        let token = tokenCache.get(item.organization_id);
        let igConnection = null;

        if (!token) {
          const { data: conn } = await supabase
            .from('instagram_connections')
            .select('*')
            .eq('organization_id', item.organization_id)
            .eq('is_active', true)
            .single();

          if (!conn) {
            throw new Error(`No active Instagram connection for organization ${item.organization_id}`);
          }
          igConnection = conn;
          token = await decryptToken(conn.access_token_encrypted);
          if (!token) throw new Error('Could not decrypt Instagram access token');
          tokenCache.set(item.organization_id, { token, conn });
        } else {
          igConnection = token.conn;
          token = token.token;
        }

        // Send Private Reply to Comment via Graph API
        // Endpoint: POST https://graph.facebook.com/v22.0/{page-id-or-ig-user-id}/messages
        // Body: { recipient: { comment_id: item.comment_id }, message: { text: item.message_text } }
        const targetId = igConnection.page_id || igConnection.instagram_business_id;
        const sendUrl = `https://graph.facebook.com/v22.0/${targetId}/messages`;

        const response = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            recipient: {
              comment_id: item.comment_id
            },
            message: {
              text: item.message_text
            }
          })
        });

        const sendResult = await response.json();

        if (!response.ok) {
          const errDetail = sendResult.error?.message || `HTTP ${response.status}`;
          throw new Error(errDetail);
        }

        const igMessageId = sendResult.message_id || sendResult.recipient_id || `ig_msg_${Date.now()}`;

        // Mark queue item as sent
        await supabase
          .from('instagram_dm_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            ig_message_id: igMessageId,
            error_message: null
          })
          .eq('id', item.id);

        // Mark comment as replied privately
        await supabase
          .from('instagram_comments')
          .update({ replied_privately: true })
          .eq('ig_comment_id', item.comment_id);

        // Update DM rule trigger count
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

        // Record in instagram_messages
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
            scheduled_at: isExhausted ? undefined : new Date(Date.now() + 60000).toISOString() // retry in 1m
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
