/**
 * api/ai-assistant.js — AI Sales Assistant Engine
 * Intent extraction, FAQ handling, Lead qualification scoring (Hot/Warm/Cold),
 * and Human Handoff triggers.
 */

export function evaluateLeadScore(messageText) {
  const text = (messageText || '').toLowerCase();
  let score = 50;
  let intent = 'General Inquiry';
  let tag = 'Warm';

  if (text.includes('price') || text.includes('cost') || text.includes('how much') || text.includes('rate')) {
    score += 25;
    intent = 'Pricing Inquiry';
  }
  if (text.includes('appointment') || text.includes('book') || text.includes('schedule') || text.includes('today') || text.includes('tomorrow')) {
    score += 35;
    intent = 'High Intent Booking';
    tag = 'Hot';
  }
  if (text.includes('human') || text.includes('agent') || text.includes('speak to manager') || text.includes('urgent') || text.includes('angry')) {
    return { score, intent: 'Escalation', tag: 'Hot', handoffRequired: true, handoffReason: 'Customer requested human support or escalated' };
  }

  if (score >= 80) tag = 'Hot';
  else if (score < 40) tag = 'Cold';

  return { score, intent, tag, handoffRequired: false };
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { message, customerName, serviceType } = req.body || {};
    const evalResult = evaluateLeadScore(message);

    let suggestedReply = `Hello ${customerName || 'there'}! Thank you for reaching out to NextBright CRM. How can we assist you with ${serviceType || 'our services'} today?`;

    if (evalResult.intent === 'Pricing Inquiry') {
      suggestedReply = `Our packages start at ₹1,999/month with full WhatsApp & CRM automation included. Would you like me to share our full pricing brochure or schedule a demo call?`;
    } else if (evalResult.intent === 'High Intent Booking') {
      suggestedReply = `I can help you book an appointment right away! What time slot works best for you today or tomorrow?`;
    }

    return res.json({
      success: true,
      aiAnalysis: {
        score: evalResult.score,
        intent: evalResult.intent,
        tag: evalResult.tag,
        handoffRequired: evalResult.handoffRequired,
        handoffReason: evalResult.handoffReason || null,
        suggestedReply
      }
    });
  }

  return res.json({ success: true, status: 'AI Sales Assistant active' });
}
