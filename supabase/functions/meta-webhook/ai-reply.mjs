const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'for', 'how', 'i', 'in', 'is', 'it', 'me',
  'my', 'of', 'on', 'the', 'this', 'to', 'we', 'what', 'with', 'you', 'your'
]);

const GENERIC_REPLIES = [
  'hi thanks for getting in touch how can i help you today',
  'thanks for asking i can share the right pricing once i understand what you need what are you looking to achieve'
];

const INTENT_TERMS = {
  greeting: ['hello', 'hey', 'hi'],
  website: ['ecommerce', 'landing', 'web', 'website'],
  seo: ['google', 'ranking', 'search engine', 'seo'],
  digital_marketing: ['ads', 'campaign', 'digital marketing', 'facebook marketing', 'instagram marketing', 'marketing'],
  pricing: ['cost', 'how much', 'package', 'price', 'pricing', 'quote', 'rate']
};

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function terms(value) {
  return normalize(value).split(/\s+/).filter(word => word.length >= 2 && !STOP_WORDS.has(word));
}

function includesAny(text, candidates) {
  return candidates.some(candidate => text.includes(candidate));
}

export function chronologicalHistory(history, limit = 20) {
  return [...(history || [])]
    .sort((left, right) => new Date(left.received_at || left.created_at || 0).getTime() - new Date(right.received_at || right.created_at || 0).getTime())
    .slice(-limit);
}

export function detectIntent(userMessage, history = []) {
  const current = normalize(userMessage);
  const recentContext = normalize(chronologicalHistory(history, 8).map(message => message.body || message.content || '').join(' '));
  const hasPricing = includesAny(current, INTENT_TERMS.pricing);
  const hasWebsite = includesAny(current, INTENT_TERMS.website) || (hasPricing && includesAny(recentContext, INTENT_TERMS.website));

  if (hasPricing && hasWebsite) return 'website_pricing';
  if (hasPricing) return 'pricing';
  if (includesAny(current, INTENT_TERMS.seo)) return 'seo';
  if (includesAny(current, INTENT_TERMS.digital_marketing)) return 'digital_marketing';
  if (hasWebsite) return 'website';
  if (includesAny(current, INTENT_TERMS.greeting)) return 'greeting';
  return 'unknown';
}

function entryText(entry) {
  const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
  return normalize([entry.title, entry.category, entry.content, ...keywords].join(' '));
}

export function selectKnowledge(entries, userMessage, history = []) {
  const intent = detectIntent(userMessage, history);
  const currentTerms = terms(userMessage);
  const contextTerms = terms(chronologicalHistory(history, 8).map(message => message.body || message.content || '').join(' '));
  const intentKeywords = intent === 'website_pricing'
    ? [...INTENT_TERMS.website, ...INTENT_TERMS.pricing]
    : (INTENT_TERMS[intent] || []);

  return (entries || []).map(entry => {
    const searchable = entryText(entry);
    let score = currentTerms.reduce((total, word) => total + (searchable.includes(word) ? 5 : 0), 0);
    score += contextTerms.reduce((total, word) => total + (searchable.includes(word) ? 1 : 0), 0);
    score += intentKeywords.reduce((total, phrase) => total + (searchable.includes(phrase) ? 3 : 0), 0);
    if (intent.includes('pricing') && normalize(entry.category) === 'pricing') score += 8;
    if (intent === 'greeting' && ['company', 'general'].includes(normalize(entry.category))) score += 5;
    return { entry, score };
  })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(candidate => candidate.entry);
}

export function missingInformationReply(intent) {
  if (intent === 'website_pricing' || intent === 'pricing') {
    return "I don't have a verified price for that yet. Which service or package would you like pricing for?";
  }
  if (intent === 'website') {
    return "I don't have enough verified website information to answer that yet. Which type of website do you need?";
  }
  if (intent === 'seo') {
    return "I don't have verified SEO information for that yet. Which SEO goal would you like help with?";
  }
  if (intent === 'digital_marketing') {
    return "I don't have verified digital marketing information for that yet. Which channel or goal are you asking about?";
  }
  return "I don't have verified information for that yet. Could you clarify what you'd like to know?";
}

export function isUnsafeRepeatedReply(reply, history = [], intent = 'unknown') {
  const normalizedReply = normalize(reply);
  if (!normalizedReply) return true;
  if (GENERIC_REPLIES.includes(normalizedReply)) return true;
  if (intent !== 'greeting' && /^(hi|hello|hey)\b/.test(normalizedReply)) return true;

  return chronologicalHistory(history, 20)
    .filter(message => message.direction === 'outbound')
    .some(message => normalize(message.body || message.content) === normalizedReply);
}

export async function decideAutoReply({ agent, knowledge, history, userMessage, provider }) {
  const orderedHistory = chronologicalHistory(history, 20);
  const intent = detectIntent(userMessage, orderedHistory);
  const sources = selectKnowledge(knowledge, userMessage, orderedHistory);
  const sourceSummary = sources.map(source => ({ id: source.id || null, title: source.title }));

  if (sources.length === 0) {
    return {
      shouldSend: true,
      reply: missingInformationReply(intent),
      replyKind: 'clarification',
      providerOutcome: 'not_called',
      fallbackReason: 'knowledge_not_found',
      intent,
      sources: sourceSummary
    };
  }

  let providerResult;
  try {
    providerResult = await provider({ agent, sources, history: orderedHistory, userMessage, intent });
  } catch (error) {
    providerResult = { ok: false, outcome: 'exception', errorCode: error?.code || 'PROVIDER_EXCEPTION' };
  }

  if (!providerResult?.ok || !String(providerResult.text || '').trim()) {
    return {
      shouldSend: false,
      reply: '',
      replyKind: 'none',
      providerOutcome: providerResult?.outcome || 'failed',
      providerErrorCode: providerResult?.errorCode || null,
      fallbackReason: 'provider_failed',
      intent,
      sources: sourceSummary
    };
  }

  const reply = String(providerResult.text).trim();
  if (isUnsafeRepeatedReply(reply, orderedHistory, intent)) {
    return {
      shouldSend: false,
      reply: '',
      replyKind: 'none',
      providerOutcome: providerResult.outcome || 'success',
      fallbackReason: 'unsafe_or_repeated_reply',
      intent,
      sources: sourceSummary
    };
  }

  return {
    shouldSend: true,
    reply,
    replyKind: 'ai',
    providerOutcome: providerResult.outcome || 'success',
    fallbackReason: null,
    intent,
    sources: sourceSummary
  };
}
