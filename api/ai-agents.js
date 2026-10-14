// api/ai-agents.js
// Dedicated endpoint for AI Reply Agents management
import aiChatHandler from './ai-chat.js';

export default async function handler(req, res) {
  req.query = req.query || {};
  req.query.route = 'ai_agents';
  return aiChatHandler(req, res);
}
