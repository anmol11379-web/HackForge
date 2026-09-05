"""End-to-end demo verification script for HackForge backend."""

import sys
from fastapi.testclient import TestClient
from main import app

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

client = TestClient(app)

cases = [
    ("pay_success_001", "Normal Settled with UTR"),
    ("pay_fail_gateway_001", "Gateway Failure (Not Captured)"),
    ("pay_delay_holiday_001", "Bank Holiday / Weekend Delay"),
    ("pay_fail_bank_ifsc_001", "Bank Rejection (Invalid IFSC)"),
    ("pay_risk_hold_compliance_001", "Compliance / Fraud Risk Hold"),
    ("pay_recon_discrepancy_001", "Reconciliation Discrepancy"),
    ("pay_missing_ledger_001", "Honest Exception (Missing Ledger)"),
    ("pay_conflict_status_001", "Honest Exception (Status Conflict)"),
]

print("=" * 80)
print("FINTECH SETTLEMENT Q&A AGENT - LIVE DEMO VERIFICATION")
print("=" * 80)

for pid, description in cases:
    res = client.post("/api/v1/settlements/query", json={"payment_id": pid})
    data = res.json()
    print(f"\nScenario: {description} (ID: {pid})")
    print(f"Headline: {data['headline_status']}")
    print(f"Status:   {data['overall_status']} | Exception: {data['is_exception']} | Confidence: {data['confidence_score']}")
    print(f"Summary:  {data['plain_english_summary']}")
    if data.get("next_actions_merchant"):
        print(f"Merchant Action: {data['next_actions_merchant'][0]}")

print("\n" + "=" * 80)
print("ALL SCENARIOS DEMONSTRATED SUCCESSFULLY!")
print("=" * 80)
