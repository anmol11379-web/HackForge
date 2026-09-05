"""FastAPI REST API routes for Fintech Settlement Q&A Agent."""

import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, status

from app.config import settings
from app.data.repository import repository
from app.models.schemas import (
    SettlementQueryRequest,
    SettlementQueryResponse,
    BatchQueryResponse,
    ExceptionListResponse,
    ReloadDataResponse,
    HealthResponse,
)
from app.models.domain import SettlementTraceResult, SettlementStatus
from app.services.tracer import SettlementTracer
from app.services.explainer import explainer, extract_identifiers_from_query
from app.services.exceptions import collect_all_exceptions

logger = logging.getLogger(__name__)

router = APIRouter()
tracer = SettlementTracer(repository)


@router.post(
    "/settlements/query",
    response_model=SettlementQueryResponse,
    summary="Ask settlement Q&A questions",
    description="Processes natural language questions or structured parameters (payment_id, date, merchant_id) to trace settlement lifecycle and explain delays/failures.",
)
def query_settlement(req: SettlementQueryRequest):
    payment_id = req.payment_id
    date_filter = req.date
    merchant_id = req.merchant_id

    # If payment_id was not explicitly passed, attempt extraction from the natural language query
    if not payment_id and req.query:
        extracted_pid, extracted_date, _ = extract_identifiers_from_query(req.query)
        if extracted_pid:
            payment_id = extracted_pid
        if not date_filter and extracted_date:
            date_filter = extracted_date

    # If we have a payment_id (or order_id), perform a single transaction trace and explanation
    if payment_id:
        trace = tracer.trace_payment(payment_id)
        explanation = explainer.explain(trace, req.query)
        return explanation

    # If no single payment_id was provided, check if date or merchant_id filters match any payments
    if date_filter or merchant_id:
        matched_pids = repository.find_payments(merchant_id=merchant_id, date_str=date_filter)
        if not matched_pids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No settlement transactions found matching date='{date_filter}' or merchant_id='{merchant_id}'."
            )
        # Trace the first matching payment as primary and summarize
        first_pid = matched_pids[0]
        trace = tracer.trace_payment(first_pid)
        explanation = explainer.explain(trace, req.query)
        explanation.plain_english_summary += (
            f" [Note: Found {len(matched_pids)} matching transactions ({', '.join(matched_pids[:5])}). Displaying details for {first_pid}.]"
        )
        return explanation

    # If natural language query was provided without specific IDs, answer as a general/conceptual query
    if req.query and req.query.strip():
        return explainer.explain_general_query(req.query.strip())

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Please provide a question, payment ID (e.g. pay_success_001), or filter parameter (date, merchant_id)."
    )


@router.get(
    "/settlements/trace/{payment_id}",
    response_model=SettlementTraceResult,
    summary="Direct 3-way trace of a payment ID",
    description="Reconciles Gateway, Ledger, and Bank data to return the complete cross-system timeline and status.",
)
def trace_single_payment(payment_id: str):
    trace = tracer.trace_payment(payment_id)
    if trace.overall_status == SettlementStatus.UNKNOWN and trace.stage == "NOT_FOUND":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{payment_id}' not found in gateway, ledger, or bank logs."
        )
    return trace


@router.get(
    "/settlements/exceptions",
    response_model=ExceptionListResponse,
    summary="Get honest exception list",
    description="Returns all active anomalies and low-confidence transactions across the datasets requiring manual ops review.",
)
def list_exceptions():
    exceptions = collect_all_exceptions(tracer)
    high_count = sum(1 for e in exceptions if e.severity in ["HIGH", "CRITICAL"])
    return ExceptionListResponse(
        total_exceptions=len(exceptions),
        high_severity_count=high_count,
        exceptions=exceptions,
    )


@router.post(
    "/data/reload",
    response_model=ReloadDataResponse,
    summary="Hot-reload mock CSV data",
    description="Reloads and re-indexes the Gateway, Bank, and Ledger CSV files from disk.",
)
def reload_datasets():
    counts = repository.load_all()
    return ReloadDataResponse(
        success=True,
        message="Successfully reloaded all CSV datasets.",
        gateway_records_loaded=counts["gateway_records"],
        bank_records_loaded=counts["bank_records"],
        ledger_records_loaded=counts["ledger_records"],
    )


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check",
    description="Returns API status, active LLM provider, and loaded record counts.",
)
def health_check():
    all_pids = repository.get_all_payment_ids()
    active_provider = settings.LLM_PROVIDER
    if active_provider == "auto":
        if settings.GEMINI_API_KEY:
            active_provider = "gemini"
        elif settings.GROQ_API_KEY:
            active_provider = "groq"
        else:
            active_provider = "deterministic_fallback"

    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        llm_provider=active_provider,
        datasets={
            "gateway_records": len(repository.gateway_by_id),
            "bank_records": len(repository.bank_by_payment_id),
            "ledger_records": sum(len(entries) for entries in repository.ledger_by_payment_id.values()),
            "unique_payments": len(all_pids),
        },
    )
