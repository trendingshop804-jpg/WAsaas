// api/meta-webhook.js
/**
 * Vercel Serverless Function handling Meta webhook verification (GET) and
 * incoming WhatsApp messages (POST). No extra dependencies are used.
 */
export default async function handler(req, res) {
  // ---------------------------------------------------------------
  // GET verification (Meta subscription verification)
  // ---------------------------------------------------------------
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // ---------------------------------------------------------------
  // POST handling – incoming WhatsApp events
  // ---------------------------------------------------------------
  if (req.method === 'POST') {
    // Vercel automatically parses JSON bodies when Content-Type is application/json
    const payload = req.body;
    console.log('Meta webhook received payload:', payload);
    return res.status(200).json({ received: true });
  }

  // ---------------------------------------------------------------
  // Any other HTTP method
  // ---------------------------------------------------------------
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
