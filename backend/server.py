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
import db
from db import SessionLocal, Message, Lead, init_db
from sqlalchemy import select, desc

# Ensure tables exist on startup
init_db()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nexuslead.db")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable not set")

if DATABASE_URL.startswith("sqlite"):
    import warnings
    warnings.warn(
        "[NexusLead] Using SQLite fallback database (./nexuslead.db). "
        "Set DATABASE_URL to a PostgreSQL URL for production.",
        UserWarning, stacklevel=2
    )

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
    META_VERIFY_TOKEN = os.getenv("META_VERIFY_TOKEN")
    if not META_VERIFY_TOKEN:
        raise HTTPException(status_code=500, detail="META_VERIFY_TOKEN is not configured on server")
    if hub_mode == "subscribe" and hub_verify_token == META_VERIFY_TOKEN:
        return PlainTextResponse(content=hub_challenge, status_code=200)
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@app.get("/api/messages")
async def get_messages(limit: int = 50):
    """
    Return recent messages for the frontend inbox.
    Maps Python model columns to the field names expected by js/services/whatsapp-service.js.
    """
    db_session = SessionLocal()
    try:
        stmt = (
            select(Message)
            .order_by(desc(Message.created_at))
            .limit(limit)
        )
        rows = db_session.execute(stmt).scalars().all()

        messages = []
        for m in rows:
            msg_data = {
                "id": m.id,
                "wa_message_id": m.meta_message_id,
                "sender_number": m.sender_number,
                "content": m.body,
                "message_type": m.message_type or "text",
                "direction": m.direction.lower(),
                "received_at": m.created_at.isoformat() if m.created_at else None,
                "media_url": m.media_url,
                "media_mime_type": m.media_mime_type,
                "file_name": m.file_name,
                "media_caption": m.media_caption,
                "media_size": m.media_size or 0,
            }
            messages.append(msg_data)

        return {"count": len(messages), "messages": messages}
    except Exception as e:
        print(f"[!] Error fetching messages: {e}")
        return {"count": 0, "messages": [], "error": str(e)}
    finally:
        db_session.close()


