// api/github-webhook.js
/**
 * Vercel Serverless Function that receives GitHub webhook POST events.
 * It simply acknowledges the request with a 200 OK JSON response.
 * Extend this handler to trigger custom actions (e.g., invalidate cache, start CI, notify Slack).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  // Vercel automatically parses JSON body when Content-Type is application/json
  const payload = req.body;
  console.log('GitHub webhook received', payload);
  return res.status(200).json({ status: 'ok' });
}
