// api/knowledge-base.js
// Dedicated endpoint for Knowledge Base management
import aiChatHandler from './ai-chat.js';

export default async function handler(req, res) {
  req.query = req.query || {};
  req.query.route = 'knowledge_base';
  return aiChatHandler(req, res);
}
