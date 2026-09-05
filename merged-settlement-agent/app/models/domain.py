"""Domain entities and internal data structures."""

from enum import Enum
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class SettlementStatus(str, Enum):
    SETTLED = "SETTLED"
    IN_PROGRESS = "IN_PROGRESS"
    DELAYED = "DELAYED"
    FAILED = "FAILED"
    ON_HOLD = "ON_HOLD"
    EXCEPTION = "EXCEPTION"
    UNKNOWN = "UNKNOWN"
    INFO = "INFO"


class GatewayStatus(str, Enum):
    CAPTURED = "captured"
    FAILED = "failed"
    AUTHORIZED = "authorized"
    REFUNDED = "refunded"


class BankStatus(str, Enum):
    PROCESSED = "processed"
    FAILED = "failed"
    ON_HOLD = "on_hold"
    PENDING = "pending"


class LedgerStatus(str, Enum):
    POSTED = "posted"
    PENDING_CLEARANCE = "pending_clearance"
    DISPUTED = "disputed"
    RESERVE_HOLD = "reserve_hold"


class GatewayTransaction(BaseModel):
    payment_id: str
    order_id: str
    merchant_id: str
    amount_inr: float
    currency: str = "INR"
    status: str
    method: str
    captured_at: Optional[str] = None
    fee_inr: float = 0.0
    tax_inr: float = 0.0
    error_code: Optional[str] = None
    error_description: Optional[str] = None
    risk_level: str = "normal"


class BankSettlementRecord(BaseModel):
    settlement_id: str
    payment_id: str
    utr: Optional[str] = None
    merchant_id: str
    bank_account_num: str
    ifsc: str
    gross_amount_inr: float
    net_amount_inr: float
    status: str
    failure_reason: Optional[str] = None
    initiated_at: Optional[str] = None
    settled_at: Optional[str] = None


class LedgerEntry(BaseModel):
    entry_id: str
    payment_id: str
    settlement_id: Optional[str] = None
    merchant_id: str
    account_type: str  # merchant_payable, fee_expense, reserve_hold, bank_clearing
    amount_inr: float
    entry_type: str  # credit, debit
    post_date: str
    status: str
    hold_reason: Optional[str] = None


class TimelineStep(BaseModel):
    timestamp: str
    system: str  # GATEWAY, LEDGER, BANK
    action: str
    status: str
    details: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class HonestException(BaseModel):
    exception_id: str
    payment_id: str
    merchant_id: Optional[str] = None
    exception_type: str  # MISSING_BANK_RECORD, MISSING_LEDGER_ENTRY, STATUS_CONFLICT, UNEXPLAINED_VARIANCE, etc.
    severity: str  # LOW, MEDIUM, HIGH, CRITICAL
    reason: str
    missing_evidence: List[str] = Field(default_factory=list)
    conflicting_data: Dict[str, Any] = Field(default_factory=dict)
    recommended_ops_action: str
    confidence_score: float  # 0.0 to 1.0 (lower means more uncertainty)
    detected_at: str


class SettlementTraceResult(BaseModel):
    payment_id: str
    order_id: Optional[str] = None
    merchant_id: Optional[str] = None
    captured_amount: Optional[float] = None
    net_settlement_amount: Optional[float] = None
    fee_inr: Optional[float] = None
    tax_inr: Optional[float] = None
    
    # State in each system
    gateway_status: Optional[str] = None
    ledger_status: Optional[str] = None
    bank_status: Optional[str] = None
    
    # Reconciled high-level state
    overall_status: SettlementStatus
    stage: str  # "GATEWAY", "LEDGER", "BANK", "COMPLETED"
    
    # SLA & Timing
    captured_at: Optional[str] = None
    expected_settlement_date: Optional[str] = None
    actual_settlement_date: Optional[str] = None
    utr: Optional[str] = None
    
    # Root cause analysis
    is_delayed: bool = False
    is_failed: bool = False
    delay_or_failure_reason: Optional[str] = None
    failure_category: Optional[str] = None  # GATEWAY_FAILURE, BANK_NETWORK, COMPLIANCE_HOLD, DATA_MISMATCH, SLA_IN_PROGRESS
    
    # Timeline
    timeline: List[TimelineStep] = Field(default_factory=list)
    
    # Honest Exception flagging
    is_exception: bool = False
    exception_details: Optional[HonestException] = None
    confidence_score: float = 1.0  # 1.0 = fully confident, <0.75 = needs support review
    
    # Raw references
    gateway_record: Optional[Dict[str, Any]] = None
    bank_record: Optional[Dict[str, Any]] = None
    ledger_records: List[Dict[str, Any]] = Field(default_factory=list)
