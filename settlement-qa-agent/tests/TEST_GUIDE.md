# Settlement Q&A Agent — Manual Test Guide

This guide provides 15 example questions and their expected results for manual testing.

---

## How to Use

1. Start the backend: `cd server && npm run dev`
2. Start the frontend: `cd client && npm run dev`
3. Open http://localhost:5173
4. Enter each question below and verify the expected result

---

## Test Cases

### Test 1: Fully Settled Transaction
**Question:** `What is the status of TXN1001?`
**Expected:**
- Status: **Settled** (green)
- Confidence: **High**
- Amount: USD 250.00
- Settlement Date: 2026-08-20
- Timeline: 6 events (3 gateway, 2 bank, 1 ledger)
- Exceptions: None
- Explanation: "No action required"

---

### Test 2: Delayed Bank Settlement
**Question:** `Why was TXN1002 delayed?`
**Expected:**
- Status: **Delayed** (orange)
- Amount: USD 1500.75
- Explanation mentions bank processing took 15+ hours after receiving
- Timeline shows gap between bank received and processed timestamps

---

### Test 3: Gateway Authorization Failure
**Question:** `TXN1003`
**Expected:**
- Status: **Failed** (red)
- Confidence: **Low**
- No bank or ledger records
- Timeline shows "Authorization failed: Card issuer declined the transaction"
- Failure code: AUTH_DECLINED

---

### Test 4: Bank Rejection
**Question:** `Was TXN1004 rejected by the bank?`
**Expected:**
- Status: **Rejected** (red)
- Explanation mentions "Bank account frozen"
- Bank response code: 14
- Recommended action mentions contacting the bank

---

### Test 5: Missing Bank Record
**Question:** `What is the status of TXN1005?`
**Expected:**
- Status: **Partially Recorded** (yellow)
- Exception: "No bank settlement record found"
- Has gateway and ledger records but no bank record

---

### Test 6: Missing Ledger Record
**Question:** `Show the settlement trail for TXN1006`
**Expected:**
- Status: **Partially Recorded** (yellow)
- Exception: "No ledger record found for this transaction"
- Has gateway and bank records but no ledger record

---

### Test 7: Amount Mismatch
**Question:** `Are there any mismatches for TXN1007?`
**Expected:**
- Exception: Amount mismatch between gateway (USD 600.00) and bank (USD 585.00)
- Raw evidence shows different amounts across systems

---

### Test 8: Currency Mismatch
**Question:** `TXN1008`
**Expected:**
- Exception: Currency mismatch between gateway (USD) and bank (EUR)
- This is flagged as a critical exception

---

### Test 9: Duplicate Ledger
**Question:** `What is the status of TXN1009?`
**Expected:**
- Exception: "Found 2 ledger entries. Potential duplicate."
- Raw evidence shows two ledger records (LED-401009A and LED-401009B)

---

### Test 10: Pending Settlement
**Question:** `TXN1011`
**Expected:**
- Status: **Pending** (amber)
- Bank status shows PENDING
- Explanation mentions waiting for bank processing

---

### Test 11: Unknown Status
**Question:** `TXN1013`
**Expected:**
- Status: **Unknown** (gray)
- Exception: Unknown bank status "XYZSTATUS"
- Confidence: Low

---

### Test 12: Insufficient Evidence
**Question:** `TXN1014`
**Expected:**
- Status: **Partially Recorded**
- Exception: "Only a gateway record exists"
- No bank or ledger records
- Confidence: Low

---

### Test 13: Date-Based Search
**Question:** `Find failed settlements on 2026-08-25`
**Expected:**
- Multiple results displayed (6 transactions)
- Includes TXN1014, TXN1015, TXN1016, TXN1017, TXN1019, TXN1020
- Each shows its status (mix of SETTLED, FAILED, PENDING, DELAYED, PARTIALLY_RECORDED)
- Can click any result to see full investigation

---

### Test 14: Unknown Transaction
**Question:** `TXN9999`
**Expected:**
- Error: "Transaction Not Found"
- Message: "No transaction matching 'TXN9999' was found."

---

### Test 15: Ledger Reconciliation Mismatch
**Question:** `TXN1018`
**Expected:**
- Exception: Reconciliation mismatch (ledger shows MISMATCHED status)
- Exception: Amount mismatch (gateway/bank: 1100, ledger: 1050)
- Both are flagged as exceptions

---

## Quick Checklist

| # | Question | Expected Status | Pass? |
|---|----------|-----------------|-------|
| 1 | TXN1001 | SETTLED | |
| 2 | TXN1002 | DELAYED | |
| 3 | TXN1003 | FAILED | |
| 4 | TXN1004 | REJECTED | |
| 5 | TXN1005 | PARTIALLY_RECORDED | |
| 6 | TXN1006 | PARTIALLY_RECORDED | |
| 7 | TXN1007 | Amount mismatch | |
| 8 | TXN1008 | Currency mismatch | |
| 9 | TXN1009 | Duplicate records | |
| 10 | TXN1011 | PENDING | |
| 11 | TXN1013 | UNKNOWN | |
| 12 | TXN1014 | Insufficient evidence | |
| 13 | 2026-08-25 | Multiple results | |
| 14 | TXN9999 | Not found | |
| 15 | TXN1018 | Reconciliation mismatch | |
