# NexusLead AI — AI Lead Generation & WhatsApp Sales Automation SaaS Platform

> **An Automation-First AI Sales Operating System**
> Production-grade SaaS architecture for compliant B2B lead discovery, AI scoring, Meta WhatsApp Cloud API campaigns, multi-lingual sequences (Tamil, Malayalam, Hindi, English, Kannada, Telugu), visual drag-and-drop workflow canvas, live two-way chat inbox, and enterprise CRM pipelines.

---

## 🌟 Key Architecture & Modules

```
saas/
├── index.html                 # Master Single-Page SaaS Application Shell
├── css/
│   ├── index.css              # Custom Tokens, Themes, Dark-First Glassmorphism
│   ├── components.css         # Buttons, Modals, Drawers, Tables, Toasts, Badges
│   ├── dashboard.css          # Executive Metrics, Funnel Graphs, Activity Tickers
│   ├── crm.css                # Table, Kanban Drag/Drop, Pipeline Stages, Drawer
│   ├── workflow.css           # Visual Drag-and-Drop Workflow Canvas & Node Graph
│   └── inbox.css              # Live WhatsApp Messenger, AI Reply Suggestions
├── js/
│   ├── app.js                 # Application lifecycle orchestrator & router
│   ├── state.js               # Reactive Central Store with Event Bus & LocalStorage Sync
│   ├── demo-data.js           # Comprehensive realistic B2B dataset (Kerala, Bangalore, Chennai)
│   ├── services/
│   │   ├── ai-service.js      # Multilingual generation, Lead scoring (0-100), Intent & Opt-out
│   │   ├── whatsapp-service.js# Meta Cloud API & QR Gateway Provider Abstraction
│   │   ├── automation-engine.js# Workflow Graph runner, Campaign Queues & Rate-Limiter
│   │   └── storage.js         # JSON Backup exporter & Reset utilities
│   └── components/
│       ├── navigation.js      # Sidebar, Topbar, Theme Switcher, Emergency Pause
│       ├── dashboard.js       # KPI metrics, Funnel charts, Telemetry feed
│       ├── discovery.js       # Compliant discovery search with presets
│       ├── lead-import.js     # CSV/Excel/Manual parser, Deduplication & Report
│       ├── crm.js             # Table, Kanban, Pipeline, Lead Detail drawer
│       ├── whatsapp-connect.js# Meta OAuth modal & QR Code scanner simulator
│       ├── campaigns.js       # Campaign creation wizard & dispatch monitor
│       ├── ai-generator.js    # Multilingual 4-stage message composer (6 tones)
│       ├── followups.js       # Visual follow-up sequence builder & opt-out rules
│       ├── ai-agent.js        # AI Sales Agent config, FAQs & Guardrails
│       ├── workflow-builder.js# Visual drag-and-drop workflow canvas
│       ├── inbox.js           # Live two-way chat messenger with AI takeover
│       ├── templates.js       # Approved Meta WhatsApp templates manager
│       ├── analytics.js       # Delivery rates, Reply sentiments, Conversion ROI
│       ├── team.js            # Multi-user RBAC management (Owner, Admin, Agent)
│       ├── settings.js        # Business profile & audit trail logs
│       ├── billing.js         # Tiered subscription plans & metered usage
│       └── onboarding.js      # 7-Step guided setup wizard for new businesses
└── backend/
    ├── schema.prisma          # Multi-Tenant PostgreSQL Prisma ORM Schema
    ├── schema.sql             # Production SQL Schema with Row Level Security (RLS)
    ├── server.py              # Production FastAPI server & Meta Webhook Handlers
    ├── requirements.txt       # Python dependencies
    └── openapi.json           # OpenAPI 3.0 API Specification
```

---

## 🚀 Key Feature Highlights

### 1. Dual WhatsApp Connection Methods
- **Method A (Meta Cloud API OAuth)**: Secure enterprise connection to Meta WhatsApp Business API with zero frontend token exposure.
- **Method B (Authorized QR Provider)**: Pluggable QR session gateway with 45s countdown timer, auto-refresh, and live pairing simulator.

### 2. Multi-Lingual AI Message Composer
Native sequence generation across 6 Indian & International languages:
- English
- Tamil (தமிழ்)
- Malayalam (മലയാളം)
- Hindi (हिन्दी)
- Kannada (ಕನ್ನಡ)
- Telugu (తెలుగు)

Supports 6 tailored tones: *Professional, Friendly, Short, Premium, Casual, Consultative*.

### 3. Visual Drag-and-Drop Workflow Builder
- **Triggers**: New Lead, WhatsApp Reply, Status Changed, Timers.
- **AI Actions**: AI Lead Scoring (0-100), Intent Classification, Auto-Replies.
- **Standard Actions**: Send WhatsApp Template, 24h Delay Timer, Assign Salesperson.
- **Conditions**: High Score Threshold (>=70 Hot), Opt-out Detector.
- **Live Test Runner**: Real-time tracer that steps through node executions and reports latency.

### 4. Safety & Compliance First
- **Emergency Kill Switch**: Prominent **"PAUSE ALL AUTOMATIONS"** button freezes all background campaign queues immediately.
- **Automatic Opt-Out**: Detects keywords (`STOP`, `UNSUBSCRIBE`, `NOT INTERESTED`, `வேண்டாம்`, `നിർത്തുക`) to instantly blacklist contacts and terminate scheduled follow-ups.

### 5. Multi-Tenant CRM & RBAC
- Organization switcher (e.g. *Nexus Growth Labs*, *Malabar Dental Network*).
- Role-based permissions: `Owner`, `Admin`, `Manager`, `Sales Agent`, `Viewer`.
- Multi-view CRM: Table with bulk actions, Kanban drag-and-drop board, Pipeline stage tracker, and Lead detail drawer with conversation history and AI summary.

---

## 💻 How to Run Locally

### Interactive Frontend
Open `index.html` directly in any modern browser (Chrome, Edge, Safari, Firefox). All demo data and simulations run out of the box with zero build step!

### Production Backend (Optional)
```bash
cd backend
pip install -r requirements.txt
python server.py
```
Visit API docs at `http://localhost:8000/docs`.
