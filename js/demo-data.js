/* ==========================================================================
   NexusLead AI - Comprehensive Realistic Demo Data
   Multi-industry B2B leads, WhatsApp conversations, campaigns, workflows & logs
   ========================================================================== */

window.DEMO_DATA = {
  currentOrgId: 'org_nexus_01',
  currentUser: {
    id: 'usr_001',
    name: 'Karthik Raja',
    email: 'karthik@nexuslead.io',
    role: 'Owner',
    avatar: 'KR'
  },
  organizations: [
    {
      id: 'org_nexus_01',
      name: 'NextBright Solutions',
      plan: 'Scale Plan',
      tier: 'scale',
      whatsappConnected: true,
      whatsappNumber: '+91 70123 87015',
      whatsappProvider: 'Meta WhatsApp Business Cloud API (Verified)',
      phoneId: '1016931798166599',
      whatsappToken: 'EAAVpyP3ZC4g0BSeHel0YnEDduQrqZABbZA7ElyCniYBgjVUnZC1a1MwvK64i72GsgZAlOLXw2KohURinIsMmm7nKItgcF2MUbWdRatJ0inN5JGuayc68bVM2a5W73Oli2LQRfnsjZBkfsIvhuYK6vhpa7yEfvJilP7E6U8vHoCiFVtZBbJmDPT9kuQyoXNk',
      wabaId: 'WABA_1016931798166599',
      instagramConnected: true,
      instagramUsername: 'nextbright_solutions',
      instagramBusinessId: '17841405728287316',
      instagramPageId: '102938475612345',
      about: 'Available for demos 9AM-6PM. Book via wa.me/yournumber',
      profilePictureUrl: 'https://i.pravatar.cc/400/?u=waba1',
      industry: 'Digital Marketing & Sales Automation',
      website: 'https://nextbright.io',
      location: 'Kerala, India',
      timezone: 'Asia/Kolkata (IST)',
      creditsUsed: 1420,
      creditsLimit: 10000,
      leadsCount: 1284,
      automationsRunning: 4,
      isPaused: false
    },
    {
      id: 'org_kerala_dental',
      name: 'Malabar Dental Network',
      plan: 'Growth Plan',
      tier: 'growth',
      whatsappConnected: true,
      whatsappNumber: '+91 94471 88990',
      whatsappProvider: 'QR Code Provider (UltraGateway)',
      wabaId: 'QR_SESSION_9918',
      industry: 'Healthcare & Dental Clinic Chain',
      website: 'https://malabardental.in',
      location: 'Kochi, Kerala, India',
      timezone: 'Asia/Kolkata (IST)',
      creditsUsed: 540,
      creditsLimit: 2500,
      leadsCount: 420,
      automationsRunning: 2,
      isPaused: false
    }
  ],

  // Preloaded B2B Leads across various niches
  leads: [],

  // WhatsApp Campaigns
  campaigns: [
    {
      id: 'camp_001',
      name: 'Kerala Dental & Healthcare Outreach',
      status: 'Running', // Draft, Scheduled, Running, Paused, Completed
      connectionId: 'conn_001',
      connectionNumber: '+91 98401 23456',
      templateId: 'tmpl_001',
      templateName: 'healthcare_appointment_intro_v2',
      totalLeads: 85,
      sentCount: 68,
      deliveredCount: 65,
      replyCount: 29,
      qualifiedCount: 16,
      wonCount: 4,
      dailyLimit: 150,
      sendingWindow: '09:30 AM - 06:30 PM IST',
      timezone: 'Asia/Kolkata',
      createdAt: '2026-08-15T09:00:00Z',
      conversionRate: 23.5,
      aiAgentEnabled: true,
      followUpSequenceId: 'seq_001'
    },
    {
      id: 'camp_002',
      name: 'Bangalore F&B Automation Blitz',
      status: 'Running',
      connectionId: 'conn_001',
      connectionNumber: '+91 98401 23456',
      templateId: 'tmpl_002',
      templateName: 'restaurant_table_booking_v1',
      totalLeads: 120,
      sentCount: 94,
      deliveredCount: 91,
      replyCount: 42,
      qualifiedCount: 24,
      wonCount: 7,
      dailyLimit: 200,
      sendingWindow: '10:00 AM - 07:00 PM IST',
      timezone: 'Asia/Kolkata',
      createdAt: '2026-08-14T10:00:00Z',
      conversionRate: 25.5,
      aiAgentEnabled: true,
      followUpSequenceId: 'seq_002'
    },
    {
      id: 'camp_003',
      name: 'Chennai Agency Partnership Q3',
      status: 'Scheduled',
      connectionId: 'conn_001',
      connectionNumber: '+91 98401 23456',
      templateId: 'tmpl_003',
      templateName: 'agency_whitelabel_partnership',
      totalLeads: 60,
      sentCount: 15,
      deliveredCount: 15,
      replyCount: 4,
      qualifiedCount: 2,
      wonCount: 0,
      dailyLimit: 100,
      sendingWindow: '10:30 AM - 05:30 PM IST',
      timezone: 'Asia/Kolkata',
      createdAt: '2026-08-17T12:00:00Z',
      conversionRate: 13.3,
      aiAgentEnabled: true,
      followUpSequenceId: 'seq_001'
    }
  ],

  // Approved WhatsApp Templates
  templates: [
    {
      id: 'tmpl_001',
      name: 'healthcare_appointment_intro_v2',
      category: 'MARKETING',
      language: 'English (en_US)',
      status: 'APPROVED',
      metaStatus: 'Meta Verified',
      body: 'Hi {{first_name}}, noticed {{company_name}} in {{location}}. Are you still handling clinic patient bookings manually? We helped dental clinics increase appointment shows by 40% with automated WhatsApp recalls. Open to a 5-min demo?',
      variables: ['first_name', 'company_name', 'location'],
      quickReplies: ['Yes, send demo', 'Tell me more', 'Not right now']
    },
    {
      id: 'tmpl_002',
      name: 'restaurant_table_booking_v1',
      category: 'MARKETING',
      language: 'English (en_US)',
      status: 'APPROVED',
      metaStatus: 'Meta Verified',
      body: 'Hello {{first_name}}! Loved the dining vibe at {{company_name}}. Did you know direct WhatsApp table reservations can save up to 25% on aggregator fees? Would you like to see how Bangalore restaurants automate VIP bookings?',
      variables: ['first_name', 'company_name'],
      quickReplies: ['Show me how', 'Send pricing', 'Not interested']
    },
    {
      id: 'tmpl_003_ta',
      name: 'tamil_business_intro_ta',
      category: 'MARKETING',
      language: 'Tamil (ta_IN)',
      status: 'APPROVED',
      metaStatus: 'Meta Verified',
      body: 'வணக்கம் {{first_name}}, {{company_name}}-ல் விற்பனையை 2X அதிகரிக்க புதிய AI WhatsApp Sales Automation உதவுகிறது. உங்கள் பிசினசுக்கு ஒரு இலவச டெமோ பார்க்க விரும்புகிறீர்களா?',
      variables: ['first_name', 'company_name'],
      quickReplies: ['ஆம், டெமோ காட்டுங்கள்', 'விவரம் அனுப்புங்கள்']
    },
    {
      id: 'tmpl_004_ml',
      name: 'malayalam_clinic_connect_ml',
      category: 'MARKETING',
      language: 'Malayalam (ml_IN)',
      status: 'APPROVED',
      metaStatus: 'Meta Verified',
      body: 'നമസ്കാരം {{first_name}}, {{company_name}}-ൽ പുതിയ പേഷ്യന്റ് അപ്പോയിന്റ്മെന്റുകൾ വാട്സ്ആപ്പിലൂടെ സ്വയം ബുക്ക് ചെയ്യാൻ സാധിക്കുന്ന പുതിയ AI ഓട്ടോമേഷൻ സിസ്റ്റം ലഭ്യമാണ്. ഡെമോ ആവശ്യമുണ്ടോ?',
      variables: ['first_name', 'company_name'],
      quickReplies: ['അതെ, ഡെമോ കാണണം', 'കൂടുതൽ വിവരങ്ങൾ']
    }
  ],

  // Live WhatsApp Conversations
  conversations: [
    {
      id: 'conv_wa_1',
      leadName: 'WhatsApp Contact (+91705838351)',
      contactName: 'WhatsApp Contact (+91705838351)',
      company: 'Inbound WhatsApp',
      phone: '+91705838351',
      unreadCount: 0,
      mode: 'AI',
      status: 'AI Active',
      lastMessage: '[Inbound WhatsApp Message]',
      lastTimestamp: '2026-08-27T05:49:00.000Z'
    },
    {
      id: 'conv_wa_2',
      leadName: 'WhatsApp Contact (+91999938351)',
      contactName: 'WhatsApp Contact (+91999938351)',
      company: 'Inbound WhatsApp',
      phone: '+91999938351',
      unreadCount: 0,
      mode: 'AI',
      status: 'AI Active',
      lastMessage: 'Test message from PowerShell',
      lastTimestamp: '2026-08-27T21:14:00.000Z'
    },
    {
      id: 'conv_ceo',
      leadId: 'lead_ceo',
      leadName: 'CEO',
      contactName: 'CEO',
      company: 'NEXTBRIGHT SOLUTIONS',
      phone: '8111986637',
      unreadCount: 0,
      mode: 'AI',
      status: 'AI Active',
      lastMessage: 'Hi',
      lastTimestamp: '2026-08-27T08:40:00.000Z',
      aiScore: 62,
      aiSummary: 'Active conversational opportunity.',
      messages: [
        {
          id: 'm_ceo_1',
          direction: 'SYSTEM',
          isSystem: true,
          text: 'Chat thread initialized for CEO',
          timestamp: '2026-08-27T19:40:00.000Z'
        },
        {
          id: 'm_ceo_2',
          direction: 'OUTBOUND',
          isAI: true,
          sentByAi: true,
          text: 'Hi CEO, I noticed NEXTBRIGHT SOLUTIONS in Kochi, Kerala, India. We help leaders in it service automate their customer pipeline on WhatsApp, increasing response velocity by 3x. Are you open to a brief 5-min demo this week? Reply with DEMO for a quick walkthrough',
          timestamp: '2026-08-27T19:44:00.000Z',
          status: 'DELIVERED'
        },
        {
          id: 'm_ceo_3',
          direction: 'OUTBOUND',
          isAI: true,
          sentByAi: true,
          text: 'Hi CEO, I noticed NEXTBRIGHT SOLUTIONS in Kochi, Kerala, India. We help leaders in it service automate their customer pipeline on WhatsApp, increasing response velocity by 3x. Are you open to a brief 5-min demo this week? Reply with DEMO for a quick walkthrough',
          timestamp: '2026-08-27T19:44:00.000Z',
          status: 'DELIVERED'
        },
        {
          id: 'm_ceo_4',
          direction: 'OUTBOUND',
          isAI: true,
          sentByAi: true,
          text: 'https://moviesdatamil.co/download/mahasenha-2025-original-1080p-hd-2-7-gb/',
          timestamp: '2026-08-27T20:17:00.000Z',
          status: 'DELIVERED'
        },
        {
          id: 'm_ceo_5',
          direction: 'SYSTEM',
          isSystem: true,
          text: 'Human Takeover engaged. AI Bot paused.',
          timestamp: '2026-08-27T20:18:00.000Z'
        }
      ]
    },
    {
      id: 'conv_001',
      leadId: 'lead_001',
      leadName: 'Dr. Jacob Mathew',
      contactName: 'Dr. Jacob Mathew',
      company: 'Dr. Jacob Dental & Implant Center',
      phone: '+91 94470 12345',
      unreadCount: 0,
      mode: 'AI',
      status: 'AI Active',
      lastMessage: 'Hi Dr. Jacob Mathew, I noticed Dr. Jac...',
      lastTimestamp: '2026-08-27T18:01:00.000Z',
      messages: [
        {
          id: 'm1',
          sender: 'system',
          text: 'Campaign "Kerala Dental Clinics Outreach" started. Template healthcare_appointment_intro_v2 dispatched.',
          timestamp: '2026-08-26T10:15:00.000Z'
        },
        {
          id: 'm2',
          sender: 'outbound',
          text: 'Hi Dr. Jacob, noticed Dr. Jacob Dental & Implant Center in Kochi. Are you still handling clinic patient bookings manually? We helped dental clinics increase appointment shows by 40% with automated WhatsApp recalls. Open to a 5-min demo?',
          timestamp: '2026-08-26T10:15:00.000Z',
          status: 'READ'
        },
        {
          id: 'm3',
          sender: 'inbound',
          text: 'Hello, yes we currently use front-desk phone calls which takes too much time. What does this software cost and how does it sync with dental appointments?',
          timestamp: '2026-08-26T14:10:00.000Z'
        },
        {
          id: 'm4',
          sender: 'outbound',
          isAI: true,
          text: 'Thanks for reaching out Dr. Jacob! Our AI automatically sends WhatsApp reminder confirmations 24h & 2h before appointments, allowing patients to confirm or reschedule in 1 click. We support standard clinic workflows. Our growth package starts at ₹3,999/mo for up to 3 doctor chairs.',
          timestamp: '2026-08-26T14:11:00.000Z',
          status: 'READ'
        },
        {
          id: 'm5',
          sender: 'inbound',
          text: 'Sounds promising. We have 3 branches in Ernakulam with 6 consulting doctors. Can we see a live demonstration with our team?',
          timestamp: '2026-08-27T14:30:00.000Z'
        },
        {
          id: 'm6',
          sender: 'outbound',
          isAI: true,
          text: 'Sure Doctor Jacob! I can book a 15-min zoom walkthrough tomorrow at 11:30 AM or 3:00 PM. Which works best?',
          timestamp: '2026-08-27T14:32:00.000Z',
          status: 'DELIVERED'
        },
        {
          id: 'm7',
          sender: 'inbound',
          type: 'image',
          mediaUrl: 'https://images.unsplash.com/photo-1629909615957-be38d48fbbe4?w=480&q=80',
          caption: 'Our current clinic reception — you can see the paper-based reminder board 😅',
          timestamp: '2026-08-27T14:35:00.000Z'
        },
        {
          id: 'm8',
          sender: 'outbound',
          type: 'document',
          fileName: 'DentaFlow_Case_Study_Kerala.pdf',
          fileSize: '2.4 MB',
          mediaUrl: '#',
          caption: 'Kerala Dental Case Study — 40% no-show reduction',
          timestamp: '2026-08-27T14:37:00.000Z',
          status: 'READ'
        },
        {
          id: 'm9',
          sender: 'inbound',
          type: 'audio',
          mediaUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          timestamp: '2026-08-27T14:40:00.000Z'
        },
        {
          id: 'm10',
          sender: 'inbound',
          type: 'sticker',
          mediaUrl: 'https://media.giphy.com/media/1n9ogS4ddPMzYULVmJ/giphy.gif',
          timestamp: '2026-08-27T14:41:00.000Z'
        },
        {
          id: 'm11',
          sender: 'inbound',
          type: 'location',
          locationName: 'Jacob Dental Clinic – Ernakulam',
          locationAddress: 'MG Road, Near High Court Junction, Kerala 682016',
          timestamp: '2026-08-27T14:43:00.000Z'
        },
        {
          id: 'm12',
          sender: 'inbound',
          type: 'contact',
          contactName: 'Dr. Jacob Thomas',
          contactPhone: '+91 94470 23456',
          timestamp: '2026-08-27T14:44:00.000Z'
        },
        {
          id: 'm13',
          sender: 'inbound',
          type: 'video',
          mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
          caption: 'Quick tour of our reception setup',
          timestamp: '2026-08-27T14:46:00.000Z'
        }
      ],
      aiSuggestions: [
        'Confirm Zoom call invite for 11:30 AM IST',
        'Send Kerala Dental Case Study PDF',
        'Transfer conversation to Senior Sales Specialist (Ananya)'
      ]
    },
    {
      id: 'conv_002',
      leadId: 'lead_002',
      leadName: 'Rahul Shenoy',
      company: 'Spice Craft Bistro & Brews',
      phone: '+91 98860 55432',
      unreadCount: 1,
      mode: 'HUMAN',
      status: 'Human Active',
      lastMessage: 'We received the proposal document Vikram. Can we do a pilot run this weekend at our Indiranagar outlet?',
      lastTimestamp: '2026-08-27T16:45:00.000Z',
      messages: [
        {
          id: 'm201',
          sender: 'outbound',
          text: 'Hello Rahul! Loved the dining vibe at Spice Craft Bistro & Brews. Did you know direct WhatsApp table reservations can save up to 25% on aggregator fees? Would you like to see how Bangalore restaurants automate VIP bookings?',
          timestamp: '2026-08-17T11:00:00.000Z',
          status: 'READ'
        },
        {
          id: 'm202',
          sender: 'inbound',
          text: 'Interesting! Can it integrate with our Petpooja POS billing system?',
          timestamp: '2026-08-17T11:42:00.000Z'
        },
        {
          id: 'm203',
          sender: 'outbound',
          isAI: true,
          text: 'Yes Rahul! We have direct Petpooja webhook support. Table reservations and VIP billing bills sync in real-time.',
          timestamp: '2026-08-17T11:43:00.000Z',
          status: 'READ'
        },
        {
          id: 'm204',
          sender: 'system',
          text: 'Human Takeover triggered by Vikram Mehta. AI auto-reply paused.',
          timestamp: '2026-08-17T12:00:00.000Z'
        },
        {
          id: 'm205',
          sender: 'outbound',
          text: 'Hi Rahul, Vikram here! Just shared our custom hospitality proposal on your email rahul@spicecraft.in. Let me know if you need any adjustments.',
          timestamp: '2026-08-18T10:30:00.000Z',
          status: 'READ'
        },
        {
          id: 'm206',
          sender: 'inbound',
          text: 'We received the proposal document Vikram. Can we do a pilot run this weekend at our Indiranagar outlet?',
          timestamp: '2026-08-27T16:45:00.000Z'
        }
      ],
      aiSuggestions: [
        'Accept weekend pilot setup on Indiranagar outlet',
        'Send onboarding link for Petpooja API token setup'
      ]
    },
    {
      id: 'conv_004',
      leadId: 'lead_004',
      leadName: 'Vipin Chandran',
      company: 'Sunrise Ayurvedic Resorts',
      phone: '+91 97450 33441',
      unreadCount: 0,
      mode: 'AI',
      status: 'AI Active',
      lastMessage: 'നമസ്കാരം വിപിൻ സർ! വിദേശ സഞ്ചാരികൾക്കായി ഇംഗ്ലീഷിലും ജർമ്മൻ ഭാഷയിലുമുള്ള ഓട്ടോമേറ്റഡ് വാട്സ്ആപ്പ് ബ്രോഷർ അയക്കാം. ഡെമോ നാളെ 10 മണിക്ക് സൗകര്യമാണോ?',
      lastTimestamp: '2026-08-27T17:10:00.000Z',
      messages: [
        {
          id: 'm401',
          sender: 'outbound',
          text: 'നമസ്കാരം Vipin, Sunrise Ayurvedic Resorts-ൽ പുതിയ പേഷ്യന്റ് അപ്പോയിന്റ്മെന്റുകൾ വാട്സ്ആപ്പിലൂടെ സ്വയം ബുക്ക് ചെയ്യാൻ സാധിക്കുന്ന പുതിയ AI ഓട്ടോമേഷൻ സിസ്റ്റം ലഭ്യമാണ്. ഡെമോ ആവശ്യമുണ്ടോ?',
          timestamp: '2026-08-27T16:15:00.000Z',
          status: 'READ'
        },
        {
          id: 'm402',
          sender: 'inbound',
          text: 'ഹലോ, ഞങ്ങൾക്ക് മൺസൂൺ ആയുർവേദ പാക്കേജുകൾക്ക് യൂറോപ്പിൽ നിന്നും ആളുകൾ ബുക്ക് ചെയ്യാറുണ്ട്. അവർക്ക് ഓട്ടോമാറ്റിക് ആയി ബ്രോഷറും നിരക്കുകളും വാട്സ്ആപ്പിൽ കൊടുക്കാൻ പറ്റുമോ?',
          timestamp: '2026-08-27T17:05:00.000Z'
        },
        {
          id: 'm403',
          sender: 'outbound',
          isAI: true,
          text: 'നമസ്കാരം വിപിൻ സർ! വിദേശ സഞ്ചാരികൾക്കായി ഇംഗ്ലീഷിലും ജർമ്മൻ ഭാഷയിലുമുള്ള ഓട്ടോമേറ്റഡ് വാട്സ്ആപ്പ് ബ്രോഷർ അയക്കാം. ഡെമോ നാളെ 10 മണിക്ക് സൗകര്യമാണോ?',
          timestamp: '2026-08-27T17:10:00.000Z',
          status: 'DELIVERED'
        }
      ],
      aiSuggestions: [
        'Send International Tourism brochure template demo',
        'Schedule Malayalam video demonstration'
      ]
    }
  ],

  // Visual Workflow Graphs (Nodes & Connections)
  workflows: [
    {
      id: 'wf_demo_01',
      name: 'AI Lead Ingestion & Smart Follow-Up Engine',
      description: 'Default master workflow: Discovers/Imports lead, AI scores profile, sends personalized WhatsApp, listens for reply, auto-qualifies with AI or executes 3-touch follow-up.',
      status: 'Active',
      triggersCount: 384,
      successRate: 98.4,
      nodes: [
        {
          id: 'node_1',
          type: 'trigger',
          title: 'Day 1 Trigger: New Inbound Lead',
          desc: 'Fires instantly on lead creation / webhook event',
          x: 40,
          y: 60,
          config: { event: 'lead.created' }
        },
        {
          id: 'node_2',
          type: 'ai',
          title: 'Day 1: Welcome & Demo Link',
          desc: 'Tanglish AI: Welcome greeting + 5-min demo invitation',
          x: 340,
          y: 60,
          config: { step: 1, lang: 'Tanglish' }
        },
        {
          id: 'node_3',
          type: 'ai',
          title: 'Day 2: Social Proof & Case Study',
          desc: 'Tanglish AI: 50% sales team time saved metric (If no reply)',
          x: 640,
          y: 60,
          config: { step: 2, lang: 'Tanglish', delay: '24h' }
        },
        {
          id: 'node_4',
          type: 'ai',
          title: 'Day 4: Soft Screen Share Reminder',
          desc: 'Tanglish AI: 2-line check-in asking for 10-min live demo call',
          x: 340,
          y: 250,
          config: { step: 4, lang: 'Tanglish', delay: '48h' }
        },
        {
          id: 'node_5',
          type: 'ai',
          title: 'Day 7: Limited Scarcity Offer',
          desc: 'Tanglish AI: 20% discount on 1st month subscription offer',
          x: 640,
          y: 250,
          config: { step: 7, lang: 'Tanglish', delay: '72h' }
        }
      ],
      connections: [
        { from: 'node_1', to: 'node_2' },
        { from: 'node_2', to: 'node_3' },
        { from: 'node_3', to: 'node_4' },
        { from: 'node_4', to: 'node_5' }
      ]
    }
  ],

  // AI Sales Agent Knowledge Base & Rules
  aiAgentConfig: {
    businessName: 'Nexus Growth Labs',
    industry: 'B2B Sales Automation & WhatsApp CRM',
    tone: 'Professional & Consultative',
    defaultLanguage: 'English',
    supportedLanguages: ['English', 'Malayalam', 'Tamil', 'Hindi', 'Kannada', 'Telugu'],
    qualificationQuestions: [
      'What service or product are you currently looking to automate?',
      'What is your approximate monthly lead volume or customer reach?',
      'When are you planning to launch your WhatsApp sales automation system?',
      'Which CRM or POS software do you currently use?'
    ],
    pricingRules: 'Starter: ₹1,999/mo (1,000 leads), Growth: ₹4,999/mo (5,000 leads + AI Agent), Scale: ₹9,999/mo (Unlimited + Custom Workflows). Do NOT give unapproved discounts.',
    guardrails: [
      'Never invent unverified pricing, custom enterprise guarantees, or false SLA metrics.',
      'If customer expresses urgency or high enterprise requirements, schedule a Human Handoff.',
      'If customer sends STOP, UNSUBSCRIBE, or NOT INTERESTED, trigger instant opt-out and cease messaging.'
    ],
    faqs: [
      {
        q: 'Does this use official WhatsApp Meta APIs?',
        a: 'Yes, we support official Meta WhatsApp Business Cloud APIs as well as authorized QR gateways for local businesses.'
      },
      {
        q: 'Can we send messages in Indian languages like Tamil, Malayalam, Hindi?',
        a: 'Yes! Our AI message composer natively supports Tamil, Malayalam, Hindi, Kannada, Telugu, and English.'
      }
    ]
  },

  // Team Members & RBAC
  teamMembers: [
    {
      id: 'usr_001',
      name: 'Karthik Raja',
      email: 'karthik@nexuslead.io',
      role: 'Owner',
      status: 'Active',
      leadsAssigned: 42,
      lastLogin: 'Just now'
    },
    {
      id: 'usr_002',
      name: 'Ananya Nair',
      email: 'ananya@nexuslead.io',
      role: 'Admin',
      status: 'Active',
      leadsAssigned: 89,
      lastLogin: '2 hours ago'
    },
    {
      id: 'usr_003',
      name: 'Vikram Mehta',
      email: 'vikram@nexuslead.io',
      role: 'Sales Agent',
      status: 'Active',
      leadsAssigned: 124,
      lastLogin: '15 mins ago'
    },
    {
      id: 'usr_004',
      name: 'Pooja Iyer',
      email: 'pooja@nexuslead.io',
      role: 'Manager',
      status: 'Active',
      leadsAssigned: 65,
      lastLogin: 'Yesterday'
    }
  ],

  // System Audit Logs
  auditLogs: [
    {
      id: 'log_001',
      timestamp: '2026-08-18T17:10:00Z',
      action: 'AI Intent Classification',
      entity: 'Lead #lead_004 (Sunrise Ayurvedic Resorts)',
      actor: 'AI Sales Agent (Gemini 3.7)',
      details: 'Customer inquiry in Malayalam classified as HIGH BUYING INTENT. Status auto-updated to Replied.',
      status: 'Success'
    },
    {
      id: 'log_002',
      timestamp: '2026-08-18T16:45:00Z',
      action: 'Human Handoff Executed',
      entity: 'Lead #lead_002 (Spice Craft Bistro)',
      actor: 'Vikram Mehta (Sales Agent)',
      details: 'Human takeover engaged. AI bot paused for conversation #conv_002.',
      status: 'Success'
    },
    {
      id: 'log_003',
      timestamp: '2026-08-18T14:20:00Z',
      action: 'Automatic Opt-Out Enforced',
      entity: 'Lead #lead_006 (TechNova Cloud)',
      actor: 'Compliance Engine',
      details: 'Keyword "STOP" detected. Lead blacklisted from future campaigns. Follow-up queue wiped.',
      status: 'Protected'
    },
    {
      id: 'log_004',
      timestamp: '2026-08-18T10:00:00Z',
      action: 'Campaign Batch Dispatched',
      entity: 'Campaign #camp_001',
      actor: 'Automation Queue Worker',
      details: '25 messages queued with 4.2s jitter rate limit. 0 provider errors.',
      status: 'Success'
    }
  ]
};
