"""Integration tests for FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "datasets" in data
    assert data["datasets"]["gateway_records"] > 0


def test_query_natural_language_bank_ifsc():
    payload = {
        "query": "Why wasn't transaction pay_fail_bank_ifsc_001 processed yet?"
    }
    response = client.post("/api/v1/settlements/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "FAILED"
    assert "IFSC" in data["plain_english_summary"].upper()
    assert len(data["next_actions_merchant"]) > 0


def test_query_structured_payment_id():
    payload = {
        "payment_id": "pay_success_001"
    }
    response = client.post("/api/v1/settlements/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "SETTLED"
    assert data["utr"] == "HDFC98237461524"
    assert "UTR" in data["plain_english_summary"]


def test_query_bank_holiday_delay():
    payload = {
        "payment_id": "pay_delay_holiday_001"
    }
    response = client.post("/api/v1/settlements/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "DELAYED"
    assert "HOLIDAY" in data["plain_english_summary"].upper()


def test_get_trace_endpoint():
    response = client.get("/api/v1/settlements/trace/pay_success_001")
    assert response.status_code == 200
    data = response.json()
    assert data["payment_id"] == "pay_success_001"
    assert data["stage"] == "COMPLETED"
    assert len(data["timeline"]) >= 3


def test_get_exceptions_endpoint():
    response = client.get("/api/v1/settlements/exceptions")
    assert response.status_code == 200
    data = response.json()
    assert data["total_exceptions"] >= 4
    assert len(data["exceptions"]) == data["total_exceptions"]


def test_reload_endpoint():
    response = client.post("/api/v1/data/reload")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["gateway_records_loaded"] > 0
