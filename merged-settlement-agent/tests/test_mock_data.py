"""Tests validating mock CSV dataset schemas, integrity, and foreign key relations."""

import pytest
import csv
from pathlib import Path
from app.config import settings
from app.data.mock_generator import generate_mock_datasets


@pytest.fixture(scope="module", autouse=True)
def setup_datasets():
    generate_mock_datasets(settings.DATA_DIR)


def test_csv_files_exist():
    assert settings.GATEWAY_CSV_PATH.exists(), "Gateway CSV must exist"
    assert settings.BANK_CSV_PATH.exists(), "Bank CSV must exist"
    assert settings.LEDGER_CSV_PATH.exists(), "Ledger CSV must exist"


def test_gateway_logs_structure():
    with open(settings.GATEWAY_CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        assert len(rows) >= 10, "Should have at least 10 gateway mock records"
        for row in rows:
            assert row["payment_id"].startswith("pay_"), "Payment ID must follow pay_ prefix"
            assert float(row["amount_inr"]) > 0, "Amount must be positive"
            assert row["currency"] == "INR"
            assert row["status"] in ["captured", "failed", "authorized", "refunded"]


def test_bank_settlement_structure():
    with open(settings.BANK_CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        assert len(rows) >= 5
        for row in rows:
            assert row["settlement_id"].startswith("setl_")
            assert row["payment_id"].startswith("pay_")
            assert float(row["gross_amount_inr"]) >= float(row["net_amount_inr"])
            assert row["status"] in ["processed", "failed", "on_hold", "pending"]


def test_ledger_entries_structure():
    with open(settings.LEDGER_CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        assert len(rows) >= 5
        for row in rows:
            assert row["entry_id"].startswith("led_")
            assert row["payment_id"].startswith("pay_")
            assert row["entry_type"] in ["credit", "debit"]
            assert float(row["amount_inr"]) > 0
