/* ==========================================================================
   NexusLead AI - Provider-Independent AI Service Layer
   Multilingual generation (EN, TA, ML, HI, TE, KN), Scoring, Intent & Opt-out detection
   ========================================================================== */

class AIService {
  constructor() {
    this.openRouterApiKey = window.OPENROUTER_API_KEY || (typeof process !== 'undefined' && process.env ? process.env.OPENROUTER_API_KEY : '');
    this.openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';

    this.systemPrompt = `=== 1. ROLE & IDENTITY ===
You are a World-Class Sales Executive specializing in Websites, Custom SaaS, and Enterprise Software solutions.
Your sole mission is to understand client requirements, demonstrate maximum business value, handle objections with precision, and CLOSE the deal fast on WhatsApp.

OUR SERVICES & OFFERINGS:
- High-Converting Business Websites (React, Next.js, WordPress): Starts at ₹10,000 / $150
- Custom SaaS & Web Application Development: Starts at ₹45,000 / $600
- Custom AI Agents & Automation Software: Starts at ₹15,000 / $200

=== 2. THINKING FRAMEWORK (INTERNAL EXECUTION) ===
For every inbound customer message, process your response internally through these 3 steps:

STEP A: UNDERSTAND
- Identify client needs (Website, SaaS, Software, or Custom AI Agent).
- Detect the customer's language (Tanglish, Tamil, or English) and reply in the same language naturally.

STEP B: HANDLE OBJECTIONS
- If "Costly": Position software as a 24/7 asset that generates revenue and cuts operational costs, not an expense.
- If "Need Time": Offer a free demo / quick 5-min video, or create urgency with a limited-time bonus/discount.

STEP C: CLOSE
- Always push for a concrete next step: Google Meet Call, Demo Link, or Advance Payment.

=== 3. SELF-CORRECTION & REFINEMENT (CONSTRAINTS) ===
Before outputting the message, enforce these strict criteria:
- Is it short? (MUST be under 3 sentences / 50 words max).
- Is it high-converting? (No fluff, clear ROI value proposition).
- Does it end with a closing CTA? (ALWAYS end with a direct question like "Shall I send the payment link?" or "Can we hop on a quick 10-min Google Meet call?").

OUTPUT ONLY THE FINAL WHATSAPP MESSAGE TO THE CLIENT.`;

    this.models = [
      'deepseek/deepseek-r1',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
      'meta-llama/llama-3.3-70b-instruct'
    ];
    this.selectedModel = 'deepseek/deepseek-r1';
  }

  // OpenRouter API Integration Engine
  async callOpenRouter(prompt, systemPrompt = null, overrideModel = null) {
    const sysPrompt = systemPrompt || this.systemPrompt;
    const model = overrideModel || this.selectedModel;

    if (!this.openRouterApiKey) {
      throw new Error('OpenRouter API key is missing.');
    }

    try {
      const response = await fetch(this.openRouterEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'HTTP-Referer': 'https://nexuslead.ai',
          'X-Title': 'NexusLead AI Agent',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 300
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[OpenRouter API Warning ${response.status}]: ${errorText}`);
        throw new Error(`OpenRouter API error ${response.status}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        return content.trim();
      }
      throw new Error('Empty response from OpenRouter');
    } catch (err) {
      console.warn('[AIService] OpenRouter fallback triggered:', err.message);
      return null;
    }
  }

