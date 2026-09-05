"""Tests for the 3-way Settlement Tracing engine across all fintech scenarios."""

import pytest
from app.data.repository import repository
from app.services.tracer import SettlementTracer
from app.models.domain import SettlementStatus


@pytest.fixture(scope="module")
def tracer():
    repository.load_all()
    return SettlementTracer(repository)


def test_trace_successful_settlement(tracer):
    result = tracer.trace_payment("pay_success_001")
    assert result.overall_status == SettlementStatus.SETTLED
    assert result.utr == "HDFC98237461524"
    assert result.net_settlement_amount == 2441.00
    assert result.fee_inr == 50.00
    assert result.tax_inr == 9.00
    assert result.is_failed is False
    assert result.is_delayed is False
    assert len(result.timeline) >= 3


def test_trace_gateway_failure(tracer):
    result = tracer.trace_payment("pay_fail_gateway_001")
    assert result.overall_status == SettlementStatus.FAILED
    assert result.stage == "GATEWAY"
    assert result.failure_category == "GATEWAY_FAILURE"
    assert "declined" in result.delay_or_failure_reason.lower()


def test_trace_bank_holiday_delay(tracer):
    result = tracer.trace_payment("pay_delay_holiday_001")
    assert result.overall_status == SettlementStatus.DELAYED
    assert result.is_delayed is True
    assert result.failure_category == "BANK_HOLIDAY_DELAY"
    assert result.expected_settlement_date is not None


def test_trace_bank_invalid_ifsc(tracer):
    result = tracer.trace_payment("pay_fail_bank_ifsc_001")
    assert result.overall_status == SettlementStatus.FAILED
    assert result.stage == "BANK"
    assert result.failure_category == "BANK_REJECTION"
    assert "INVALID_IFSC_CODE" in result.delay_or_failure_reason


def test_trace_bank_frozen_account(tracer):
    result = tracer.trace_payment("pay_fail_bank_frozen_001")
    assert result.overall_status == SettlementStatus.FAILED
    assert result.stage == "BANK"
    assert result.failure_category == "BANK_REJECTION"
    assert "FROZEN" in result.delay_or_failure_reason


def test_trace_risk_compliance_hold(tracer):
    result = tracer.trace_payment("pay_risk_hold_compliance_001")
    assert result.overall_status == SettlementStatus.ON_HOLD
    assert result.stage == "LEDGER"
    assert result.failure_category == "COMPLIANCE_HOLD"
    assert "RISK_REVIEW_HOLD" in result.delay_or_failure_reason


def test_trace_in_progress_within_sla(tracer):
    result = tracer.trace_payment("pay_unsettled_in_sla_001")
    assert result.overall_status == SettlementStatus.IN_PROGRESS
    assert result.is_failed is False
