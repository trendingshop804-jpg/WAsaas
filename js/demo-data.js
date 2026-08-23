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
  leads: [
    {
      id: 'lead_001',
      companyName: 'Dr. Jacob Dental & Implant Center',
      contactName: 'Dr. Jacob Mathew',
      jobTitle: 'Chief Dental Surgeon & Founder',
      phone: '+91 94470 12345',
      whatsappStatus: 'Available',
      email: 'drjacob@jacobdental.com',
      website: 'https://jacobdental.com',
      industry: 'Healthcare & Dental',
      location: 'Kochi, Kerala, India',
      source: 'Discovery Engine',
      sourceUrl: 'https://google.com/maps/search/dentists+kochi',
      score: 94,
      scoreCategory: 'hot', // hot, warm, cold, unqualified
      status: 'Qualified', // New, Contacted, Replied, Qualified, Proposal, Negotiation, Won, Lost
      campaignId: 'camp_001',
      campaignName: 'Kerala Dental Clinics Outreach',
      assignedTo: 'Ananya Nair',
      optedOut: false,
      createdDate: '2026-08-15T10:30:00Z',
      lastContacted: '2026-08-18T14:20:00Z',
      nextFollowUp: '2026-08-19T11:00:00Z',
      tags: ['Dental Clinic', 'High Intent', 'Implant Speciality'],
      notes: 'Interested in automated patient appointment reminders & WhatsApp CRM integration. Requested a proposal.',
      customFields: {
        clinicBranches: '3',
        monthlyPatients: '450+',
        currentSoftware: 'Manual Excel'
      },
      aiSummary: 'High-value prospect. Chief surgeon wants automated recall booking system. High budget indicated in conversation.'
    },
    {
      id: 'lead_002',
      companyName: 'Spice Craft Bistro & Brews',
      contactName: 'Rahul Shenoy',
      jobTitle: 'Managing Director & Partner',
      phone: '+91 98860 55432',
      whatsappStatus: 'Available',
      email: 'rahul@spicecraft.in',
      website: 'https://spicecraft.in',
      industry: 'Restaurants & Hospitality',
      location: 'Indiranagar, Bangalore, India',
      source: 'Discovery Engine',
      sourceUrl: 'https://zomato.com/bangalore/spice-craft',
      score: 88,
      scoreCategory: 'hot',
      status: 'Proposal',
      campaignId: 'camp_002',
      campaignName: 'Bangalore F&B Automation Blitz',
      assignedTo: 'Vikram Mehta',
      optedOut: false,
      createdDate: '2026-08-14T09:15:00Z',
      lastContacted: '2026-08-18T16:45:00Z',
      nextFollowUp: '2026-08-20T15:00:00Z',
      tags: ['Restaurant', 'Table Booking', 'VIP Customer Loyalty'],
      notes: 'Wants direct WhatsApp table reservation engine to bypass 25% aggregator commissions.',
      customFields: {
        dailyCovers: '200',
        posSystem: 'Petpooja'
      },
      aiSummary: 'Replied positively within 12 minutes to initial WhatsApp hook. Proposal sent for multi-outlet automated loyalty system.'
    },
    {
      id: 'lead_003',
      companyName: 'PixelWave Digital Marketing',
      contactName: 'Sanjay Krishnan',
      jobTitle: 'Founder & CEO',
      phone: '+91 98410 77889',
      whatsappStatus: 'Available',
      email: 'sanjay@pixelwave.agency',
      website: 'https://pixelwave.agency',
      industry: 'Digital Marketing & Advertising',
      location: 'T. Nagar, Chennai, India',
      source: 'CSV Import',
      sourceUrl: 'agency_clutch_export_aug.csv',
      score: 72,
      scoreCategory: 'warm',
      status: 'Contacted',
      campaignId: 'camp_003',
      campaignName: 'Chennai Agency Partnership Q3',
      assignedTo: 'Pooja Iyer',
      optedOut: false,
      createdDate: '2026-08-16T11:00:00Z',
      lastContacted: '2026-08-18T10:00:00Z',
      nextFollowUp: '2026-08-19T14:30:00Z',
      tags: ['Agency Partner', 'B2B Client Servicing'],
      notes: 'Initial message delivered. Waiting for sequence check.',
      customFields: {
        teamSize: '18',
        activeClients: '32'
      },
      aiSummary: 'Message delivered. Follow-up sequence #1 scheduled for tomorrow 14:30 IST.'
    },
    {
      id: 'lead_004',
      companyName: 'Sunrise Ayurvedic Resorts',
      contactName: 'Vipin Chandran',
      jobTitle: 'General Manager',
      phone: '+91 97450 33441',
      whatsappStatus: 'Available',
      email: 'gm@sunriseayurveda.com',
      website: 'https://sunriseayurveda.com',
      industry: 'Tourism & Wellness',
      location: 'Munnar, Kerala, India',
      source: 'Discovery Engine',
      sourceUrl: 'https://google.com/maps/search/resorts+munnar',
      score: 81,
      scoreCategory: 'warm',
      status: 'Replied',
      campaignId: 'camp_001',
      campaignName: 'Kerala Dental & Wellness Outreach',
      assignedTo: 'Ananya Nair',
      optedOut: false,
      createdDate: '2026-08-16T14:20:00Z',
      lastContacted: '2026-08-18T17:10:00Z',
      nextFollowUp: '2026-08-19T10:00:00Z',
      tags: ['Wellness Resort', 'International Guests'],
      notes: 'Replied asking in Malayalam about seasonal package automations.',
      customFields: {
        rooms: '45',
        avgBookingValue: '₹35,000'
      },
      aiSummary: 'Prospect inquired in Malayalam about handling NRI and European tourist bookings automatically on WhatsApp.'
    },
    {
      id: 'lead_005',
      companyName: 'Apex Cloud Logistics',
      contactName: 'Rajesh Sharma',
      jobTitle: 'Logistics Lead',
      phone: '+91 98110 99881',
      whatsappStatus: 'Available',
      email: 'rajesh@apexlogistics.in',
      website: 'https://apexlogistics.in',
      industry: 'Supply Chain & Logistics',
      location: 'Gurugram, Delhi NCR, India',
      source: 'Manual Entry',
      sourceUrl: 'Inbound Referral',
      score: 35,
      scoreCategory: 'cold',
      status: 'New',
      campaignId: 'camp_004',
      campaignName: 'National Logistics Cold Inbound',
      assignedTo: 'Vikram Mehta',
      optedOut: false,
      createdDate: '2026-08-17T16:00:00Z',
      lastContacted: null,
      nextFollowUp: '2026-08-19T12:00:00Z',
      tags: ['Cold Inbound', 'Fleet Management'],
      notes: 'Added from logistics expo list. Needs initial scoring verification.',
      customFields: {
        fleetSize: '120 trucks'
      },
      aiSummary: 'Cold prospect. Low intent score due to missing website verified metadata.'
    },
    {
      id: 'lead_006',
      companyName: 'TechNova Cloud Solutions',
      contactName: 'Arjun Verma',
      jobTitle: 'VP of Product',
      phone: '+91 99001 44556',
      whatsappStatus: 'Opted Out',
      email: 'arjun@technovacloud.io',
      website: 'https://technovacloud.io',
      industry: 'Software & IT Services',
      location: 'Hyderabad, India',
      source: 'CSV Import',
      sourceUrl: 'tech_startups_hyderabad.csv',
      score: 12,
      scoreCategory: 'unqualified',
      status: 'Lost',
      campaignId: 'camp_003',
      campaignName: 'Chennai & Hyderabad Tech Blitz',
      assignedTo: 'Pooja Iyer',
      optedOut: true,
      createdDate: '2026-08-12T08:00:00Z',
      lastContacted: '2026-08-13T11:20:00Z',
      nextFollowUp: null,
      tags: ['Opted Out', 'STOP Received'],
      notes: 'Customer replied STOP. Instant opt-out policy enforced. All scheduled workflows terminated.',
      customFields: {
        optOutReason: 'STOP keyword received automatically'
      },
      aiSummary: 'Auto-detected opt-out request ("Not interested, please unsubscribe me"). System strictly blacklisted contact from future blasts.'
    }
  ],

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
      id: 'conv_001',
      leadId: 'lead_001',
      leadName: 'Dr. Jacob Mathew',
      company: 'Dr. Jacob Dental & Implant Center',
      phone: '+91 94470 12345',
      unreadCount: 0,
      mode: 'AI', // 'AI' or 'HUMAN'
      status: 'AI Active',
      lastMessage: 'Sure Doctor Jacob! I can book a 15-min zoom walkthrough tomorrow at 11:30 AM or 3:00 PM. Which works best?',
      lastTimestamp: '2:32 PM',
      messages: [
        {
          id: 'm1',
          sender: 'system',
          text: 'Campaign "Kerala Dental Clinics Outreach" started. Template healthcare_appointment_intro_v2 dispatched.',
          timestamp: 'Yesterday, 10:15 AM'
        },
        {
          id: 'm2',
          sender: 'outbound',
          text: 'Hi Dr. Jacob, noticed Dr. Jacob Dental & Implant Center in Kochi. Are you still handling clinic patient bookings manually? We helped dental clinics increase appointment shows by 40% with automated WhatsApp recalls. Open to a 5-min demo?',
          timestamp: 'Yesterday, 10:15 AM',
          status: 'READ'
        },
        {
          id: 'm3',
          sender: 'inbound',
          text: 'Hello, yes we currently use front-desk phone calls which takes too much time. What does this software cost and how does it sync with dental appointments?',
          timestamp: 'Yesterday, 2:10 PM'
        },
        {
          id: 'm4',
          sender: 'outbound',
          isAI: true,
          text: 'Thanks for reaching out Dr. Jacob! Our AI automatically sends WhatsApp reminder confirmations 24h & 2h before appointments, allowing patients to confirm or reschedule in 1 click. We support standard clinic workflows. Our growth package starts at ₹3,999/mo for up to 3 doctor chairs.',
          timestamp: 'Yesterday, 2:11 PM',
          status: 'READ'
        },
        {
          id: 'm5',
          sender: 'inbound',
          text: 'Sounds promising. We have 3 branches in Ernakulam with 6 consulting doctors. Can we see a live demonstration with our team?',
          timestamp: 'Today, 2:30 PM'
        },
        {
          id: 'm6',
          sender: 'outbound',
          isAI: true,
          text: 'Sure Doctor Jacob! I can book a 15-min zoom walkthrough tomorrow at 11:30 AM or 3:00 PM. Which works best?',
          timestamp: 'Today, 2:32 PM',
          status: 'DELIVERED'
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
      lastTimestamp: '4:45 PM',
      messages: [
        {
          id: 'm201',
          sender: 'outbound',
          text: 'Hello Rahul! Loved the dining vibe at Spice Craft Bistro & Brews. Did you know direct WhatsApp table reservations can save up to 25% on aggregator fees? Would you like to see how Bangalore restaurants automate VIP bookings?',
          timestamp: 'Aug 17, 11:00 AM',
          status: 'READ'
        },
        {
          id: 'm202',
          sender: 'inbound',
          text: 'Interesting! Can it integrate with our Petpooja POS billing system?',
          timestamp: 'Aug 17, 11:42 AM'
        },
        {
          id: 'm203',
          sender: 'outbound',
          isAI: true,
          text: 'Yes Rahul! We have direct Petpooja webhook support. Table reservations and VIP billing bills sync in real-time.',
          timestamp: 'Aug 17, 11:43 AM',
          status: 'READ'
        },
        {
          id: 'm204',
          sender: 'system',
          text: 'Human Takeover triggered by Vikram Mehta. AI auto-reply paused.',
          timestamp: 'Aug 17, 12:00 PM'
        },
        {
          id: 'm205',
          sender: 'outbound',
          text: 'Hi Rahul, Vikram here! Just shared our custom hospitality proposal on your email rahul@spicecraft.in. Let me know if you need any adjustments.',
          timestamp: 'Aug 18, 10:30 AM',
          status: 'READ'
        },
        {
          id: 'm206',
          sender: 'inbound',
          text: 'We received the proposal document Vikram. Can we do a pilot run this weekend at our Indiranagar outlet?',
          timestamp: 'Today, 4:45 PM'
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
      lastTimestamp: '5:10 PM',
      messages: [
        {
          id: 'm401',
          sender: 'outbound',
          text: 'നമസ്കാരം Vipin, Sunrise Ayurvedic Resorts-ൽ പുതിയ പേഷ്യന്റ് അപ്പോയിന്റ്മെന്റുകൾ വാട്സ്ആപ്പിലൂടെ സ്വയം ബുക്ക് ചെയ്യാൻ സാധിക്കുന്ന പുതിയ AI ഓട്ടോമേഷൻ സിസ്റ്റം ലഭ്യമാണ്. ഡെമോ ആവശ്യമുണ്ടോ?',
          timestamp: 'Today, 4:15 PM',
          status: 'READ'
        },
        {
          id: 'm402',
          sender: 'inbound',
          text: 'ഹലോ, ഞങ്ങൾക്ക് മൺസൂൺ ആയുർവേദ പാക്കേജുകൾക്ക് യൂറോപ്പിൽ നിന്നും ആളുകൾ ബുക്ക് ചെയ്യാറുണ്ട്. അവർക്ക് ഓട്ടോമാറ്റിക് ആയി ബ്രോഷറും നിരക്കുകളും വാട്സ്ആപ്പിൽ കൊടുക്കാൻ പറ്റുമോ?',
          timestamp: 'Today, 5:05 PM'
        },
        {
          id: 'm403',
          sender: 'outbound',
          isAI: true,
          text: 'നമസ്കാരം വിപിൻ സർ! വിദേശ സഞ്ചാരികൾക്കായി ഇംഗ്ലീഷിലും ജർമ്മൻ ഭാഷയിലുമുള്ള ഓട്ടോമേറ്റഡ് വാട്സ്ആപ്പ് ബ്രോഷർ അയക്കാം. ഡെമോ നാളെ 10 മണിക്ക് സൗകര്യമാണോ?',
          timestamp: 'Today, 5:10 PM',
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
          title: 'Trigger: New / Discovered Lead',
          desc: 'Fires when a new lead is added via Discovery or CSV import',
          x: 60,
          y: 80,
          config: { event: 'lead.created', deduplicate: true }
        },
        {
          id: 'node_2',
          type: 'ai',
          title: 'AI Action: Lead Scoring & Validation',
          desc: 'Evaluates website, industry match & phone format. Scores 0-100.',
          x: 380,
          y: 80,
          config: { model: 'gemini-3.7-flash', minScore: 60 }
        },
        {
          id: 'node_3',
          type: 'condition',
          title: 'Condition: Lead Score >= 70 (Hot/Warm)?',
          desc: 'Routes high-intent prospects to priority campaign sequence',
          x: 700,
          y: 80,
          config: { threshold: 70 }
        },
        {
          id: 'node_4',
          type: 'action',
          title: 'Action: Send WhatsApp Intro Template',
          desc: 'Dispatches Meta approved template with {{first_name}} personalization',
          x: 700,
          y: 260,
          config: { template: 'tmpl_001', rateLimit: '1 msg / 4 sec' }
        },
        {
          id: 'node_5',
          type: 'action',
          title: 'Action: Wait Timer (24 Hours)',
          desc: 'Delays execution to allow organic customer reply',
          x: 380,
          y: 260,
          config: { duration: '24h', respectWorkingHours: true }
        },
        {
          id: 'node_6',
          type: 'condition',
          title: 'Condition: Did Customer Reply?',
          desc: 'Checks if incoming WhatsApp message was received',
          x: 60,
          y: 260,
          config: { event: 'message.received' }
        },
        {
          id: 'node_7',
          type: 'ai',
          title: 'AI Sales Agent: Intent & Qualification',
          desc: 'Answers FAQs, detects budget & triggers Human Handoff if ready',
          x: 60,
          y: 440,
          config: { autoQualify: true, assignTo: 'Sales Agent' }
        }
      ],
      connections: [
        { from: 'node_1', to: 'node_2' },
        { from: 'node_2', to: 'node_3' },
        { from: 'node_3', to: 'node_4', condition: 'true' },
        { from: 'node_4', to: 'node_5' },
        { from: 'node_5', to: 'node_6' },
        { from: 'node_6', to: 'node_7', condition: 'yes' }
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
