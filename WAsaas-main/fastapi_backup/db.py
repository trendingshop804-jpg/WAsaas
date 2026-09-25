from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# SQLite file shared with Node backend (project root)
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'whatsapp_logs.db'))
engine = create_engine(f'sqlite:///{DB_PATH}', connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class WhatsAppLog(Base):
    __tablename__ = 'whatsapp_logs'
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(String, index=True)
    direction = Column(String)  # inbound/outbound
    status = Column(String)
    timestamp = Column(DateTime, default="CURRENT_TIMESTAMP")
    raw = Column(Text)

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)