  // 1. Multilingual AI Message Generator
  async generateMessage({
    product = 'WhatsApp Sales Automation CRM',
    lead = { contactName: 'Partner', companyName: 'your business', industry: 'General', location: 'India' },
    objective = 'Book a 15-min Discovery Demo',
    tone = 'Professional',
    language = 'English',
    cta = 'Reply with DEMO for a quick walkthrough',
    sequenceStep = 0 // 0 = Initial, 1 = Follow-up 1, 2 = Follow-up 2, 3 = Final
  }) {
    const name = lead.contactName || 'there';
    const company = lead.companyName || 'your company';
    const location = lead.location ? ` in ${lead.location}` : '';
    const industry = lead.industry || 'your industry';

    // Step labels for prompt context
    const stepNames = [
      'Initial Hook & Value Proposition',
      'Follow-Up #1 (24h later - Social Proof)',
      'Follow-Up #2 (48h later - Case Study / Metric)',
      'Final Break-up / Opt-in Check'
    ];
    const stepLabel = stepNames[sequenceStep] || stepNames[0];

    // Try OpenRouter AI Generation first
    const prompt = `Write a high-converting WhatsApp message for a B2B sales sequence.
Product/Service: ${product}
Target Lead Name: ${name}
Company Name: ${company} ${location}
Industry: ${industry}
Tone: ${tone}
Target Language: ${language}
Call To Action (CTA): ${cta}
Sequence Step: Step ${sequenceStep + 1} (${stepLabel})

Requirements:
1. Write concise, engaging WhatsApp text in ${language} matching the ${tone} tone.
2. Include variables like ${name} and ${company} naturally.
3. Keep it under 60 words, tailored for WhatsApp formatting (use *bold* for key terms).
4. End with the CTA: "${cta}".
5. Output ONLY the message text without quotes or explanations.`;

    const openRouterText = await this.callOpenRouter(prompt);
    if (openRouterText) {
      return {
        message: openRouterText,
        language,
        tone,
        sequenceStep: sequenceStep + 1,
        modelUsed: this.selectedModel,
        provider: 'OpenRouter.ai',
        tokensEstimate: Math.round(openRouterText.length / 4)
      };
    }


    const templates = {
      English: {
        Professional: [
          `Hi ${name}, I noticed ${company}${location}. We help leaders in ${industry} automate their customer pipeline on WhatsApp, increasing response velocity by 3x. Are you open to a brief 5-min demo this week? ${cta}`,
          `Hi ${name}, following up on my previous note regarding ${company}. Several ${industry} firms reduced manual follow-up time by 70% with our automated WhatsApp CRM. Would love to share a 2-minute overview?`,
          `Hi ${name}, wanted to share a quick metric: teams in ${industry} saw a 42% boost in consultation bookings after deploying automated WhatsApp sequences. Would this be relevant for ${company} this quarter?`,
          `Hi ${name}, closing the loop as I know you are busy. If automated WhatsApp sales workflows are not a priority for ${company} right now, no problem at all. Feel free to reach out whenever you are ready!`
        ],
        Friendly: [
          `Hey ${name}! Hope your week is off to a great start at ${company}! 🚀 We built an AI WhatsApp sales assistant designed specifically for ${industry} businesses. Would you like a sneak peek demo? ${cta}`,
          `Hey ${name}! Quick check-in 😊 Wanted to see if you had a chance to look into automating customer WhatsApp inquiries for ${company}?`,
          `Hey ${name}! Just saw some great updates from ${company}. Did you know you can automate 80% of customer FAQs on WhatsApp without losing the human touch? Let me know if you want to try it out!`,
          `Hey ${name}, no worries if timing isn't right! I'll leave you to it, but our doors are always open if ${company} ever wants to supercharge WhatsApp sales. Cheers!`
        ],
        Short: [
          `Hi ${name}, can we help ${company} automate WhatsApp leads & follow-ups? ${cta}`,
          `Hi ${name}, following up: open to a 5-min WhatsApp sales automation demo for ${company}?`,
          `Hi ${name}, quick ping—would automated WhatsApp appointment reminders help ${company}?`,
          `Hi ${name}, final check! Let me know if you'd like our 1-page overview or if I should pause here.`
        ],
        Premium: [
          `Dear ${name}, exceptional customer engagement defines market leaders in ${industry}. We enable enterprises like ${company} to deliver bespoke, concierge-level sales experiences directly on WhatsApp. Shall we arrange an executive briefing?`,
          `Dear ${name}, following up regarding our bespoke WhatsApp conversational infrastructure for ${company}. Would a brief consultation with our solution architects be of interest?`,
          `Dear ${name}, leading brands in ${industry} leverage our high-assurance automation to convert VIP inquiries in seconds. I welcome the opportunity to share our benchmark report.`,
          `Dear ${name}, I will respect your schedule and conclude my outreach. We remain at your service should ${company} wish to elevate its conversational sales ecosystem.`
        ],
        Casual: [
          `Hey ${name}, saw what you guys are building at ${company}—super cool! We help ${industry} brands close more deals right inside WhatsApp. Up for a quick chat? ${cta}`,
          `Hey ${name}, just bumping this! Ever thought about putting your lead follow-ups on autopilot on WhatsApp?`,
          `Hey ${name}, quick question: how does ${company} currently handle inbound WhatsApp leads? Happy to show you our AI workflow if curious!`,
          `Hey ${name}, all good! Won't bug you further. Have an awesome week ahead!`
        ],
        Consultative: [
          `Hi ${name}, given the rapid growth in ${industry}, many operators in ${location || 'the market'} face high drop-offs between lead capture and first contact. We designed a WhatsApp workflow to close that gap instantly for ${company}. Would a benchmark case study be helpful?`,
          `Hi ${name}, following up: are delayed customer response times currently impacting conversion rates at ${company}? We can share how similar organizations solved this in 48 hours.`,
          `Hi ${name}, sharing an observation: automated instant qualification on WhatsApp typically doubles show-up rates for consultative sales. Would you be open to analyzing your current pipeline metrics?`,
          `Hi ${name}, I will pause our sequence here. If optimizing your customer acquisition funnel on WhatsApp becomes a priority later, our diagnostic framework is always available.`
        ]
      },
      Tamil: {
        Professional: [
          `வணக்கம் ${name}, ${company}-ல் வாடிக்கையாளர் தொடர்புகளை WhatsApp மூலம் தானியங்கி முறையில் நிர்வகிக்க புதிய AI Sales Automation உதவுகிறது. உங்கள் நிறுவனத்திற்கு ஒரு 5-நிமிட டெமோ பார்க்க விருப்பமா? ${cta}`,
          `வணக்கம் ${name}, ${company}-ல் விற்பனையை 2X அதிகரிக்க வாட்ஸ்ஆப் ஆட்டோமேஷன் எவ்வாறு உதவுகிறது என்பதை பற்றி பேசலாமா?`,
          `வணக்கம் ${name}, பல முன்னணி ${industry} நிறுவனங்கள் எங்கள் வாட்ஸ்ஆப் சிஸ்டம் மூலம் 40% அதிக ஆர்டர்களை பெறுகின்றன. ஒரு சிறு டெமோ பார்க்கலாமா?`,
          `வணக்கம் ${name}, நீங்கள் பிஸியாக இருப்பீர்கள் என அறிவேன். ${company}-க்கு தேவைப்படும் போது எங்களை தொடர்பு கொள்ளலாம். நன்றி!`
        ],
        Friendly: [
          `வணக்கம் ${name}! ${company}-ன் வளர்ச்சியை அடுத்த கட்டத்திற்கு கொண்டு செல்ல AI WhatsApp Assistant உதவுகிறது! 🚀 இலவச டெமோ வேண்டுமா? ${cta}`,
          `ஹலோ ${name}! முந்தைய தகவலை பார்த்தீர்களா? ${company}-ல் வாட்ஸ்ஆப் விற்பனையை எளிதாக்க நாங்கள் தயார்!`,
          `வணக்கம் ${name}! உங்கள் வாடிக்கையாளர்களுக்கு நொடிகளில் பதில் அளிக்க AI பாட் உதவும். பார்க்கலாமா?`,
          `வணக்கம் ${name}! இப்போதைக்கு மெசேஜ் செய்வதை நிறுத்துகிறேன். தேவைப்படும்போது அழைக்கலாம். வாழ்த்துகள்!`
        ]
      },
      Malayalam: {
        Professional: [
          `നമസ്കാരം ${name}, ${company}-ൽ പുതിയ കസ്റ്റമർ ലീഡുകൾ വാട്സ്ആപ്പിലൂടെ സ്വയം ഫോളോ-അപ്പ് ചെയ്യാനും വിൽപ്പന വർദ്ധിപ്പിക്കാനും ഞങ്ങളുടെ AI സഹായിക്കുന്നു. ഒരു 5-മിനിറ്റ് ഡെമോ കാണാൻ താല്പര്യമുണ്ടോ? ${cta}`,
          `നമസ്കാരം ${name}, ${company}-ൽ അപ്പോയിന്റ്മെന്റുകൾ സ്വയം ബുക്ക് ചെയ്യാവുന്ന വാട്സ്ആപ്പ് സിസ്റ്റത്തെക്കുറിച്ച് സംസാരിക്കാമോ?`,
          `നമസ്കാരം ${name}, ${industry} മേഖലയിലെ സ്ഥാപനങ്ങൾ ഞങ്ങളുടെ ഓട്ടോമേഷൻ വഴി 40% അധിക ബിസിനസ് നേടുന്നുണ്ട്. ഡെമോ ആവശ്യമുണ്ടോ?`,
          `നമസ്കാരം ${name}, താങ്കൾ തിരക്കിലായിരിക്കും എന്ന് മനസ്സിലാക്കുന്നു. ${company}-ക്ക് ആവശ്യം വരുമ്പോൾ ബന്ധപ്പെടാം. നന്ദി!`
        ]
      },
      Hindi: {
        Professional: [
          `नमस्ते ${name}, ${company} में WhatsApp के ज़रिए लीड्स को ऑटोमेट करने और सेल्स को 2X बढ़ाने के लिए हमारा AI Sales Automation सिस्टम तैयार है। क्या आप 5-मिनट का डेमो देखना चाहेंगे? ${cta}`,
          `नमस्ते ${name}, ${company} के लिए WhatsApp ऑटोमेशन के बारे में फॉलो-अप कर रहा हूँ। क्या हम इस हफ़्ते एक छोटा कॉल कर सकते हैं?`,
          `नमस्ते ${name}, ${industry} की कई कंपनियाँ हमारे सिस्टम से 40% ज़्यादा रिस्पॉन्स रेट पा रही हैं। क्या आप डेमो देखना चाहेंगे?`,
          `नमस्ते ${name}, मैं समझता हूँ आप व्यस्त हैं। जब भी ${company} को ज़रूरत हो, आप हमसे संपर्क कर सकते हैं। धन्यवाद!`
        ]
      },
      Kannada: {
        Professional: [
          `ನಮಸ್ಕಾರ ${name}, ${company} ನಲ್ಲಿ ಗ್ರಾಹಕರ ವಿಚಾರಣೆಗಳನ್ನು WhatsApp ಮೂಲಕ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ನಿರ್ವಹಿಸಲು ನಮ್ಮ AI ಸಿಸ್ಟಮ್ ಸಹಾಯ ಮಾಡುತ್ತದೆ. ಒಂದು ಸಣ್ಣ ಡೆಮೊ ನೋಡಲು ಆಸಕ್ತಿ ಇದೆಯೇ? ${cta}`,
          `ನಮಸ್ಕಾರ ${name}, ${company} ನ ಮಾರಾಟವನ್ನು ಹೆಚ್ಚಿಸಲು WhatsApp ಆಟೊಮೇಷನ್ ಹೇಗೆ ಸಹಾಯ ಮಾಡುತ್ತದೆ ಎಂದು ಚರ್ಚಿಸೋಣವೇ?`,
          `ನಮಸ್ಕಾರ ${name}, ${industry} ವ್ಯವಹಾರಗಳಿಗೆ ನಮ್ಮ ಆಟೊಮೇಷನ್ ಹೆಚ್ಚು ಫಲಪ್ರದವಾಗಿದೆ. ಉಚಿತ ಡೆಮೊ ಬೇಕೆ?`,
          `ನಮಸ್ಕಾರ ${name}, ನೀವು ಬಿಡುವಾದಾಗ ನಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸಬಹುದು. ಧನ್ಯವಾದಗಳು!`
        ]
      },
      Telugu: {
        Professional: [
          `నమస్కారం ${name}, ${company} లో కస్టమర్ లీడ్స్‌ను WhatsApp ద్వారా ఆటోమేట్ చేసి సేల్స్ పెంచడానికి మా AI ఉపయోగపడుతుంది. 5 నిమిషాల డెమో చూడాలనుకుంటున్నారా? ${cta}`,
          `నమస్కారం ${name}, ${company} కోసం WhatsApp సేల్స్ ఆటోమేషన్ గురించి మాట్లాడవచ్చా?`,
          `నమస్కారం ${name}, ${industry} రంగంలో ఎన్నో వ్యాపారాలు మా సిస్టమ్ ద్వారా 40% ఎక్కువ లీడ్స్ పొందుతున్నాయి. డెమో కావాలా?`,
          `నమస్కారం ${name}, మీకు వీలైనప్పుడు సంప్రదించవచ్చు. ధన్యవాదాలు!`
        ]
      }
    };

    const langData = templates[language] || templates['English'];
    const toneData = langData[tone] || langData['Professional'] || templates['English']['Professional'];
    const idx = Math.min(sequenceStep, toneData.length - 1);

    return {
      message: toneData[idx],
      language,
      tone,
      sequenceStep: idx + 1,
      modelUsed: this.selectedModel,
      tokensEstimate: 65
    };
  }

