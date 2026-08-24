// api/ai-chat.js — Vercel Serverless Function
// Proxies OpenRouter API calls so the API key stays server-side (never exposed in browser)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API key not configured on server.' });
  }

  try {
    const { model, messages, temperature = 0.7, max_tokens = 300 } = req.body;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nexuslead.ai',
        'X-Title': 'NexusLead AI Agent',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OpenRouter API Error]:', response.status, errText);
      return res.status(response.status).json({ error: `OpenRouter error ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('[ai-chat API Error]:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
