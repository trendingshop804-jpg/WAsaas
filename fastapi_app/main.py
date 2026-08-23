from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
import os

# Import from the same package
from fastapi_app.db import SessionLocal, WhatsAppLog

app = FastAPI(title="WhatsApp CRM Health Monitor")

# ------------------- Static file serving (no-cache) -------------------
static_dir = Path(__file__).resolve().parent.parent / "frontend" / "build"

class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response: Response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

if static_dir.is_dir():
    app.mount("/", NoCacheStaticFiles(directory=str(static_dir), html=True))

# Load threshold from .env or default to 5 minutes
THRESHOLD_MINUTES = int(os.getenv("THRESHOLD_MINUTES", "5"))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/health-report")
def health_report(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    window_start = now - timedelta(minutes=THRESHOLD_MINUTES)

    inbound_count = (
        db.query(WhatsAppLog)
        .filter(
            WhatsAppLog.direction == "inbound",
            WhatsAppLog.timestamp >= window_start,
        )
        .count()
    )
    outbound_count = (
        db.query(WhatsAppLog)
        .filter(
            WhatsAppLog.direction == "outbound",
            WhatsAppLog.timestamp >= window_start,
        )
        .count()
    )

    inbound_active = inbound_count > 0
    outbound_active = outbound_count > 0

    alert = None
    if not inbound_active:
        alert = "critical"

    return {
        "inbound_active": inbound_active,
        "outbound_active": outbound_active,
        "inbound_messages_last_5min": inbound_count,
        "outbound_messages_last_5min": outbound_count,
        "alert": alert,
        "threshold_minutes": THRESHOLD_MINUTES,
    }
