// api/instagram-publish.js
// Vercel Serverless / Cron Worker: Automates Feed Post, Reel, Story, and Carousel publishing on Instagram Graph API.

import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './_crypto.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Poll container status endpoint until FINISHED or ERROR
async function pollContainerStatus(containerId, accessToken, maxAttempts = 15, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`https://graph.facebook.com/v22.0/${containerId}?fields=status_code,status&access_token=${accessToken}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Container status poll error: ${data.error?.message || res.status}`);
    }

    const statusCode = data.status_code; // 'FINISHED', 'IN_PROGRESS', 'EXPIRED', 'ERROR'
    console.log(`[instagram-publish] Container ${containerId} status: ${statusCode} (attempt ${attempt}/${maxAttempts})`);

    if (statusCode === 'FINISHED') {
      return true;
    }
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Media container processing failed with status: ${statusCode}`);
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('Media container processing timed out');
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const nowIso = new Date().toISOString();

    // 1. Fetch pending posts scheduled up to now
    const { data: posts, error: fetchErr } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_time', nowIso)
      .order('scheduled_time', { ascending: true })
      .limit(10);

    if (fetchErr) {
      throw new Error(`Scheduled posts query failed: ${fetchErr.message}`);
    }

    if (!posts || posts.length === 0) {
      return res.status(200).json({ processed: 0, message: 'No pending posts due for publishing' });
    }

    let publishedCount = 0;
    let failedCount = 0;

    for (const post of posts) {
      try {
        // Mark post as processing
        await supabase
          .from('scheduled_posts')
          .update({ status: 'processing' })
          .eq('id', post.id);

        // Fetch connection & access token
        const { data: conn, error: connErr } = await supabase
          .from('instagram_connections')
          .select('*')
          .eq('organization_id', post.organization_id)
          .eq('is_active', true)
          .single();

        if (connErr || !conn) {
          throw new Error(`No active Instagram connection found for workspace ${post.organization_id}`);
        }

        const token = await decryptToken(conn.access_token_encrypted);
        if (!token) throw new Error('Could not decrypt Instagram access token');

        const igUserId = conn.instagram_business_id;
        const postType = (post.post_type || 'post').toLowerCase();
        const mediaUrls = Array.isArray(post.media_urls) ? post.media_urls : [post.media_urls];
        const primaryMedia = mediaUrls[0];

        if (!primaryMedia) {
          throw new Error('Post does not contain any media URL');
        }

        let containerId = null;

        // Step 1: Create Media Container
        if (postType === 'reel') {
          // Reel: video_url, media_type: REELS, caption
          const containerRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              media_type: 'REELS',
              video_url: primaryMedia,
              caption: post.caption || '',
              access_token: token
            })
          });
          const containerData = await containerRes.json();
          if (!containerRes.ok) throw new Error(containerData.error?.message || 'Reel container creation failed');
          containerId = containerData.id;

          // Poll until video processing is finished
          await pollContainerStatus(containerId, token, 20, 3000);

        } else if (postType === 'story') {
          // Story: image_url or video_url, media_type: STORIES
          const isVideo = primaryMedia.endsWith('.mp4') || primaryMedia.includes('video');
          const payload = {
            media_type: 'STORIES',
            access_token: token
          };
          if (isVideo) {
            payload.video_url = primaryMedia;
          } else {
            payload.image_url = primaryMedia;
          }

          const containerRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const containerData = await containerRes.json();
          if (!containerRes.ok) throw new Error(containerData.error?.message || 'Story container creation failed');
          containerId = containerData.id;

          if (isVideo) {
            await pollContainerStatus(containerId, token, 15, 3000);
          }

        } else if (postType === 'carousel' && mediaUrls.length > 1) {
          // Carousel: create item containers first, then carousel container
          const itemContainerIds = [];
          for (const itemUrl of mediaUrls) {
            const isVideo = itemUrl.endsWith('.mp4') || itemUrl.includes('video');
            const itemPayload = {
              is_carousel_item: true,
              access_token: token
            };
            if (isVideo) {
              itemPayload.media_type = 'VIDEO';
              itemPayload.video_url = itemUrl;
            } else {
              itemPayload.image_url = itemUrl;
            }

            const itemRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(itemPayload)
            });
            const itemData = await itemRes.json();
            if (!itemRes.ok) throw new Error(itemData.error?.message || 'Carousel item container failed');
            itemContainerIds.push(itemData.id);

            if (isVideo) {
              await pollContainerStatus(itemData.id, token, 15, 3000);
            }
          }

          // Create carousel container
          const carouselRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              media_type: 'CAROUSEL',
              children: itemContainerIds,
              caption: post.caption || '',
              access_token: token
            })
          });
          const carouselData = await carouselRes.json();
          if (!carouselRes.ok) throw new Error(carouselData.error?.message || 'Carousel parent container failed');
          containerId = carouselData.id;

        } else {
          // Standard Single Image / Video Feed Post
          const isVideo = primaryMedia.endsWith('.mp4') || primaryMedia.includes('video');
          const payload = {
            caption: post.caption || '',
            access_token: token
          };
          if (isVideo) {
            payload.media_type = 'VIDEO';
            payload.video_url = primaryMedia;
          } else {
            payload.image_url = primaryMedia;
          }

          const containerRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const containerData = await containerRes.json();
          if (!containerRes.ok) throw new Error(containerData.error?.message || 'Feed post container failed');
          containerId = containerData.id;

          if (isVideo) {
            await pollContainerStatus(containerId, token, 15, 3000);
          }
        }

        // Step 2: Publish Media Container
        const publishRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: token
          })
        });

        const publishData = await publishRes.json();
        if (!publishRes.ok) {
          throw new Error(publishData.error?.message || 'Media publish failed');
        }

        const igPostId = publishData.id || `ig_post_${Date.now()}`;

        // Step 3: Update database status
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
        console.log(`[instagram-publish] Successfully published post ${post.id} (IG ID: ${igPostId})`);

      } catch (err) {
        failedCount++;
        console.error(`[instagram-publish] Error publishing post ${post.id}:`, err.message);

        await supabase
          .from('scheduled_posts')
          .update({
            status: 'failed',
            error_message: err.message
          })
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
