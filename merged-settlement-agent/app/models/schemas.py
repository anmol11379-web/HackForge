"""API Request and Response Pydantic schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from app.models.domain import SettlementStatus, TimelineStep, HonestException, SettlementTraceResult


class SettlementQueryRequest(BaseModel):
    query: Optional[str] = Field(
        None,
        description="Natural language question, e.g. 'Why was payment pay_fail_bank_ifsc_001 not settled?'"
    )
    payment_id: Optional[str] = Field(
        None,
        description="Explicit Razorpay-style payment ID (e.g., pay_success_001)"
    )
    date: Optional[str] = Field(
        None,
        description="Transaction or settlement date filter (YYYY-MM-DD)"
    )
    merchant_id: Optional[str] = Field(
        None,
        description="Merchant account identifier (e.g., acc_merch_001)"
    )


class SettlementQueryResponse(BaseModel):
    headline_status: str
    plain_english_summary: str
    overall_status: SettlementStatus
    delay_or_failure_reason: Optional[str] = None
    expected_settlement_date: Optional[str] = None
    actual_settlement_date: Optional[str] = None
    utr: Optional[str] = None
    timeline: List[TimelineStep] = Field(default_factory=list)
    next_actions_merchant: List[str] = Field(default_factory=list)
    next_actions_support: List[str] = Field(default_factory=list)
    is_exception: bool = False
    confidence_score: float = 1.0
    exception_details: Optional[HonestException] = None
    trace_data: Optional[SettlementTraceResult] = None
    is_general_query: bool = False


class BatchQueryResponse(BaseModel):
    total_found: int
    results: List[SettlementQueryResponse]


class ExceptionListResponse(BaseModel):
    total_exceptions: int
    high_severity_count: int
    exceptions: List[HonestException]


class ReloadDataResponse(BaseModel):
    success: bool
    message: str
    gateway_records_loaded: int
    bank_records_loaded: int
    ledger_records_loaded: int


class HealthResponse(BaseModel):
    status: str
    version: str
    llm_provider: str
    datasets: Dict[str, int]