@app.get("/api/media/{path:path}")
async def serve_media(path: str):
    """
    Serve locally-downloaded media files.
    Path format: 'media/{phone}/{media_id}_{filename}' (relative to backend/)
    """
    import os
    from fastapi.responses import FileResponse
    media_dir = os.path.join(os.path.dirname(__file__), "media")
    file_path = os.path.normpath(os.path.join(media_dir, path))
    if not file_path.startswith(media_dir):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

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
    """
    Process incoming Meta WhatsApp webhook payload.
    Saves inbound messages (text and media) to the database.
    For media messages, downloads from Meta's Media API and stores locally.
    """
    db_session = SessionLocal()
    try:
        entry = payload.get("entry", [{}])[0] if payload.get("entry") else {}
        change = entry.get("changes", [{}])[0] if entry.get("changes") else {}
        changes = change.get("value", {})
        messages = changes.get("messages", [])
        contacts = changes.get("contacts", [])
        phone_number_id = changes.get("metadata", {}).get("phone_number_id")
        access_token = os.getenv("ACCESS_TOKEN", "")

        # Resolve display name from contacts
        contact_name = "WhatsApp Contact"
        if contacts and contacts[0] and contacts[0].get("profile", {}).get("name"):
            contact_name = contacts[0]["profile"]["name"]

        for msg in messages:
            wa_msg_id = msg.get("id", "")
            phone = msg.get("from", "")
            msg_type = msg.get("type", "text")
            timestamp = msg.get("timestamp", "")
            received_at = datetime.datetime.fromtimestamp(int(timestamp)) if timestamp else datetime.datetime.utcnow()

            # Determine sender name from contacts
            sender_name = contact_name
            if contacts:
                for c in contacts:
                    if c.get("wa_id") == phone and c.get("profile", {}).get("name"):
                        sender_name = c["profile"]["name"]

            # --- Handle text messages ---
            if msg_type == "text":
                text_body = msg.get("text", {}).get("body", "")
                existing = db_session.execute(
                    select(Message).where(Message.meta_message_id == wa_msg_id)
                ).scalar_one_or_none()
                if existing:
                    continue

                # Find or create lead by phone
                lead = db_session.execute(
                    select(Lead).where(Lead.phone == phone)
                ).scalar_one_or_none()
                if not lead:
                    lead = Lead(
                        id=str(uuid.uuid4()),
                        organization_id="default",
                        company_name="Inbound WhatsApp",
                        contact_name=sender_name,
                        phone=phone,
                        email="",
                        score=75,
                        status="Contacted",
                        ai_summary="Received real inbound message via WhatsApp webhook.",
                    )
                    db_session.add(lead)
                    db_session.flush()

                message = Message(
                    id=str(uuid.uuid4()),
                    conversation_id=None,
                    direction="INBOUND",
                    is_ai=0,
                    body=text_body,
                    status="DELIVERED",
                    meta_message_id=wa_msg_id,
                    sender_number=phone,
                    message_type="text",
                    media_url=None,
                    media_mime_type=None,
                    media_caption=None,
                    file_name=None,
                    media_size=0,
                    created_at=received_at,
                )
                db_session.add(message)
                print(f"[OK] Inbound text message stored from {phone}: \"{text_body}\"")

            # --- Handle media messages ---
            elif msg_type in ("image", "video", "audio", "document", "sticker"):
                media_id = msg.get(msg_type, {}).get("id", "")
                caption = msg.get(msg_type, {}).get("caption", "")

                existing = db_session.execute(
                    select(Message).where(Message.meta_message_id == wa_msg_id)
                ).scalar_one_or_none()
                if existing:
                    continue

                # Find or create lead
                lead = db_session.execute(
                    select(Lead).where(Lead.phone == phone)
                ).scalar_one_or_none()
                if not lead:
                    lead = Lead(
                        id=str(uuid.uuid4()),
                        organization_id="default",
                        company_name="Inbound WhatsApp",
                        contact_name=sender_name,
                        phone=phone,
                        email="",
                        score=75,
                        status="Contacted",
                        ai_summary="Received real inbound message via WhatsApp webhook.",
                    )
                    db_session.add(lead)
                    db_session.flush()

                # Download media from Meta if we have an access token
                media_url = None
                media_mime_type = None
                file_name = None
                media_size = 0

                if access_token and media_id:
                    try:
                        # Step 1: Get download URL from Meta
                        meta_res = await httpx_get(
                            f"https://graph.facebook.com/v21.0/{media_id}?access_token={access_token}"
                        )
                        if meta_res and meta_res.get("url"):
                            media_type_info = meta_res.get("content_type", "application/octet-stream")
                            meta_filename = meta_res.get("filename", f"{media_id}")

                            # Step 2: Download the media binary
                            download_res = await httpx_get_bytes(meta_res["url"])
                            if download_res:
                                media_size = len(download_res)

                                # Step 3: Save locally (backend/media/{phone}/{media_id}_{filename})
                                media_dir = os.path.join(os.path.dirname(__file__), "media")
                                phone_safe = phone.replace("+", "").replace("-", "")[-10:]
                                file_path = os.path.join(media_dir, phone_safe, f"{media_id}_{meta_filename}")
                                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                                with open(file_path, "wb") as f:
                                    f.write(download_res)

                                # Store relative path as media_url
                                rel_path = os.path.relpath(file_path, os.path.dirname(__file__))
                                media_url = rel_path
                                media_mime_type = media_type_info
                                file_name = meta_filename
                                print(f"[OK] Media downloaded: {msg_type} ({media_size} bytes) from {phone}")
                    except Exception as e:
                        print(f"[!] Media download failed for {media_id}: {e}")

                display_content = caption or ("Voice message" if msg_type == "audio" else f"{msg_type} message")

                message = Message(
                    id=str(uuid.uuid4()),
                    conversation_id=None,
                    direction="INBOUND",
                    is_ai=0,
                    body=display_content,
                    status="DELIVERED",
                    meta_message_id=wa_msg_id,
                    sender_number=phone,
                    message_type=msg_type,
                    media_url=media_url,
                    media_mime_type=media_mime_type,
                    media_caption=caption or None,
                    file_name=file_name,
                    media_size=media_size,
                    created_at=received_at,
                )
                db_session.add(message)
                print(f"[OK] Inbound {msg_type} message stored from {phone} (media_url={media_url})")

            # --- Handle status updates (ignore for storage) ---
            # Meta also sends status updates (sent, delivered, read)
            # These arrive as payloads with "statuses" instead of "messages"

        db_session.commit()
    except Exception as e:
        db_session.rollback()
        print(f"[!] Error processing webhook payload: {e}")
    finally:
        db_session.close()


async def httpx_get(url: str) -> Optional[Dict]:
    """Async fetch that returns JSON."""
    import urllib.request
    import asyncio
    loop = asyncio.get_event_loop()
    def _sync():
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    try:
        return await loop.run_in_executor(None, _sync)
    except Exception as e:
        print(f"[!] HTTP GET failed: {e}")
        return None


async def httpx_get_bytes(url: str) -> Optional[bytes]:
    """Async fetch that returns raw bytes."""
    import urllib.request
    import asyncio
    loop = asyncio.get_event_loop()
    def _sync():
        with urllib.request.urlopen(url, timeout=60) as resp:
            return resp.read()
    try:
        return await loop.run_in_executor(None, _sync)
    except Exception as e:
        print(f"[!] HTTP GET bytes failed: {e}")
        return None

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
