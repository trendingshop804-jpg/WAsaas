// api/github-webhook.js
/**
 * Vercel Serverless Function that receives webhook events.
 * Handles:
 *   - GET verification for services like Meta (hub.mode, hub.verify_token, hub.challenge)
 *   - POST for GitHub webhook (currently acknowledges receipt)
 */
export default async function handler(req, res) {
  // GET verification (e.g., Meta webhook)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Forbidden');
    }
  }

  // POST handling (GitHub webhook)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vercel automatically parses JSON bodies when Content-Type is application/json
  const payload = req.body;
  console.log('GitHub webhook received', payload);

  // Minimal acknowledgment
  return res.status(200).json({ status: 'ok' });
}
