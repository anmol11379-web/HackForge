"""Generator for authentic, internally consistent mock fintech datasets.

Generates 3 CSV files inspired by Razorpay settlement schemas:
1. gateway_logs.csv: Payment gateway attempts, captures, fees, GST, errors.
2. bank_settlement_records.csv: Payout batches, clearing statuses, UTRs, failure codes.
3. ledger_entries.csv: Double-entry accounting postings, reserve holds, disputes.
"""

import csv
from pathlib import Path
from typing import Tuple
from datetime import datetime, timedelta


def generate_mock_datasets(output_dir: Path) -> Tuple[Path, Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    
    gateway_file = output_dir / "gateway_logs.csv"
    bank_file = output_dir / "bank_settlement_records.csv"
    ledger_file = output_dir / "ledger_entries.csv"

    # 1. Gateway Logs
    gateway_records = [
        # Scenario 1: Successful payment, standard T+1 settlement
        {
            "payment_id": "pay_success_001",
            "order_id": "order_ord_101",
            "merchant_id": "acc_merch_001",
            "amount_inr": 2500.00,
            "currency": "INR",
            "status": "captured",
            "method": "card",
            "captured_at": "2026-09-01 10:15:30",
            "fee_inr": 50.00,
            "tax_inr": 9.00,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 1b: Second successful UPI payment
        {
            "payment_id": "pay_success_002",
            "order_id": "order_ord_102",
            "merchant_id": "acc_merch_001",
            "amount_inr": 850.00,
            "currency": "INR",
            "status": "captured",
            "method": "upi",
            "captured_at": "2026-09-02 14:20:00",
            "fee_inr": 0.00,
            "tax_inr": 0.00,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 2: Gateway failure - Card declined (never captured)
        {
            "payment_id": "pay_fail_gateway_001",
            "order_id": "order_ord_103",
            "merchant_id": "acc_merch_002",
            "amount_inr": 1200.00,
            "currency": "INR",
            "status": "failed",
            "method": "card",
            "captured_at": "",
            "fee_inr": 0.00,
            "tax_inr": 0.00,
            "error_code": "BAD_REQUEST_PAYMENT_DECLINED",
            "error_description": "Issuing bank declined transaction due to insufficient customer funds",
            "risk_level": "normal"
        },
        # Scenario 2b: Gateway failure - User cancelled UPI auth
        {
            "payment_id": "pay_fail_gateway_002",
            "order_id": "order_ord_104",
            "merchant_id": "acc_merch_002",
            "amount_inr": 450.00,
            "currency": "INR",
            "status": "failed",
            "method": "upi",
            "captured_at": "",
            "fee_inr": 0.00,
            "tax_inr": 0.00,
            "error_code": "PAYMENT_CANCELLED_BY_USER",
            "error_description": "User cancelled the payment prompt on their UPI app",
            "risk_level": "normal"
        },
        # Scenario 3: Bank Holiday Delay (Captured Friday evening before holiday)
        {
            "payment_id": "pay_delay_holiday_001",
            "order_id": "order_ord_105",
            "merchant_id": "acc_merch_001",
            "amount_inr": 3400.00,
            "currency": "INR",
            "status": "captured",
            "method": "netbanking",
            "captured_at": "2026-08-28 19:40:00",
            "fee_inr": 68.00,
            "tax_inr": 12.24,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 4: Bank Failure - Invalid IFSC code provided by merchant
        {
            "payment_id": "pay_fail_bank_ifsc_001",
            "order_id": "order_ord_106",
            "merchant_id": "acc_merch_003",
            "amount_inr": 5000.00,
            "currency": "INR",
            "status": "captured",
            "method": "card",
            "captured_at": "2026-09-01 11:00:00",
            "fee_inr": 100.00,
            "tax_inr": 18.00,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 4b: Bank Failure - Beneficiary account frozen / credit blocked
        {
            "payment_id": "pay_fail_bank_frozen_001",
            "order_id": "order_ord_107",
            "merchant_id": "acc_merch_004",
            "amount_inr": 2000.00,
            "currency": "INR",
            "status": "captured",
            "method": "upi",
            "captured_at": "2026-09-01 12:30:00",
            "fee_inr": 40.00,
            "tax_inr": 7.20,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 5: Compliance / Fraud Risk Hold
        {
            "payment_id": "pay_risk_hold_compliance_001",
            "order_id": "order_ord_108",
            "merchant_id": "acc_merch_005",
            "amount_inr": 75000.00,
            "currency": "INR",
            "status": "captured",
            "method": "card",
            "captured_at": "2026-09-02 16:00:00",
            "fee_inr": 1500.00,
            "tax_inr": 270.00,
            "error_code": "",
            "error_description": "",
            "risk_level": "high"
        },
        # Scenario 5b: Compliance / KYC Pending Hold
        {
            "payment_id": "pay_risk_hold_kyc_001",
            "order_id": "order_ord_109",
            "merchant_id": "acc_merch_006",
            "amount_inr": 1850.00,
            "currency": "INR",
            "status": "captured",
            "method": "upi",
            "captured_at": "2026-09-02 17:15:00",
            "fee_inr": 37.00,
            "tax_inr": 6.66,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 6: Reconciliation Discrepancy (Payout does not match Net Payable)
        {
            "payment_id": "pay_recon_discrepancy_001",
            "order_id": "order_ord_110",
            "merchant_id": "acc_merch_001",
            "amount_inr": 10000.00,
            "currency": "INR",
            "status": "captured",
            "method": "card",
            "captured_at": "2026-09-01 09:00:00",
            "fee_inr": 200.00,
            "tax_inr": 36.00,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 7a: Honest Exception - Captured on gateway, but missing from Ledger
        {
            "payment_id": "pay_missing_ledger_001",
            "order_id": "order_ord_111",
            "merchant_id": "acc_merch_007",
            "amount_inr": 3100.00,
            "currency": "INR",
            "status": "captured",
            "method": "netbanking",
            "captured_at": "2026-08-30 11:20:00",
            "fee_inr": 62.00,
            "tax_inr": 11.16,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 7b: Honest Exception - Captured & Ledger posted, but missing from Bank payout batch past SLA
        {
            "payment_id": "pay_missing_bank_001",
            "order_id": "order_ord_112",
            "merchant_id": "acc_merch_001",
            "amount_inr": 4200.00,
            "currency": "INR",
            "status": "captured",
            "method": "upi",
            "captured_at": "2026-08-27 10:00:00",
            "fee_inr": 0.00,
            "tax_inr": 0.00,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 7c: Honest Exception - Status conflict (Gateway refunded, Bank processed with UTR, Ledger disputed)
        {
            "payment_id": "pay_conflict_status_001",
            "order_id": "order_ord_113",
            "merchant_id": "acc_merch_008",
            "amount_inr": 6400.00,
            "currency": "INR",
            "status": "refunded",
            "method": "card",
            "captured_at": "2026-08-29 13:00:00",
            "fee_inr": 128.00,
            "tax_inr": 23.04,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        },
        # Scenario 8: Normal In-Progress transaction within standard SLA
        {
            "payment_id": "pay_unsettled_in_sla_001",
            "order_id": "order_ord_114",
            "merchant_id": "acc_merch_001",
            "amount_inr": 1500.00,
            "currency": "INR",
            "status": "captured",
            "method": "upi",
            "captured_at": "2026-09-04 14:00:00",
            "fee_inr": 0.00,
            "tax_inr": 0.00,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal"
        }
    ]

    # 2. Bank Settlement Records
    bank_records = [
        # Scenario 1: Settled with UTR
        {
            "settlement_id": "setl_1001",
            "payment_id": "pay_success_001",
            "utr": "HDFC98237461524",
            "merchant_id": "acc_merch_001",
            "bank_account_num": "XXXXXX9821",
            "ifsc": "HDFC0001234",
            "gross_amount_inr": 2500.00,
            "net_amount_inr": 2441.00,
            "status": "processed",
            "failure_reason": "",
            "initiated_at": "2026-09-02 09:00:00",
            "settled_at": "2026-09-02 11:30:00"
        },
        # Scenario 1b: Settled with UTR
        {
            "settlement_id": "setl_1002",
            "payment_id": "pay_success_002",
            "utr": "ICIC84729103948",
            "merchant_id": "acc_merch_001",
            "bank_account_num": "XXXXXX9821",
            "ifsc": "HDFC0001234",
            "gross_amount_inr": 850.00,
            "net_amount_inr": 850.00,
            "status": "processed",
            "failure_reason": "",
            "initiated_at": "2026-09-03 08:30:00",
            "settled_at": "2026-09-03 09:45:00"
        },
        # Scenario 3: Bank Holiday Delay
        {
            "settlement_id": "setl_1005",
            "payment_id": "pay_delay_holiday_001",
            "utr": "",
            "merchant_id": "acc_merch_001",
            "bank_account_num": "XXXXXX9821",
            "ifsc": "HDFC0001234",
            "gross_amount_inr": 3400.00,
            "net_amount_inr": 3319.76,
            "status": "pending",
            "failure_reason": "BANK_HOLIDAY_DELAY: Batch queued for next clearing window post holiday",
            "initiated_at": "2026-08-31 10:00:00",
            "settled_at": ""
        },
        # Scenario 4: Bank Rejection - Invalid IFSC
        {
            "settlement_id": "setl_1006",
            "payment_id": "pay_fail_bank_ifsc_001",
            "utr": "",
            "merchant_id": "acc_merch_003",
            "bank_account_num": "XXXXXX4412",
            "ifsc": "SBIN0999999",  # Invalid/closed branch
            "gross_amount_inr": 5000.00,
            "net_amount_inr": 4882.00,
            "status": "failed",
            "failure_reason": "INVALID_IFSC_CODE: Destination bank branch not reachable via NEFT/RTGS network",
            "initiated_at": "2026-09-02 10:00:00",
            "settled_at": ""
        },
        # Scenario 4b: Bank Rejection - Beneficiary Account Frozen
        {
            "settlement_id": "setl_1007",
            "payment_id": "pay_fail_bank_frozen_001",
            "utr": "",
            "merchant_id": "acc_merch_004",
            "bank_account_num": "XXXXXX7789",
            "ifsc": "KKBK0000888",
            "gross_amount_inr": 2000.00,
            "net_amount_inr": 1952.80,
            "status": "failed",
            "failure_reason": "BENEFICIARY_ACCOUNT_FROZEN: Bank rejected credit - account has debit/credit freeze",
            "initiated_at": "2026-09-02 10:30:00",
            "settled_at": ""
        },
        # Scenario 5: Risk Hold at bank stage
        {
            "settlement_id": "setl_1008",
            "payment_id": "pay_risk_hold_compliance_001",
            "utr": "",
            "merchant_id": "acc_merch_005",
            "bank_account_num": "XXXXXX5521",
            "ifsc": "AXIS0000123",
            "gross_amount_inr": 75000.00,
            "net_amount_inr": 73230.00,
            "status": "on_hold",
            "failure_reason": "RISK_FRAUD_HOLD: Payout suspended pending high-value merchant AML clearance",
            "initiated_at": "2026-09-03 09:00:00",
            "settled_at": ""
        },
        # Scenario 5b: KYC Hold
        {
            "settlement_id": "setl_1009",
            "payment_id": "pay_risk_hold_kyc_001",
            "utr": "",
            "merchant_id": "acc_merch_006",
            "bank_account_num": "XXXXXX3311",
            "ifsc": "BARB0MUMBAI",
            "gross_amount_inr": 1850.00,
            "net_amount_inr": 1806.34,
            "status": "on_hold",
            "failure_reason": "MERCHANT_KYC_PENDING: Bank payout paused until merchant updates GSTIN and pan",
            "initiated_at": "2026-09-03 09:00:00",
            "settled_at": ""
        },
        # Scenario 6: Discrepancy in Bank payout
        {
            "settlement_id": "setl_1010",
            "payment_id": "pay_recon_discrepancy_001",
            "utr": "PUNB19283746501",
            "merchant_id": "acc_merch_001",
            "bank_account_num": "XXXXXX9821",
            "ifsc": "HDFC0001234",
            "gross_amount_inr": 10000.00,
            "net_amount_inr": 9200.00,  # Expected 9764.00, discrepancy of 564.00!
            "status": "processed",
            "failure_reason": "",
            "initiated_at": "2026-09-02 09:00:00",
            "settled_at": "2026-09-02 12:00:00"
        },
        # Scenario 7a: Bank record exists for missing ledger test
        {
            "settlement_id": "setl_1011",
            "payment_id": "pay_missing_ledger_001",
            "utr": "",
            "merchant_id": "acc_merch_007",
            "bank_account_num": "XXXXXX1190",
            "ifsc": "UTIB0000001",
            "gross_amount_inr": 3100.00,
            "net_amount_inr": 3026.84,
            "status": "pending",
            "failure_reason": "Awaiting ledger reconciliation match",
            "initiated_at": "2026-08-31 09:00:00",
            "settled_at": ""
        },
        # Scenario 7c: Status conflict - Bank processed with UTR
        {
            "settlement_id": "setl_1013",
            "payment_id": "pay_conflict_status_001",
            "utr": "SBIN00481726354",
            "merchant_id": "acc_merch_008",
            "bank_account_num": "XXXXXX6622",
            "ifsc": "SBIN0000111",
            "gross_amount_inr": 6400.00,
            "net_amount_inr": 6248.96,
            "status": "processed",
            "failure_reason": "",
            "initiated_at": "2026-08-30 10:00:00",
            "settled_at": "2026-08-30 14:00:00"
        },
        # Scenario 8: Normal in-progress
        {
            "settlement_id": "setl_1014",
            "payment_id": "pay_unsettled_in_sla_001",
            "utr": "",
            "merchant_id": "acc_merch_001",
            "bank_account_num": "XXXXXX9821",
            "ifsc": "HDFC0001234",
            "gross_amount_inr": 1500.00,
            "net_amount_inr": 1500.00,
            "status": "pending",
            "failure_reason": "",
            "initiated_at": "2026-09-04 15:00:00",
            "settled_at": ""
        }
    ]

    # 3. Ledger Entries (Double entry accounting / posting logs)
    ledger_records = [
        # Scenario 1:
        {
            "entry_id": "led_1001_cr",
            "payment_id": "pay_success_001",
            "settlement_id": "setl_1001",
            "merchant_id": "acc_merch_001",
            "account_type": "merchant_payable",
            "amount_inr": 2441.00,
            "entry_type": "credit",
            "post_date": "2026-09-01",
            "status": "posted",
            "hold_reason": ""
        },
        {
            "entry_id": "led_1001_fee",
            "payment_id": "pay_success_001",
            "settlement_id": "setl_1001",
            "merchant_id": "acc_merch_001",
            "account_type": "fee_expense",
            "amount_inr": 59.00,
            "entry_type": "debit",
            "post_date": "2026-09-01",
            "status": "posted",
            "hold_reason": ""
        },
        # Scenario 1b:
        {
            "entry_id": "led_1002_cr",
            "payment_id": "pay_success_002",
            "settlement_id": "setl_1002",
            "merchant_id": "acc_merch_001",
            "account_type": "merchant_payable",
            "amount_inr": 850.00,
            "entry_type": "credit",
            "post_date": "2026-09-02",
            "status": "posted",
            "hold_reason": ""
        },
        # Scenario 3: Holiday delay
        {
            "entry_id": "led_1005_cr",
            "payment_id": "pay_delay_holiday_001",
            "settlement_id": "setl_1005",
            "merchant_id": "acc_merch_001",
            "account_type": "merchant_payable",
            "amount_inr": 3319.76,
            "entry_type": "credit",
            "post_date": "2026-08-28",
            "status": "pending_clearance",
            "hold_reason": ""
        },
        # Scenario 4: Bank IFSC fail
        {
            "entry_id": "led_1006_cr",
            "payment_id": "pay_fail_bank_ifsc_001",
            "settlement_id": "setl_1006",
            "merchant_id": "acc_merch_003",
            "account_type": "merchant_payable",
            "amount_inr": 4882.00,
            "entry_type": "credit",
            "post_date": "2026-09-01",
            "status": "pending_clearance",
            "hold_reason": ""
        },
        # Scenario 4b: Frozen account
        {
            "entry_id": "led_1007_cr",
            "payment_id": "pay_fail_bank_frozen_001",
            "settlement_id": "setl_1007",
            "merchant_id": "acc_merch_004",
            "account_type": "merchant_payable",
            "amount_inr": 1952.80,
            "entry_type": "credit",
            "post_date": "2026-09-01",
            "status": "pending_clearance",
            "hold_reason": ""
        },
        # Scenario 5: Risk hold
        {
            "entry_id": "led_1008_hold",
            "payment_id": "pay_risk_hold_compliance_001",
            "settlement_id": "setl_1008",
            "merchant_id": "acc_merch_005",
            "account_type": "reserve_hold",
            "amount_inr": 73230.00,
            "entry_type": "credit",
            "post_date": "2026-09-02",
            "status": "reserve_hold",
            "hold_reason": "RISK_REVIEW_HOLD"
        },
        # Scenario 5b: KYC hold
        {
            "entry_id": "led_1009_hold",
            "payment_id": "pay_risk_hold_kyc_001",
            "settlement_id": "setl_1009",
            "merchant_id": "acc_merch_006",
            "account_type": "reserve_hold",
            "amount_inr": 1806.34,
            "entry_type": "credit",
            "post_date": "2026-09-02",
            "status": "reserve_hold",
            "hold_reason": "KYC_PENDING"
        },
        # Scenario 6: Discrepancy
        {
            "entry_id": "led_1010_cr",
            "payment_id": "pay_recon_discrepancy_001",
            "settlement_id": "setl_1010",
            "merchant_id": "acc_merch_001",
            "account_type": "merchant_payable",
            "amount_inr": 9764.00,
            "entry_type": "credit",
            "post_date": "2026-09-01",
            "status": "posted",
            "hold_reason": ""
        },
        # Scenario 7b: Missing Bank Record (posted 5 days ago in ledger)
        {
            "entry_id": "led_1012_cr",
            "payment_id": "pay_missing_bank_001",
            "settlement_id": "",
            "merchant_id": "acc_merch_001",
            "account_type": "merchant_payable",
            "amount_inr": 4200.00,
            "entry_type": "credit",
            "post_date": "2026-08-27",
            "status": "posted",
            "hold_reason": ""
        },
        # Scenario 7c: Status conflict (ledger shows disputed)
        {
            "entry_id": "led_1013_disp",
            "payment_id": "pay_conflict_status_001",
            "settlement_id": "setl_1013",
            "merchant_id": "acc_merch_008",
            "account_type": "merchant_payable",
            "amount_inr": 6248.96,
            "entry_type": "debit",
            "post_date": "2026-08-30",
            "status": "disputed",
            "hold_reason": "CUSTOMER_CHARGEBACK_DISPUTE"
        },
        # Scenario 8: Normal in-progress
        {
            "entry_id": "led_1014_cr",
            "payment_id": "pay_unsettled_in_sla_001",
            "settlement_id": "setl_1014",
            "merchant_id": "acc_merch_001",
            "account_type": "merchant_payable",
            "amount_inr": 1500.00,
            "entry_type": "credit",
            "post_date": "2026-09-04",
            "status": "pending_clearance",
            "hold_reason": ""
        }
    ]

    # 4. Deterministic bulk demo data.
    # Keep the hand-authored edge cases above, then add 500 normal-ish payments
    # so the UI and API can be tested with a realistic dataset size.
    base_time = datetime(2026, 8, 1, 9, 0, 0)
    for i in range(1, 501):
        payment_id = f"pay_demo_{i:04d}"
        order_id = f"order_demo_{i:04d}"
        merchant_id = f"acc_demo_{(i % 25) + 1:03d}"
        captured = base_time + timedelta(hours=i * 3)
        amount = round(100.0 + ((i * 137) % 9900), 2)
        fee = round(amount * 0.02, 2)
        tax = round(fee * 0.18, 2)
        net_amount = round(amount - fee - tax, 2)
        settlement_start = captured + timedelta(hours=20)

        bank_status = "pending" if i % 20 == 0 else ("failed" if i % 47 == 0 else "processed")
        bank_failure = "" if bank_status == "processed" else (
            "BANK_HOLIDAY_DELAY: Batch awaiting next clearing window"
            if bank_status == "pending"
            else "BENEFICIARY_ACCOUNT_REJECTED: Demo failure scenario"
        )
        settled_at = "" if bank_status != "processed" else (
            settlement_start + timedelta(hours=2)
        ).strftime("%Y-%m-%d %H:%M:%S")

        gateway_records.append({
            "payment_id": payment_id,
            "order_id": order_id,
            "merchant_id": merchant_id,
            "amount_inr": amount,
            "currency": "INR",
            "status": "captured",
            "method": "upi" if i % 2 == 0 else "card",
            "captured_at": captured.strftime("%Y-%m-%d %H:%M:%S"),
            "fee_inr": fee,
            "tax_inr": tax,
            "error_code": "",
            "error_description": "",
            "risk_level": "normal",
        })

        bank_records.append({
            "settlement_id": f"setl_demo_{i:04d}",
            "payment_id": payment_id,
            "utr": f"DEMO{i:011d}" if bank_status == "processed" else "",
            "merchant_id": merchant_id,
            "bank_account_num": f"XXXXXX{(9000 + i):04d}",
            "ifsc": "HDFC0001234",
            "gross_amount_inr": amount,
            "net_amount_inr": net_amount,
            "status": bank_status,
            "failure_reason": bank_failure,
            "initiated_at": settlement_start.strftime("%Y-%m-%d %H:%M:%S"),
            "settled_at": settled_at,
        })

        ledger_records.append({
            "entry_id": f"led_demo_{i:04d}",
            "payment_id": payment_id,
            "settlement_id": f"setl_demo_{i:04d}",
            "merchant_id": merchant_id,
            "account_type": "merchant_payable",
            "amount_inr": net_amount,
            "entry_type": "credit",
            "post_date": captured.strftime("%Y-%m-%d"),
            "status": "pending_clearance" if bank_status == "pending" else "posted",
            "hold_reason": "",
        })

    # Write Gateway Logs
    with open(gateway_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(gateway_records[0].keys()))
        writer.writeheader()
        writer.writerows(gateway_records)

    # Write Bank Settlement Records
    with open(bank_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(bank_records[0].keys()))
        writer.writeheader()
        writer.writerows(bank_records)

    # Write Ledger Entries
    with open(ledger_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(ledger_records[0].keys()))
        writer.writeheader()
        writer.writerows(ledger_records)

    return gateway_file, bank_file, ledger_file


if __name__ == "__main__":
    from app.config import settings
    generate_mock_datasets(settings.DATA_DIR)
    print(f"Mock datasets successfully generated in {settings.DATA_DIR}")
