"""
NexusLead AI — Database Layer (SQLAlchemy)

Provides the engine, session factory, and table definitions for the backend.
Supports both PostgreSQL (production) and SQLite (local development).
"""

import os
from sqlalchemy import create_engine, MetaData, Table, Column, String, Text, Integer, DateTime, ForeignKey, JSON, func, select
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nexuslead.db")

if DATABASE_URL.startswith("sqlite"):
    # SQLite needs StaticPool for in-memory and check_same_thread=False for multi-thread access
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(DATABASE_URL, pool_size=5, max_overflow=10)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)

Base = declarative_base()


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    direction = Column(String(20), nullable=False)  # 'INBOUND' or 'OUTBOUND'
    is_ai = Column(Integer, default=0)  # 0=false, 1=true (SQLite doesn't have native BOOLEAN)
    body = Column(Text)  # text content / caption
    status = Column(String(50), default="SENT")
    meta_message_id = Column(String(100), index=True)  # WhatsApp message ID (wa_message_id)
    sender_number = Column(String(50), index=True)
    message_type = Column(String(20), default="text")  # text, image, video, audio, document, sticker
    media_url = Column(Text)  # storage path for private bucket
    media_mime_type = Column(String(100))
    media_caption = Column(Text)
    file_name = Column(String(255))
    media_size = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now(), server_default=func.now())


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=func.now(), server_default=func.now())


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"))
    lead_id = Column(String, ForeignKey("leads.id", ondelete="CASCADE"), unique=True)
    mode = Column(String(20), default="AI")
    unread_count = Column(Integer, default=0)
    last_message = Column(Text)
    last_timestamp = Column(DateTime, default=func.now(), server_default=func.now())
    created_at = Column(DateTime, default=func.now(), server_default=func.now())


class Lead(Base):
    __tablename__ = "leads"

    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"))
    company_name = Column(String(255))
    contact_name = Column(String(200))
    phone = Column(String(50), index=True)
    email = Column(String(255))
    source = Column(String(100), default="Discovery")
    score = Column(Integer, default=50)
    status = Column(String(50), default="NEW")
    ai_summary = Column(Text)
    last_contacted_at = Column(DateTime)
    opted_out = Column(Integer, default=0)
    opted_out_at = Column(DateTime)
    next_followup_at = Column(DateTime)
    followup_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now(), server_default=func.now())


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)
