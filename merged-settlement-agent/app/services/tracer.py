"""Reconciliation and 3-way tracing engine across Gateway, Bank, and Ledger."""

from datetime import datetime, timedelta, date
from typing import Optional, List, Dict, Any, Tuple

from app.config import settings
from app.data.repository import repository, SettlementDataRepository
from app.models.domain import (
    SettlementStatus,
    SettlementTraceResult,
    TimelineStep,
    GatewayTransaction,
    BankSettlementRecord,
    LedgerEntry,
)
from app.services.exceptions import detect_honest_exception


def calculate_expected_settlement_date(
    captured_at_str: Optional[str],
    sla_days: int = 1,
) -> Optional[str]:
    """Calculates expected settlement date (T+N business days, excluding weekends & holidays)."""
    if not captured_at_str:
        return None

    try:
        # Parse datetime format "YYYY-MM-DD HH:MM:SS" or date "YYYY-MM-DD"
        dt = datetime.strptime(captured_at_str.split(".")[0], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            dt = datetime.strptime(captured_at_str, "%Y-%m-%d")
        except ValueError:
            return None

    current_date = dt.date()
    added_days = 0

    # If captured on or after 18:00 (cut-off time), start counting from next calendar day
    if hasattr(dt, "hour") and dt.hour >= 18:
        current_date += timedelta(days=1)

    while added_days < sla_days:
        current_date += timedelta(days=1)
        # Check weekend: 5 = Saturday, 6 = Sunday
        if current_date.weekday() >= 5:
            continue
        # Check bank holiday
        if current_date.isoformat() in settings.BANK_HOLIDAYS:
            continue
        added_days += 1

    return current_date.isoformat()


class SettlementTracer:
    """Core tracing engine cross-referencing Gateway, Bank, and Ledger records."""

    def __init__(self, repo: Optional[SettlementDataRepository] = None):
        self.repo = repo or repository

    def trace_payment(self, payment_id: str) -> SettlementTraceResult:
        """Traces a payment ID across Gateway, Bank, and Ledger datasets."""
        payment_id = payment_id.strip()

        # 1. Fetch records
        gw: Optional[GatewayTransaction] = self.repo.get_gateway(payment_id)
        bank: Optional[BankSettlementRecord] = self.repo.get_bank(payment_id)
        ledger_entries: List[LedgerEntry] = self.repo.get_ledger(payment_id)

        # If not found directly in gateway, try searching by order ID
        if not gw and not bank and not ledger_entries:
            gw = self.repo.get_gateway_by_order(payment_id)
            if gw:
                payment_id = gw.payment_id
                bank = self.repo.get_bank(payment_id)
                ledger_entries = self.repo.get_ledger(payment_id)

        # Build timeline
        timeline: List[TimelineStep] = []

        # Gateway details
        order_id = gw.order_id if gw else None
        merchant_id = (
            gw.merchant_id
            if gw
            else (bank.merchant_id if bank else (ledger_entries[0].merchant_id if ledger_entries else None))
        )
        captured_amount = gw.amount_inr if gw else (bank.gross_amount_inr if bank else None)
        fee_inr = gw.fee_inr if gw else 0.0
        tax_inr = gw.tax_inr if gw else 0.0
        captured_at = gw.captured_at if gw else None

        net_settlement_amount = None
        if gw and gw.status == "captured":
            net_settlement_amount = round(gw.amount_inr - gw.fee_inr - gw.tax_inr, 2)
        elif bank:
            net_settlement_amount = bank.net_amount_inr

        # Calculate SLA
        expected_settlement_date = calculate_expected_settlement_date(
            captured_at, settings.DEFAULT_SLA_DAYS
        )

        # Add Gateway step to timeline
        if gw:
            timeline.append(
                TimelineStep(
                    timestamp=gw.captured_at or "N/A",
                    system="GATEWAY",
                    action=f"Payment {gw.status.upper()}",
                    status=gw.status,
                    details=(
                        f"Amount: INR {gw.amount_inr:.2f}, Method: {gw.method.upper()}, "
                        f"Fee: INR {gw.fee_inr:.2f}, Tax: INR {gw.tax_inr:.2f}. "
                        + (f"Error: [{gw.error_code}] {gw.error_description}" if gw.error_code else "Captured successfully.")
                    ),
                    metadata={
                        "risk_level": gw.risk_level,
                        "order_id": gw.order_id,
                    },
                )
            )
        else:
            timeline.append(
                TimelineStep(
                    timestamp="N/A",
                    system="GATEWAY",
                    action="GATEWAY_RECORD_MISSING",
                    status="MISSING",
                    details="No payment gateway record found for this transaction ID.",
                )
            )

        # Add Ledger steps to timeline
        if ledger_entries:
            for le in ledger_entries:
                timeline.append(
                    TimelineStep(
                        timestamp=le.post_date,
                        system="LEDGER",
                        action=f"LEDGER_{le.account_type.upper()}_{le.entry_type.upper()}",
                        status=le.status,
                        details=(
                            f"Entry {le.entry_id}: INR {le.amount_inr:.2f} {le.entry_type} "
                            f"to {le.account_type} (Status: {le.status})"
                            + (f", Hold Reason: {le.hold_reason}" if le.hold_reason else "")
                        ),
                        metadata={"entry_id": le.entry_id, "hold_reason": le.hold_reason},
                    )
                )
        else:
            timeline.append(
                TimelineStep(
                    timestamp="N/A",
                    system="LEDGER",
                    action="LEDGER_RECORD_MISSING",
                    status="MISSING",
                    details="No internal ledger postings found for this transaction ID.",
                )
            )

        # Add Bank steps to timeline
        if bank:
            timeline.append(
                TimelineStep(
                    timestamp=bank.initiated_at or "N/A",
                    system="BANK",
                    action="SETTLEMENT_BATCH_INITIATED",
                    status=bank.status,
                    details=(
                        f"Settlement ID: {bank.settlement_id}, Net Amount: INR {bank.net_amount_inr:.2f}, "
                        f"Account: {bank.bank_account_num}, IFSC: {bank.ifsc}. Status: {bank.status}."
                        + (f" Reason: {bank.failure_reason}" if bank.failure_reason else "")
                    ),
                    metadata={"settlement_id": bank.settlement_id, "utr": bank.utr},
                )
            )
            if bank.settled_at:
                timeline.append(
                    TimelineStep(
                        timestamp=bank.settled_at,
                        system="BANK",
                        action="FUNDS_CREDITED_UTR",
                        status="processed",
                        details=f"Funds cleared by bank with UTR: {bank.utr}",
                        metadata={"utr": bank.utr},
                    )
                )
        else:
            timeline.append(
                TimelineStep(
                    timestamp="N/A",
                    system="BANK",
                    action="BANK_RECORD_MISSING",
                    status="MISSING",
                    details="No bank settlement payout record found for this transaction ID.",
                )
            )

        # Determine overall status and root cause
        overall_status = SettlementStatus.UNKNOWN
        stage = "UNKNOWN"
        is_delayed = False
        is_failed = False
        delay_or_failure_reason = None
        failure_category = None
        utr = bank.utr if bank else None
        actual_settlement_date = bank.settled_at if bank else None

        # Scenario Evaluation Logic:
        # Case A: Not found in any system
        if not gw and not bank and not ledger_entries:
            overall_status = SettlementStatus.UNKNOWN
            stage = "NOT_FOUND"
            is_failed = True
            delay_or_failure_reason = f"Transaction '{payment_id}' was not found across Gateway, Ledger, or Bank records."
            failure_category = "INVALID_TRANSACTION_ID"

        # Case B: Gateway Failed (Payment never captured)
        elif gw and gw.status == "failed":
            overall_status = SettlementStatus.FAILED
            stage = "GATEWAY"
            is_failed = True
            delay_or_failure_reason = (
                f"Payment was declined/failed at the payment gateway: [{gw.error_code}] {gw.error_description}. "
                "Because customer funds were not captured, no settlement payout was generated."
            )
            failure_category = "GATEWAY_FAILURE"

        # Case C: Gateway Refunded (Payment refunded to customer)
        elif gw and gw.status == "refunded" and not (bank and bank.status == "processed"):
            overall_status = SettlementStatus.ON_HOLD
            stage = "GATEWAY"
            is_failed = False
            delay_or_failure_reason = "Payment was refunded to the customer; merchant settlement cancelled/reversed."
            failure_category = "REFUNDED"

        # Case D: Compliance / Risk Hold in Ledger
        elif any(le.status == "reserve_hold" for le in ledger_entries):
            hold_entry = next(le for le in ledger_entries if le.status == "reserve_hold")
            overall_status = SettlementStatus.ON_HOLD
            stage = "LEDGER"
            is_delayed = True
            delay_or_failure_reason = (
                f"Settlement payout is placed on compliance hold: {hold_entry.hold_reason or 'Risk Review'}. "
                + ("High fraud risk score detected on payment." if gw and gw.risk_level == "high" else "Merchant KYC / verification pending.")
            )
            failure_category = "COMPLIANCE_HOLD"

        # Case E: Bank Payout Failed (Invalid IFSC, Frozen Account, etc.)
        elif bank and bank.status == "failed":
            overall_status = SettlementStatus.FAILED
            stage = "BANK"
            is_failed = True
            delay_or_failure_reason = f"Bank payout transfer failed: {bank.failure_reason}"
            failure_category = "BANK_REJECTION"

        # Case F: Bank Status Pending / Delayed (e.g. Bank Holiday)
        elif bank and bank.status == "pending":
            stage = "BANK"
            if bank.failure_reason and "BANK_HOLIDAY" in bank.failure_reason:
                overall_status = SettlementStatus.DELAYED
                is_delayed = True
                delay_or_failure_reason = (
                    f"Settlement is queued due to non-clearing bank holiday/weekend: {bank.failure_reason}. "
                    f"Expected settlement date is {expected_settlement_date or 'next working business day'}."
                )
                failure_category = "BANK_HOLIDAY_DELAY"
            else:
                # Check SLA
                today_str = datetime.now().strftime("%Y-%m-%d")
                if expected_settlement_date and today_str > expected_settlement_date:
                    overall_status = SettlementStatus.DELAYED
                    is_delayed = True
                    delay_or_failure_reason = f"Settlement is delayed beyond expected SLA date ({expected_settlement_date}). Bank batch is still pending clearance."
                    failure_category = "BANK_DELAY_OVERDUE"
                else:
                    overall_status = SettlementStatus.IN_PROGRESS
                    is_delayed = False
                    delay_or_failure_reason = f"Settlement is actively processing within normal SLA cycle (Expected: {expected_settlement_date})."
                    failure_category = "SLA_IN_PROGRESS"

        # Case G: Settled successfully with UTR
        elif bank and bank.status == "processed" and bank.utr:
            overall_status = SettlementStatus.SETTLED
            stage = "COMPLETED"
            delay_or_failure_reason = f"Settlement successfully processed and credited to merchant account {bank.bank_account_num} with UTR {bank.utr} on {bank.settled_at}."
            failure_category = "SETTLED_SUCCESS"

        # Case H: Other / Missing states
        else:
            stage = "UNKNOWN"
            overall_status = SettlementStatus.EXCEPTION
            delay_or_failure_reason = "Transaction state is irregular across systems."
            failure_category = "DATA_INCONSISTENCY"

        # Assemble Result
        trace_result = SettlementTraceResult(
            payment_id=payment_id,
            order_id=order_id,
            merchant_id=merchant_id,
            captured_amount=captured_amount,
            net_settlement_amount=net_settlement_amount,
            fee_inr=fee_inr,
            tax_inr=tax_inr,
            gateway_status=gw.status if gw else None,
            ledger_status=ledger_entries[0].status if ledger_entries else None,
            bank_status=bank.status if bank else None,
            overall_status=overall_status,
            stage=stage,
            captured_at=captured_at,
            expected_settlement_date=expected_settlement_date,
            actual_settlement_date=actual_settlement_date,
            utr=utr,
            is_delayed=is_delayed,
            is_failed=is_failed,
            delay_or_failure_reason=delay_or_failure_reason,
            failure_category=failure_category,
            timeline=timeline,
            confidence_score=1.0,
            is_exception=False,
            exception_details=None,
            gateway_record=gw.model_dump() if gw else None,
            bank_record=bank.model_dump() if bank else None,
            ledger_records=[le.model_dump() for le in ledger_entries],
        )

        # 4. Check for Honest Exceptions
        exception = detect_honest_exception(trace_result, gw, bank, ledger_entries)
        if exception:
            trace_result.is_exception = True
            trace_result.exception_details = exception
            trace_result.confidence_score = exception.confidence_score
            if overall_status == SettlementStatus.SETTLED and exception.severity in ["HIGH", "CRITICAL"]:
                trace_result.overall_status = SettlementStatus.EXCEPTION

        return trace_result
