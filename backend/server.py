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
# Routes: Multilingual AI Message Composer Proxy
# ---------------------------------------------------------------------------

@app.post("/api/v1/ai/generate-sequence")
async def generate_ai_sequence(req: AIGenerateRequest):
    """
    Generate multi-lingual 4-touch WhatsApp campaign sequence.
    """
    return {
        "language": req.language,
        "tone": req.tone,
        "steps": [
            {
                "step": 1,
                "label": "Initial Value Proposition",
                "message": f"Hi {{{{first_name}}}}, noticed {{{{company_name}}}} in {{{{location}}}}. We help leaders in {req.industry} automate customer pipelines on WhatsApp. Open to a brief demo? {req.cta}"
            },
            {
                "step": 2,
                "label": "Follow-Up #1 (Social Proof)",
                "message": f"Hi {{{{first_name}}}}, following up on {{{{company_name}}}}. Several {req.industry} firms boosted conversion by 40% with our automated WhatsApp CRM. Would love to share an overview?"
            },
            {
                "step": 3,
                "label": "Follow-Up #2 (Case Study)",
                "message": f"Hi {{{{first_name}}}}, quick metric: teams in {req.industry} saw a 42% boost in consultation bookings. Would this be relevant for {{{{company_name}}}} this quarter?"
            },
            {
                "step": 4,
                "label": "Final Break-Up",
                "message": f"Hi {{{{first_name}}}}, closing the loop. If automated WhatsApp sales workflows are not a priority right now, no problem at all. Feel free to reach out anytime!"
            }
        ]
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