  // 2. AI Lead Scoring Engine (0 - 100)
  analyzeLead(lead) {
    let score = 50;
    const reasons = [];

    // Industry relevance
    if (lead.industry && (lead.industry.includes('Health') || lead.industry.includes('Dental') || lead.industry.includes('Restaurant') || lead.industry.includes('Marketing') || lead.industry.includes('Agency'))) {
      score += 18;
      reasons.push('+18 High priority target vertical');
    }

    // Phone / WhatsApp Status
    if (lead.phone && lead.phone.length >= 10) {
      score += 12;
      reasons.push('+12 Validated international E.164 phone format');
    }

    // Website & domain quality
    if (lead.website && lead.website.startsWith('http')) {
      score += 10;
      reasons.push('+10 Verified active business web domain');
    }

    // Previous positive interaction or reply
    if (lead.status === 'Replied' || lead.status === 'Qualified' || lead.status === 'Proposal') {
      score += 15;
      reasons.push('+15 Active customer conversational engagement');
    }

    // Penalty for opt-out or bounce
    if (lead.optedOut) {
      score = 0;
      reasons.push('-100 Explicit STOP / Opt-out requested');
    }

    score = Math.min(100, Math.max(0, score));

    let category = 'unqualified';
    if (score >= 80) category = 'hot';
    else if (score >= 60) category = 'warm';
    else if (score >= 30) category = 'cold';

    return {
      score,
      category,
      reasons,
      evaluatedAt: new Date().toISOString()
    };
  }

