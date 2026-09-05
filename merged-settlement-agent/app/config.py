"""Application Configuration for Settlement Q&A Agent."""

import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

class Settings(BaseModel):
    PROJECT_NAME: str = "Fintech Settlement Q&A Agent"
    VERSION: str = "1.0.0"
    BASE_DIR: Path = BASE_DIR
    DATA_DIR: Path = DATA_DIR
    API_V1_PREFIX: str = "/api/v1"
    
    # Paths to mock CSV data files
    GATEWAY_CSV_PATH: Path = DATA_DIR / "gateway_logs.csv"
    BANK_CSV_PATH: Path = DATA_DIR / "bank_settlement_records.csv"
    LEDGER_CSV_PATH: Path = DATA_DIR / "ledger_entries.csv"
    
    # LLM Settings
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "auto")  # "gemini", "groq", "deterministic", or "auto"
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    
    # Settlement SLA parameters
    DEFAULT_SLA_DAYS: int = int(os.getenv("DEFAULT_SLA_DAYS", "1"))  # T+1 business day default
    
    # Recognized bank holidays (YYYY-MM-DD) for business-day calculations
    BANK_HOLIDAYS: list[str] = [
        "2026-01-01",  # New Year's Day
        "2026-01-26",  # Republic Day
        "2026-03-04",  # Holi
        "2026-04-14",  # Dr. Ambedkar Jayanti
        "2026-05-01",  # May Day
        "2026-08-15",  # Independence Day
        "2026-09-02",  # Ganesh Chaturthi
        "2026-10-02",  # Gandhi Jayanti
        "2026-10-20",  # Dussehra
        "2026-11-09",  # Diwali
        "2026-12-25",  # Christmas
    ]

settings = Settings()
