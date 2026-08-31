# NexusLead AI - Complete Codebase Documentation

**Repository:** `trendingshop804-jpg/WAsaas`  
**Date:** August 31, 2026  
**Language Composition:** JavaScript (56.3%), HTML (14.4%), CSS (10.1%), TypeScript (9.1%), Python (4.7%), PLpgSQL (3.5%)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core State Management](#core-state-management)
3. [Demo Data & Initial State](#demo-data--initial-state)
4. [AI Service Layer](#ai-service-layer)
5. [WhatsApp Service Layer](#whatsapp-service-layer)
6. [Automation Engine](#automation-engine)
7. [UI Components](#ui-components)
   - [Inbox Component](#inbox-component)
   - [CRM Component](#crm-component)
   - [Dashboard Component](#dashboard-component)
8. [Language Breakdown](#language-breakdown)
9. [Getting Started](#getting-started)

---

## Architecture Overview

NexusLead AI is a **B2B WhatsApp Sales Automation & CRM platform** built with:
- **Frontend:** Vanilla JavaScript (no framework dependencies)
- **State Management:** Custom reactive event bus (`window.appState`)
- **APIs:** OpenRouter AI, Meta WhatsApp Cloud API, Supabase (optional)
- **Backend:** FastAPI (Python), Supabase PostgreSQL

### Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                    NEXUSLEAD AI STACK                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          UI LAYER (25+ Components)                  │   │
│  │  inbox.js | crm.js | dashboard.js | campaigns.js   │   │
│  │  workflows.js | settings.js | discovery.js         │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                     │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │      SERVICE LAYER (Business Logic)                │   │
│  │  ai-service.js | whatsapp-service.js               │   │
│  │  automation-engine.js | auth-service.js            │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                     │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │    STATE MANAGEMENT (Reactive Event Bus)           │   │
│  │  state.js | demo-data.js                           │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                     │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │    EXTERNAL SERVICES (APIs & Databases)            │   │
│  │  OpenRouter AI | Meta WhatsApp API | Supabase      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Core State Management

### File: `js/state.js`

**Purpose:** Central reactive state store and event bus for the entire application.

**Key Features:**

- **localStorage Persistence:** Saves state to browser storage with versioning (`nexuslead_state_v1`)
- **State Merging:** Intelligently merges saved state with fresh demo data
- **Phone Normalization:** Deduplicates leads/conversations by normalized phone (last 10 digits)
- **Reactive Event System:** Uses Map-based listener pattern for instant UI updates
- **Audit Logging:** Tracks all mutations for compliance and debugging
- **Multi-tenant Support:** Handles multiple organizations with org switching
- **Kill-Switch:** Emergency pause/resume for all automations

**Core Methods:**

```javascript
// Get value from state
window.appState.get('leads')

// Set value and trigger all listeners
window.appState.set('leads', [...])

// Functional update
window.appState.update('leads', leads => [...leads.slice(1)])

// Subscribe to state changes
window.appState.on('messageSent', (msg) => { ... })

// Emit custom event
window.appState.emit('customEvent', data)

// Add compliance audit log
window.appState.addAuditLog('Action Name', 'Entity', 'Details', 'Status')

// Switch multi-tenant organization
window.appState.switchOrg('org_id')

// Emergency kill-switch
window.appState.toggleKillSwitch()
```

**State Structure:**

```javascript
{
  currentOrgId: 'org_nexus_01',
  currentUser: { id, name, email, role, avatar },
  organizations: [{ 
    id, name, plan, tier, 
    whatsappConnected, whatsappNumber, whatsappProvider, 
    phoneId, whatsappToken, wabaId,
    instagramConnected, instagramUsername,
    creditsUsed, creditsLimit, isPaused, ...
  }],
  leads: [{ id, contactName, companyName, phone, score, status, ... }],
  conversations: [{ id, leadId, messages, mode, status, ... }],
  campaigns: [{ id, name, status, templateId, sentCount, ... }],
  workflows: [{ id, name, nodes, connections, ... }],
  auditLogs: [{ id, timestamp, action, entity, actor, details, status }]
}
```

---

## Demo Data & Initial State

### File: `js/demo-data.js`

**Purpose:** Comprehensive demo data for development, testing, and product walkthroughs.

**Includes:**

- **50+ Realistic B2B Leads** across multiple industries (Healthcare, F&B, Dental, Ayurveda, etc.)
- **3 Active Campaigns** with conversion metrics
- **4 Approved WhatsApp Message Templates** (multilingual: English, Tamil, Malayalam, Hindi)
- **10+ Live Conversations** with full message threads and media samples
- **Default Workflow** with 4-step nurture sequence (Day 1, 2, 4, 7)
- **AI Agent Config** with qualification questions and pricing rules
- **Team Members** with RBAC (Owner, Admin, Sales Agent, Manager)
- **Audit Log Samples** for compliance tracking
- **Instagram Automation Rules** for parallel channel management

**Sample Lead Structure:**

```javascript
{
  id: 'lead_001',
  contactName: 'Dr. Jacob Mathew',
  companyName: 'Dr. Jacob Dental & Implant Center',
  jobTitle: 'Clinic Director',
  phone: '+91 94470 12345',
  email: 'jacob@dentimatc.in',
  industry: 'Healthcare & Dental',
  location: 'Kochi, Kerala',
  website: 'https://jacobdental.in',
  score: 85,
  scoreCategory: 'hot',  // hot | warm | cold
  status: 'Replied',     // New | Contacted | Replied | Qualified | Proposal | Won | Lost
  source: 'Campaign',
  createdDate: '2026-08-15T10:00:00Z',
  lastContacted: '2026-08-27T14:30:00Z',
  optedOut: false,
  aiSummary: 'High-intent lead with 3 clinic branches, 6 doctors'
}
```

---

## AI Service Layer

### File: `js/services/ai-service.js`

**Purpose:** Provider-independent AI service for multilingual message generation, lead scoring, and intent classification.

**Key Features:**

1. **OpenRouter API Integration**
   - Supports 5+ AI models (DeepSeek, GPT-4, Claude, Gemini, Llama)
   - Local key support (config.js) + fallback to Vercel serverless
   - Temperature: 0.7, Max tokens: 300

2. **Multilingual Message Composer**
   - 6 languages: English, Tamil, Malayalam, Hindi, Kannada, Telugu
   - 6 tones: Professional, Friendly, Short, Premium, Casual, Consultative
   - 4 sequence steps: Initial, Follow-up 1, Follow-up 2, Final
   - Context-aware personalization (name, company, location, industry)

3. **Lead Scoring Engine** (0-100)
   - Industry relevance: +18 (healthcare, dental, restaurant, SaaS)
   - Phone validation: +12 (E.164 format)
   - Website quality: +10 (active business domain)
   - Engagement status: +15 (Replied/Qualified/Proposal)
   - Opt-out penalty: -100 (explicit STOP)

4. **Opt-Out & Compliance Detector**
   - Multilingual triggers: STOP, UNSUBSCRIBE, NOT INTERESTED
   - Tamil: வேண்டாம், நிறுத்து
   - Malayalam: നിർത്തുക, വേണ്ട
   - Hindi: बंद करो, मैसेज मत करो

5. **Intent Classification**
   - OPT_OUT (priority: CRITICAL)
   - DEMO_REQUEST (priority: HIGH)
   - PRICING_INQUIRY (priority: HIGH)
   - TECHNICAL_FIT (priority: MEDIUM)
   - GENERAL_INQUIRY (priority: MEDIUM)

6. **AI Reply Suggestions**
   - Contextual suggestions based on customer intent
   - Auto-generated actions (book call, send proposal, transfer to human)

**Core Methods:**

```javascript
// Generate AI message
await window.aiService.generateMessage({
  product: 'WhatsApp Sales Automation CRM',
  lead: { contactName, companyName, industry, location },
  objective: 'Book a 15-min Discovery Demo',
  tone: 'Professional',
  language: 'English',
  cta: 'Reply with DEMO',
  sequenceStep: 0  // 0-3
})

// Generate multi-day follow-up (Day 1, 2, 4, 7 Tanglish)
await window.aiService.generateMultiDayFollowup({ lead, step: 1 })

// Analyze lead score
window.aiService.analyzeLead(lead)  // Returns { score, category, reasons, evaluatedAt }

// Detect opt-out
window.aiService.detectOptOut('STOP')  // Returns { isOptOut, reason }

// Classify customer intent
window.aiService.classifyIntent('Can we book a demo?')  // Returns { intent, confidence, priority }

// Get AI suggestions
window.aiService.suggestReplies(conversation)  // Returns array of action suggestions
```

---

## WhatsApp Service Layer

### File: `js/services/whatsapp-service.js`

**Purpose:** Dual-method WhatsApp connection layer supporting both Meta OAuth and QR gateway providers.

**Connection Methods:**

### Method A: Meta Official OAuth
```javascript
await window.whatsappService.connectMetaOAuth({
  wabaName: 'Nexus Growth Labs WABA',
  phoneNumber: '+91 98401 23456',
  provider: 'Meta Cloud API (Official)',
  token: 'EAAVpyP3...',  // Meta access token
  phoneId: '1016931798166599',
  wabaId: 'WABA_...'
})
```

### Method B: QR Code Gateway
```javascript
window.whatsappService.startQRFlow(
  (status, data) => {
    // status: 'QR_GENERATING' | 'WAITING_FOR_SCAN' | 'SESSION_EXPIRED'
    // data.qrData = QR code URL
    // data.expiresIn = seconds remaining
  },
  (secsRemaining) => console.log(`${secsRemaining}s left`)
)

// Simulate QR scan success
window.whatsappService.simulateQRScanSuccess('+91 94471 88990')
```

**Core Features:**

1. **Message Dispatch with Guardrails**
   - Global kill-switch check (org.isPaused)
   - Opted-out contact blocking
   - Credit deduction
   - Supabase persistence (optional)
   - Delivery simulation

2. **Media Message Support**
   - Auto-detects type: image, video, audio, document
   - Base64 encoding → backend upload → signed URL
   - Optimistic UI updates

3. **Real-time Supabase Sync**
   - Webhooks → Supabase messages table → Realtime subscription
   - De-duplication by message ID & timestamp
   - Phone normalization for lead matching
   - Auto-creates leads from inbound messages

4. **Message Polling**
   - 4-second interval for inbound sync
   - Processes batch messages chronologically
   - Handles media metadata (MIME type, size, URL)

**Core Methods:**

```javascript
// Send text message
await window.whatsappService.sendMessage({
  leadId: 'lead_001',
  text: 'Hi Dr. Jacob, this is an automated message',
  isAI: true  // Flag for AI-generated messages
})

// Send media message
await window.whatsappService.sendMessage({
  leadId: 'lead_001',
  text: 'Here is your case study',
  isAI: false
})

// Receive simulated inbound (for testing)
window.whatsappService.receiveSimulatedInbound({
  leadId: 'lead_001',
  text: 'Yes, I am interested'
})

// Sync messages from Supabase
await window.whatsappService.syncInboundMessagesFromSupabase()

// Start real-time polling
window.whatsappService.startInboundPolling(4000)  // 4s interval

// Mark conversation as read
window.whatsappService.markAsRead('conv_001')

// Find lead by normalized phone
const lead = window.whatsappService.findLeadByPhone('+91 94470 12345')

// Disconnect
window.whatsappService.disconnect()
```

---

## Automation Engine

### File: `js/services/automation-engine.js`

**Purpose:** Background workflow orchestration for campaigns and multi-day follow-up sequences.

**Key Features:**

1. **Campaign Queue Processor**
   - Monitors running campaigns (status === 'Running')
   - Sends next message batch if sentCount < totalLeads
   - Respects global kill-switch pause
   - Template variable interpolation ({{first_name}}, {{company_name}})

2. **Multi-Day Follow-Up Scheduler**
   - Runs every 10 seconds
   - Tracks elapsed days since lead creation
   - Day 1, 2, 4, 7 milestones
   - Generates Tanglish AI messages for each step
   - Skips if lead already replied/qualified/won
   - Skips if opted-out or org paused

3. **Workflow Executor**
   - Runs full 4-step sequence on demand
   - Generates execution log with timestamps
   - Tests workflows before campaign launch
   - Supports test leads if no real leads available

**Core Methods:**

```javascript
// Initialize (called on app start)
window.automationEngine.initHeartbeat()

// Process background queues manually
window.automationEngine.processBackgroundQueues()

// Process multi-day follow-ups manually
window.automationEngine.processMultiDayFollowupQueue()

// Execute workflow
const log = await window.automationEngine.executeWorkflow('wf_demo_01', 'lead_001')
// Returns array of execution steps with results
```

**Multi-Day Sequence:**

```
Day 1: Welcome & Value Proposition
  → "Vanakkam Dr. Jacob! Welcome to NexusLead AI. 
     Namma CRM moolama unga WhatsApp business leads, 
     automated replies & follow-ups 24/7 autopilot-la run pannalam."

Day 2: Social Proof & Case Study (if no reply)
  → "Quick follow-up: Namma client sales teams manual time-ah 50% 
     save panni WhatsApp response speed-ah 3X adhigarithurukanga."

Day 4: Soft Screen Share Reminder (if no reply)
  → "Hey Dr. Jacob! Quick check-in. Ungalukku edhavadhu doubts irukkaa, 
     or 10-minute live screen share demo book pannalama?"

Day 7: Limited Scarcity Offer (if no reply)
  → "Special offer alert 🎁 Indha week unga first month SaaS 
     subscription sign up panna 20% flat discount kedaikkum!"
```

---

## UI Components

### Inbox Component

**File:** `js/components/inbox.js` (1487 lines)

**Purpose:** Real-time WhatsApp CRM two-way messaging interface with media support and AI assistance.

**Layout (3-Panel):**

```
┌──────────────────┬─────────────────────────┬──────────────────┐
│  Left Panel      │   Center Panel          │  Right Panel     │
│  (Conversations) │   (Active Chat Window)  │  (Prospect Info) │
├──────────────────┼─────────────────────────┼──────────────────┤
│                  │                         │                  │
│ Search bar       │ Lead Name & Company     │ Contact Details  │
│ Filter chips     │ Status buttons          │ AI Score (hot/  │
│ (All/Unread/AI)  │ Mode toggle (AI/Human) │   warm/cold)     │
│                  │ Resolve button          │                  │
│ Conv list        │                         │ CRM Stage select │
│ (sorted by       │ ┌─────────────────────┐ │ Agent assign    │
│  time)           │ │                     │ │                  │
│                  │ │ Message thread      │ │ Tags            │
│ Avatar + name    │ │ (Text & Media)      │ │ Internal notes  │
│ Last msg snippet │ │                     │ │                  │
│ Unread badge     │ └─────────────────────┘ │                  │
│                  │                         │                  │
│                  │ ┌─────────────────────┐ │                  │
│                  │ │ Input area:         │ │                  │
│                  │ │ - Text input        │ │                  │
│                  │ │ - Emoji picker      │ │                  │
│                  │ │ - File attach       │ │                  │
│                  │ │ - Template selector │ │                  │
│                  │ │ - Send button       │ │                  │
│                  │ └─────────────────────┘ │                  │
│                  │                         │                  │
│                  │ AI Suggestions bar      │                  │
│                  │ (Contextual actions)    │                  │
│                  │                         │                  │
└──────────────────┴─────────────────────────┴──────────────────┘
```

**Key Features:**

1. **Conversation List (Left Panel)**
   - Real-time search by contact/company/phone
   - Filter chips: All / Unread / AI Active / Human Active
   - Avatar initials + AI/Human status badge
   - Last message snippet + timestamp
   - Unread count badge

2. **Active Chat Window (Center Panel)**
   - Message thread with date separators
   - Consecutive message grouping (compact spacing)
   - Outbound (right-aligned) vs Inbound (left-aligned)
   - AI badge on AI-generated messages
   - ✓✓ delivery ticks (read status)
   - System messages (centered, muted)

3. **Media Support**
   - Images: Lightbox preview + caption
   - Audio: Play button + animated waveform + duration timer
   - Video: Click to play + controls + caption
   - Documents: Download card (PDF/Word/Excel with file icon badge)
   - Stickers: Full-size display
   - Unsupported types: Fallback message

4. **24-Hour Session Window Banner**
   - Active (green): "7h 45m left" → can send free-form messages
   - Expiring (orange): "< 2h left" → urgent template reminder
   - Expired (red): "Session Expired" → must use approved template

5. **AI/Human Mode Toggle**
   - AI mode: Auto-generates replies, AI badge on messages
   - Human mode: Manual takeover, sales agent controls
   - Emits audit log on switch

6. **Conversation Actions**
   - Mark Resolved / Re-open
   - Delete thread
   - Add internal notes (timestamped, authored)
   - Add tags (VIP, Urgent, Follow-up, etc.)
   - Assign CRM stage (New, Contacted, Replied, Qualified, Proposal, etc.)
   - Assign team member

7. **AI Suggestions Chip Bar**
   - Context-aware actions based on last customer message
   - Examples: "Confirm Zoom call", "Send pricing", "Transfer to specialist"

8. **Real-time Features**
   - Supabase Realtime subscription for outbound messages
   - Auto-scroll to bottom on new messages
   - "Scroll to bottom" button when user scrolled up
   - Unread count badge on scroll button
   - 30-second timer update for 24h window

**Core Methods:**

```javascript
// Initialize
window.inboxComponent.init()

// Select conversation
window.inboxComponent.selectConversation('conv_001')

// Create conversation from lead (CRM action)
window.inboxComponent.selectConversationByLeadId('lead_001')

// Send message (text or media)
window.inboxComponent.handleSendMessage('Hello!')

// Send media
window.inboxComponent.sendMediaMessage(file, 'image', 'Check this out!')

// Switch AI/Human mode
window.inboxComponent.switchMode('AI')

// Toggle resolved status
window.inboxComponent.toggleResolved()

// Delete conversation
window.inboxComponent.deleteConversation('conv_001')

// Show media preview
window.inboxComponent.showMediaPreview(url, 'image', 'filename.jpg')
```

---

### CRM Component

**File:** `js/components/crm.js` (515 lines)

**Purpose:** Lead management with multiple views (Table, Kanban, Pipeline) and bulk actions.

**Views:**

1. **Table View**
   - Sortable columns: Name, Company, Phone, Location, Score, Status, Last Contact
   - Inline status dropdown
   - Checkbox bulk select + "Select All"
   - Action buttons: View Details, Open Chat, Delete
   - Search + Score filter (all/hot/warm/cold)

2. **Kanban View**
   - 8 columns (pipeline stages)
   - Drag-drop leads between stages
   - Stage count badge
   - Lead cards with name, company, score, location

3. **Pipeline View**
   - Visual funnel with stage progression
   - Deal count per stage
   - Conversion velocity metrics

**Lead Drawer**

- Contact: Name, Job Title, Company, Email
- Details: Phone, Location, Industry, Website
- AI Score badge (hot/warm/cold with % and label)
- AI Briefing summary
- Status dropdown
- Timeline (Lead created, Outreach sent)
- Editable notes (timestamped)

**Bulk Actions**

- Bulk Message Campaign (pre-selects leads)
- Bulk Delete with confirmation

**Special Features**

- Automatic deduplication by normalized phone
- Lead status change tracking in audit logs
- "Open WhatsApp Chat" bridges to Inbox component
- Lead deletion cascades to conversations

**Core Methods:**

```javascript
// Initialize
window.crmComponent.init()

// Filter & search
window.crmComponent.filterSearch = 'Karthik'
window.crmComponent.filterCategory = 'hot'
window.crmComponent.render()

// Switch view
window.crmComponent.currentViewMode = 'kanban'  // table | kanban | pipeline
window.crmComponent.render()

// Open lead details
window.crmComponent.openLeadDrawer('lead_001')

// Update lead status
window.crmComponent.updateLeadStatus('lead_001', 'Qualified')

// Kanban drag-drop
window.crmComponent.handleKanbanDrop(event, 'Proposal')

// Open WhatsApp chat
window.crmComponent.openWhatsAppChat('lead_001')

// Delete lead
window.crmComponent.deleteLead('lead_001')

// Clean duplicate accounts
window.crmComponent.cleanupDuplicateAccounts()
```

---

### Dashboard Component

**File:** `js/components/dashboard.js` (166 lines)

**Purpose:** Executive KPI dashboard with time-filtered metrics and activity stream.

**Metrics Displayed**

- **Total Leads:** Leads created in time range
- **Contacted:** Leads with status !== 'New'
- **Replies:** Leads with status in [Replied, Qualified, Proposal, Negotiation, Won]
- **Qualified:** Leads with status in [Qualified, Proposal, Negotiation, Won]
- **Won:** Leads with status === 'Won'
- **Messages Sent:** Sum of all campaign sentCounts
- **Response Rate %:** (repliedLeads / contactedLeads) × 100
- **Conversion Rate %:** (wonLeads / totalLeads) × 100
- **Credits Used:** org.creditsUsed / org.creditsLimit

**Time Filters**

- Last 24 hours (default)
- Last 7 days
- Last 30 days
- All time

**Funnel Visualization**

- Bar chart with 5 stages
- Percentage of total at each stage
- Shows drop-off analysis

**Activity Stream**

- Last 5 audit log entries
- Action, Entity, Actor, Timestamp
- Reverse chronological order

**Quick Action Buttons**

- Discover leads → discovery view
- Start campaign → campaigns view
- Check inbox → inbox view
- Build workflow → workflows view

**Core Methods:**

```javascript
// Initialize
window.dashboardComponent.init()

// Set time range
window.dashboardComponent.currentTimeRange = '7d'  // 24h | 7d | 30d | all
window.dashboardComponent.renderMetrics()

// Get date threshold
const threshold = window.dashboardComponent.getTimeThreshold()

// Check if within range
const inRange = window.dashboardComponent.isWithinTimeRange('2026-08-27T10:00:00Z')
```

---

## Language Breakdown

### JavaScript (56.3% — ~2,500 lines)

**Services & Logic:**
- `state.js` (177 lines) — Central state store
- `ai-service.js` (437 lines) — AI integration
- `whatsapp-service.js` (691 lines) — WhatsApp dual connection + sync
- `automation-engine.js` (169 lines) — Workflow orchestration

**UI Components:**
- `inbox.js` (1487 lines) — Real-time messaging interface
- `crm.js` (515 lines) — Lead management views
- `dashboard.js` (166 lines) — Executive KPIs
- `campaigns.js` (289 lines) — Campaign builder
- `workflows.js` (345 lines) — Workflow visual builder
- `settings*.js` (1200+ lines) — Configuration panels
- Other components (800+ lines)

### HTML (14.4% — ~600 lines)

- `index.html` — Main application shell
- Embedded within components as template strings

### CSS (10.1% — ~400 lines)

- Tailwind-based utility classes
- Custom variables (--brand-primary, --text-muted, etc.)
- Component-specific styles

### TypeScript (9.1% — ~400 lines)

- Type definitions (optional, development mode)
- API response interfaces

### Python (4.7% — ~200 lines)

**Backend:**
- `server.py` (FastAPI)
  - Webhook verification
  - Lead creation from webhooks
  - AI message generation
  - Media upload/download
  - Opt-out compliance

### PLpgSQL (3.5% — ~150 lines)

**Supabase Database:**
- User/org management
- Lead & conversation schemas
- Message storage with media metadata
- Audit log triggers

### Other (1.9%)

- Configuration files, build scripts, etc.

---

## Getting Started

### 1. Local Development Setup

```bash
# Clone repository
git clone https://github.com/trendingshop804-jpg/WAsaas.git
cd WAsaas

# Install dependencies
npm install

# Create config file with API keys
cat > js/config.js << 'EOF'
window.OPENROUTER_API_KEY = 'your_openrouter_key'
window.SUPABASE_URL = 'your_supabase_url'
window.SUPABASE_ANON_KEY = 'your_supabase_key'
EOF

# Start dev server
npm run dev
```

### 2. Initialize State

```javascript
// App automatically loads from localStorage or initializes with demo data
window.appState  // Global state instance
window.appState.get('leads')  // Access state
```

### 3. Connect WhatsApp

**Option A: Meta OAuth**
```javascript
await window.whatsappService.connectMetaOAuth({
  wabaName: 'My Business',
  phoneNumber: '+91 9840123456',
  provider: 'Meta Cloud API (Official)',
  token: 'your_meta_access_token'
})
```

**Option B: QR Gateway (Demo)**
```javascript
window.whatsappService.startQRFlow(
  (status, data) => console.log(status),
  (secsLeft) => console.log(`${secsLeft}s`)
)
window.whatsappService.simulateQRScanSuccess('+91 9840123456')
```

### 4. Send Your First Message

```javascript
// Find or create a lead
const lead = window.appState.get('leads')[0]

// Send message
await window.whatsappService.sendMessage({
  leadId: lead.id,
  text: 'Hi! This is an automated message from NexusLead AI.',
  isAI: true
})
```

### 5. Monitor in Inbox

```javascript
// Open inbox and select the conversation
window.navigationComponent.switchView('inbox')
window.inboxComponent.selectConversationByLeadId(lead.id)
```

---

## Key Architecture Patterns

### 1. Reactive State Management

```javascript
// 1. Component listens to state
window.appState.on('leads', () => {
  this.render()
})

// 2. Component mutates state
window.appState.set('leads', newLeads)

// 3. Listeners automatically re-render
```

### 2. Optimistic UI Updates

```javascript
// 1. Create optimistic message immediately
const optimisticMsg = { id: 'temp_123', status: 'SENDING', ... }
conv.messages.push(optimisticMsg)
this.render()

// 2. Send to backend in background
const res = await fetch('/api/send-media', { ... })

// 3. Update with real data
optimisticMsg.wa_message_id = res.messageId
optimisticMsg.status = 'SENT'
this.render()
```

### 3. Phone Normalization

```javascript
const normalizePhone = (phone) => {
  const digits = String(phone).replace(/[^0-9]/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

// Prevents duplicates from formatting variations:
// '+91 94470 12345' → '9447012345'
// '94470 12345' → '9447012345'
// '+919447012345' → '9447012345'
```

### 4. Error Boundaries

```javascript
// All listener calls wrapped in try-catch
window.appState.emit(event, data)  // Internally handles listener errors
```

---

## Compliance & Security

- ✅ **Opt-Out Detection:** Automatic STOP/UNSUBSCRIBE handling
- ✅ **24-Hour Window:** Meta compliance for free-form messaging
- ✅ **Rate Limiting:** Daily message limits per campaign
- ✅ **XSS Protection:** HTML escaping in user content
- ✅ **Phone Normalization:** Prevents duplicate messaging
- ✅ **Audit Logging:** All mutations tracked with actor/timestamp
- ✅ **Kill-Switch:** Emergency pause for all automations

---

## Support & Contributing

For questions or issues:
1. Check inline code comments (/* ... */)
2. Review this documentation
3. Open an issue on GitHub
4. Contact development team

**Last Updated:** August 31, 2026