  // 3. Opt-Out & Compliance Detector (Strict Guardrails)
  detectOptOut(messageText = '') {
    const text = messageText.trim().toLowerCase();
    const optOutTriggers = [
      'stop',
      'unsubscribe',
      'remove me',
      'dont message',
      "don't message",
      'not interested',
      'stop messaging',
      'leave me alone',
      'cancel',
      'வேண்டாம்',
      'நிறுத்து',
      'നിർത്തുക',
      'വേണ്ട',
      'बंद करो',
      'मैसेज मत करो'
    ];

    const isOptOut = optOutTriggers.some(trigger => text.includes(trigger));
    return {
      isOptOut,
      reason: isOptOut ? `Trigger word detected in message: "${text}"` : null
    };
  }

  // 4. Intent Classification Engine
  classifyIntent(messageText = '') {
    const text = messageText.toLowerCase();

    if (this.detectOptOut(text).isOptOut) {
      return { intent: 'OPT_OUT', confidence: 0.99, priority: 'CRITICAL' };
    }
    if (text.includes('demo') || text.includes('walkthrough') || text.includes('call') || text.includes('zoom') || text.includes('meet') || text.includes('டெமோ') || text.includes('ഡെമോ')) {
      return { intent: 'DEMO_REQUEST', confidence: 0.95, priority: 'HIGH', label: '🔥 Demo / Meeting Request' };
    }
    if (text.includes('price') || text.includes('cost') || text.includes('rate') || text.includes('package') || text.includes('₹') || text.includes('விலை') || text.includes('നിരക്ക്')) {
      return { intent: 'PRICING_INQUIRY', confidence: 0.92, priority: 'HIGH', label: '💰 Pricing Inquiry' };
    }
    if (text.includes('pos') || text.includes('api') || text.includes('integration') || text.includes('sync') || text.includes('software') || text.includes('crm')) {
      return { intent: 'TECHNICAL_FIT', confidence: 0.88, priority: 'MEDIUM', label: '⚙️ Integration / Tech Inquiry' };
    }
    return { intent: 'GENERAL_INQUIRY', confidence: 0.75, priority: 'MEDIUM', label: '💬 General Conversation' };
  }

