"""Main entrypoint for Settlement Q&A Agent FastAPI application."""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import settings
from app.data.mock_generator import generate_mock_datasets
from app.data.repository import repository
from app.api.routes import router as api_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("settlement_agent")

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensures mock datasets exist on startup and repository is loaded."""
    if (
        not settings.GATEWAY_CSV_PATH.exists()
        or not settings.BANK_CSV_PATH.exists()
        or not settings.LEDGER_CSV_PATH.exists()
    ):
        logger.info("Mock CSV datasets missing. Auto-generating fresh datasets...")
        generate_mock_datasets(settings.DATA_DIR)

    counts = repository.load_all()
    logger.info(f"Settlement Data Repository ready: {counts}")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "Production backend module for PS-8: Settlement Q&A Agent for Fintech Support. "
        "Traces transactions across Gateway, Bank, and Ledger logs, provides plain-English "
        "delay/failure explanations, and manages an honest exception list for operational review."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Enable CORS for frontend teammates (Vite, React, Next.js, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix=settings.API_V1_PREFIX, tags=["Settlements & Reconciliation"])
app.include_router(api_router, tags=["Root Endpoints"])  # Also exposes /health at root


@app.get("/", include_in_schema=False)
def root_redirect():
    """Serve the single-page frontend from the same FastAPI process."""
    return FileResponse(settings.BASE_DIR / "frontend" / "index.html")


if __name__ == "__main__":
    import os
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
