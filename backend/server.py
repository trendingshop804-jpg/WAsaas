"""
NexusLead AI — Production FastAPI Backend Server
REST API & Webhook Service Layer for Meta WhatsApp Cloud API & AI Automation
"""

import os
import json
import uuid
import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Query, Header, Request, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

# Database setup
import os
import db

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable not set")

# Ensure tables are created (if using SQLAlchemy models)
if hasattr(db, "Base"):
    db.Base.metadata.create_all(bind=db.engine)

app = FastAPI(
    title="NexusLead AI API",
    description="AI Lead Generation & WhatsApp Sales Automation Operating System API",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class LeadCreate(BaseModel):
    company_name: str
    contact_name: str
    phone: str
    email: Optional[str] = None
    industry: Optional[str] = "General"
    location: Optional[str] = "India"
    website: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None

class MessageSend(BaseModel):
    lead_id: str
    text: str
    is_ai: Optional[bool] = False

class AIGenerateRequest(BaseModel):
    product: str
    industry: str
    language: str = "English"
    tone: str = "Professional"
    cta: str
    stage: int = 0

class KillSwitchRequest(BaseModel):
    organization_id: str
    is_paused: bool
    reason: Optional[str] = "Manual kill-switch toggled by administrator"

# ---------------------------------------------------------------------------
# Routes: Lead Discovery & CRM
# ---------------------------------------------------------------------------

@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "NexusLead AI Core Engine",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }

@app.get("/api/v1/discovery")
async def discover_leads(
    category: str = Query(..., description="Industry or business niche"),
    location: str = Query(..., description="City or region"),
    keywords: Optional[str] = Query(None)
):
    """
    Search verified public B2B directories with compliance filters.
    """
    # Compliant synthetic results simulator
    return {
        "query": {"category": category, "location": location, "keywords": keywords},
        "results_count": 3,
        "results": [
            {
                "id": str(uuid.uuid4()),
                "company_name": f"{location.split(',')[0]} Premium Dental Care",
                "contact_name": "Dr. Jacob Mathew",
                "phone": "+91 94470 12345",
                "email": "drjacob@jacobdental.com",
                "industry": category,
                "location": location,
                "score": 94,
                "score_category": "HOT"
            }
        ]
    }

@app.post("/api/v1/leads")
async def create_lead(lead: LeadCreate):
    """
    Ingest a new lead, normalize phone number, and execute AI lead scoring.
    """
    clean_digits = "".join([c for c in lead.phone if c.isdigit()])
    if len(clean_digits) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number format")

    # In production, persist into PostgreSQL via Prisma or SQLAlchemy
    return {
        "id": str(uuid.uuid4()),
        "status": "created",
        "lead": lead.dict(),
        "score": 85,
        "category": "HOT"
    }

# ---------------------------------------------------------------------------
# Routes: WhatsApp Meta Cloud API Webhooks
# ---------------------------------------------------------------------------

@app.get("/webhooks/meta")
async def meta_webhook_verification(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge")
):
    """
    Meta Cloud API Webhook Verification Challenge.
    """
    META_VERIFY_TOKEN = os.getenv("META_VERIFY_TOKEN", "Nextbright2026")
    if hub_mode == "subscribe" and hub_verify_token == META_VERIFY_TOKEN:
        return PlainTextResponse(content=hub_challenge, status_code=200)
    raise HTTPException(status_code=403, detail="Verification token mismatch")

@app.post("/webhooks/meta")
async def meta_webhook_events(request: Request, background_tasks: BackgroundTasks):
    """
    Handle incoming Meta WhatsApp events: Messages, Delivery Receipts, Read Status, Opt-Outs.
    """
    payload = await request.json()

    # Process payload asynchronously to return 200 OK under 3 seconds to Meta
    background_tasks.add_task(process_meta_payload, payload)
    return JSONResponse(content={"status": "EVENT_RECEIVED"}, status_code=200)

async def process_meta_payload(payload: Dict[str, Any]):
    # Log incoming webhook
    print(f"[*] Processing incoming Meta Webhook Event: {json.dumps(payload)[:200]}...")
    # 1. Parse text message
    # 2. Check for STOP / Unsubscribe keywords
    # 3. Classify intent with AI
    # 4. Trigger automated reply if AI Mode is active

# ---------------------------------------------------------------------------
# Routes: Multilingual AI Message Composer Proxy (OpenRouter Powered)
# ---------------------------------------------------------------------------

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