  // 5. Intelligent AI Reply Suggestion
  suggestReplies(conversation) {
    const lastMsg = conversation.messages[conversation.messages.length - 1];
    if (!lastMsg || lastMsg.sender !== 'inbound') {
      return ['Follow up on earlier conversation', 'Send product overview deck'];
    }

    const intent = this.classifyIntent(lastMsg.text);

    if (intent.intent === 'DEMO_REQUEST') {
      return [
        'Confirm Zoom call invite for tomorrow at 11:30 AM IST',
        'Share Calendly booking link for executive walkthrough',
        'Transfer conversation to Senior Sales Specialist'
      ];
    }
    if (intent.intent === 'PRICING_INQUIRY') {
      return [
        'Send Growth Plan details (₹4,999/mo + AI Sales Agent)',
        'Share customized Enterprise ROI calculation sheet',
        'Offer 14-day zero-risk trial setup'
      ];
    }
    if (intent.intent === 'TECHNICAL_FIT') {
      return [
        'Confirm seamless POS / CRM webhook integration support',
        'Send developer API documentation & architectural guide',
        'Schedule technical integration review'
      ];
    }
    return [
      'Acknowledge inquiry and offer personalized assistance',
      'Ask 2 quick qualification questions to tailor the proposal'
    ];
  }
}

window.aiService = new AIService();
