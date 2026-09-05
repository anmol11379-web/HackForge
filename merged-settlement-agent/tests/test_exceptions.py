"""Tests validating the Honest Exception engine and detection of data ambiguities."""

import pytest
from app.data.repository import repository
from app.services.tracer import SettlementTracer
from app.services.exceptions import collect_all_exceptions


@pytest.fixture(scope="module")
def tracer():
    repository.load_all()
    return SettlementTracer(repository)


def test_missing_ledger_exception(tracer):
    result = tracer.trace_payment("pay_missing_ledger_001")
    assert result.is_exception is True
    assert result.exception_details is not None
    assert result.exception_details.exception_type == "MISSING_LEDGER_ENTRY"
    assert result.confidence_score < 0.7
    assert "Ledger posting record" in result.exception_details.missing_evidence


def test_missing_bank_record_post_sla_exception(tracer):
    result = tracer.trace_payment("pay_missing_bank_001")
    assert result.is_exception is True
    assert result.exception_details is not None
    assert result.exception_details.exception_type == "MISSING_BANK_RECORD_POST_SLA"
    assert result.confidence_score <= 0.5


def test_status_conflict_exception(tracer):
    result = tracer.trace_payment("pay_conflict_status_001")
    assert result.is_exception is True
    assert result.exception_details is not None
    assert result.exception_details.exception_type == "STATUS_CONFLICT"
    assert result.exception_details.severity == "CRITICAL"
    assert "refunded" in str(result.exception_details.conflicting_data).lower()


def test_amount_discrepancy_exception(tracer):
    result = tracer.trace_payment("pay_recon_discrepancy_001")
    assert result.is_exception is True
    assert result.exception_details is not None
    assert result.exception_details.exception_type == "AMOUNT_DISCREPANCY"
    assert result.exception_details.conflicting_data["variance_inr"] > 100.0


def test_collect_all_exceptions(tracer):
    exceptions = collect_all_exceptions(tracer)
    assert len(exceptions) >= 4
    types = [e.exception_type for e in exceptions]
    assert "STATUS_CONFLICT" in types
    assert "MISSING_LEDGER_ENTRY" in types
    assert "MISSING_BANK_RECORD_POST_SLA" in types
    assert "AMOUNT_DISCREPANCY" in types