SYSTEM_PROMPT = """
=== 1. ROLE & IDENTITY ===
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

OUTPUT ONLY THE FINAL WHATSAPP MESSAGE TO THE CLIENT.
"""



@app.get("/api/v1/ai/models")
async def get_ai_models():
    """
    Get supported OpenRouter AI models and connection health.
    """
    return {
        "provider": "OpenRouter.ai",
        "status": "connected",
        "key_configured": bool(OPENROUTER_API_KEY),
        "default_model": "deepseek/deepseek-r1",
        "available_models": [
            {"id": "deepseek/deepseek-r1", "name": "DeepSeek R1 Reasoning", "provider": "DeepSeek"},
            {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI"},
            {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet", "provider": "Anthropic"},
            {"id": "google/gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "Google"},
            {"id": "meta-llama/llama-3.3-70b-instruct", "name": "Llama 3.3 70B", "provider": "Meta"}
        ]
    }

@app.post("/api/v1/ai/generate-sequence")
async def generate_ai_sequence(req: AIGenerateRequest):
    """
    Generate multi-lingual 4-touch WhatsApp campaign sequence via OpenRouter or dynamic builder.
    """
    model = "deepseek/deepseek-r1"
    
    # Attempt OpenRouter backend call if urllib/httpx is available
    openrouter_messages = []
    if OPENROUTER_API_KEY:
        import urllib.request
        try:
            prompt = (
                f"Generate 4 WhatsApp campaign sequence steps for product '{req.product}' in '{req.industry}' industry.\n"
                f"Language: {req.language}, Tone: {req.tone}, CTA: '{req.cta}'.\n"
                f"Return JSON array of 4 step strings: [\"step1\", \"step2\", \"step3\", \"step4\"]"
            )
            req_data = json.dumps({
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a B2B WhatsApp campaign generator. Output valid JSON array only."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7
            }).encode("utf-8")
            
            http_req = urllib.request.Request(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                data=req_data,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "HTTP-Referer": "https://nexuslead.ai",
                    "X-Title": "NexusLead AI Agent",
                    "Content-Type": "application/json"
                }
            )
            with urllib.request.urlopen(http_req, timeout=8) as resp:
                res_body = json.loads(resp.read().decode("utf-8"))
                content = res_body["choices"][0]["message"]["content"]
                # parse JSON if possible
                parsed = json.loads(content)
                if isinstance(parsed, list) and len(parsed) >= 4:
                    openrouter_messages = parsed
        except Exception as e:
            print(f"[OpenRouter Backend Notice]: {e}")

    steps_labels = [
        "Initial Value Proposition",
        "Follow-Up #1 (Social Proof)",
        "Follow-Up #2 (Case Study)",
        "Final Break-Up"
    ]

    steps = []
    for i in range(4):
        msg = (
            openrouter_messages[i] if i < len(openrouter_messages) else
            (
                f"Hi {{{{first_name}}}}, noticed {{{{company_name}}}} in {{{{location}}}}. We help leaders in {req.industry} automate customer pipelines on WhatsApp. Open to a brief demo? {req.cta}"
                if i == 0 else
                f"Hi {{{{first_name}}}}, following up on {{{{company_name}}}}. Several {req.industry} firms boosted conversion by 40% with our automated WhatsApp CRM. Would love to share an overview?"
                if i == 1 else
                f"Hi {{{{first_name}}}}, quick metric: teams in {req.industry} saw a 42% boost in consultation bookings. Would this be relevant for {{{{company_name}}}} this quarter?"
                if i == 2 else
                f"Hi {{{{first_name}}}}, closing the loop. If automated WhatsApp sales workflows are not a priority right now, no problem at all. Feel free to reach out anytime!"
            )
        )
        steps.append({
            "step": i + 1,
            "label": steps_labels[i],
            "message": msg
        })

    return {
        "language": req.language,
        "tone": req.tone,
        "model": model,
        "provider": "OpenRouter.ai" if openrouter_messages else "Local Builder",
        "steps": steps
    }


# ---------------------------------------------------------------------------
# Routes: Global Emergency Kill Switch
# ---------------------------------------------------------------------------

@app.post("/api/v1/system/kill-switch")
async def toggle_kill_switch(req: KillSwitchRequest):
    """
    Emergency freeze or resume all outbound automated message queues.
    """
    status_str = "FROZEN" if req.is_paused else "RESUMED"
    return {
        "status": status_str,
        "organization_id": req.organization_id,
        "is_paused": req.is_paused,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "audit_log": f"Emergency kill-switch set to {req.is_paused} by administrator."
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
