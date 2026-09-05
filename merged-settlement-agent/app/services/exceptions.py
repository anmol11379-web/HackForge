"""Honest Exception Engine for identifying ambiguous, incomplete, or conflicting records."""

from datetime import datetime
from typing import Optional, List, Dict, Any

from app.models.domain import (
    HonestException,
    SettlementTraceResult,
    GatewayTransaction,
    BankSettlementRecord,
    LedgerEntry,
)


def detect_honest_exception(
    trace: SettlementTraceResult,
    gw: Optional[GatewayTransaction],
    bank: Optional[BankSettlementRecord],
    ledger_entries: List[LedgerEntry],
) -> Optional[HonestException]:
    """Evaluates whether a transaction is an honest exception requiring human ops attention."""
    payment_id = trace.payment_id
    now_str = datetime.now().isoformat()

    # Exception Case 1: Status Conflict
    # Gateway refunded/cancelled, yet bank shows processed with UTR or ledger shows dispute
    if gw and gw.status == "refunded" and bank and bank.status == "processed":
        return HonestException(
            exception_id=f"exc_conflict_{payment_id}",
            payment_id=payment_id,
            merchant_id=trace.merchant_id,
            exception_type="STATUS_CONFLICT",
            severity="CRITICAL",
            reason=(
                "Dangerous data conflict detected: Payment was marked 'refunded' on Gateway, "
                f"yet Bank settlement shows 'processed' with UTR {bank.utr}. Funds may have been double-credited or erroneously disbursed."
            ),
            missing_evidence=["Clearance reversal confirmation from bank"],
            conflicting_data={
                "gateway_status": gw.status,
                "bank_status": bank.status,
                "bank_utr": bank.utr,
                "ledger_statuses": [le.status for le in ledger_entries],
            },
            recommended_ops_action="Immediately escalate to Finance & Risk Ops to audit bank debit vs refund reversal. Verify if chargeback or manual clawback is required.",
            confidence_score=0.35,
            detected_at=now_str,
        )

    # Exception Case 2: Missing Ledger Record (Gateway captured, but no internal accounting entry)
    if gw and gw.status == "captured" and not ledger_entries:
        return HonestException(
            exception_id=f"exc_missing_ledger_{payment_id}",
            payment_id=payment_id,
            merchant_id=trace.merchant_id,
            exception_type="MISSING_LEDGER_ENTRY",
            severity="HIGH",
            reason=(
                "Payment was successfully captured at Gateway, but internal double-entry ledger "
                "has no record of merchant payable or fee accrual. Possible data pipeline ingestion failure."
            ),
            missing_evidence=["Ledger posting record", "Merchant payable credit log"],
            conflicting_data={
                "gateway_status": gw.status,
                "ledger_records_count": 0,
            },
            recommended_ops_action="Run reconciliation replay script to post missing ledger entries for this payment ID and sync balance.",
            confidence_score=0.45,
            detected_at=now_str,
        )

    # Exception Case 3: Missing Bank Record post-SLA (Captured on Gateway, posted in Ledger, but never entered Bank batch)
    if gw and gw.status == "captured" and ledger_entries and not bank:
        # If captured more than SLA days ago and no bank record exists
        return HonestException(
            exception_id=f"exc_missing_bank_{payment_id}",
            payment_id=payment_id,
            merchant_id=trace.merchant_id,
            exception_type="MISSING_BANK_RECORD_POST_SLA",
            severity="HIGH",
            reason=(
                "Payment was captured and ledgered, but no corresponding Bank Settlement Record or payout batch exists. "
                "The transaction appears stuck between internal accounting and bank nodal clearing."
            ),
            missing_evidence=["Bank batch initiation file", "Nodal payout queue record"],
            conflicting_data={
                "gateway_captured_at": gw.captured_at,
                "expected_settlement_date": trace.expected_settlement_date,
                "bank_record_found": False,
            },
            recommended_ops_action="Investigate nodal payout batch scheduler. Manually re-queue transaction for the next banking settlement cycle.",
            confidence_score=0.50,
            detected_at=now_str,
        )

    # Exception Case 4: Reconciliation Amount Discrepancy
    # Bank net payout is different from Gateway captured net amount (amount - fee - tax)
    if gw and bank and gw.status == "captured" and bank.status in ["processed", "pending"]:
        expected_net = round(gw.amount_inr - gw.fee_inr - gw.tax_inr, 2)
        variance = round(abs(expected_net - bank.net_amount_inr), 2)
        if variance > 1.00:  # More than 1 INR difference (excluding fractional rounding)
            return HonestException(
                exception_id=f"exc_variance_{payment_id}",
                payment_id=payment_id,
                merchant_id=trace.merchant_id,
                exception_type="AMOUNT_DISCREPANCY",
                severity="MEDIUM",
                reason=(
                    f"Settlement amount mismatch detected: Gateway net payable is INR {expected_net:.2f}, "
                    f"but Bank settlement record net is INR {bank.net_amount_inr:.2f} (Variance: INR {variance:.2f}). "
                    "Possible unlogged fee deduction, reserve adjustment, or currency conversion error."
                ),
                missing_evidence=["Adjustment ledger breakdown for INR " + str(variance)],
                conflicting_data={
                    "gateway_expected_net": expected_net,
                    "bank_net_amount": bank.net_amount_inr,
                    "variance_inr": variance,
                },
                recommended_ops_action="Review fee card and adjustments log to identify the source of the INR " + str(variance) + " deduction.",
                confidence_score=0.60,
                detected_at=now_str,
            )

    # Exception Case 5: Missing Gateway Record (Bank or Ledger has record, but Gateway does not)
    if not gw and (bank or ledger_entries):
        return HonestException(
            exception_id=f"exc_orphan_{payment_id}",
            payment_id=payment_id,
            merchant_id=trace.merchant_id,
            exception_type="MISSING_GATEWAY_RECORD",
            severity="HIGH",
            reason=(
                "Settlement record or ledger posting exists without any corresponding Payment Gateway log. "
                "Orphaned financial entry detected."
            ),
            missing_evidence=["Gateway payment order log"],
            conflicting_data={
                "bank_record_present": bank is not None,
                "ledger_records_count": len(ledger_entries),
            },
            recommended_ops_action="Check gateway archive logs or investigate if this was an offline nodal transfer.",
            confidence_score=0.40,
            detected_at=now_str,
        )

    return None


def collect_all_exceptions(tracer) -> List[HonestException]:
    """Scans all payment IDs in the repository and returns all active honest exceptions."""
    all_pids = tracer.repo.get_all_payment_ids()
    exceptions = []
    for pid in all_pids:
        trace = tracer.trace_payment(pid)
        if trace.is_exception and trace.exception_details:
            exceptions.append(trace.exception_details)
    return exceptions
