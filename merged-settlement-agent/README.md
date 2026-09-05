# Settlement Q&A Agent - Backend Module (PS-8)

A production-grade backend service built for **HackForge** addressing **Problem Statement 8 (PS-8): Settlement Q&A Agent for Fintech Support**.

When merchants ask *"Why wasn't my settlement processed?"*, this service eliminates manual log-digging by performing automated **3-way reconciliation** across Payment Gateway logs, Bank Settlement records, and Accounting Ledger entries. It generates plain-English explanations of delays or failures using AI (Gemini / Groq with a deterministic fallback engine) and flags an **Honest Exception List** whenever data is ambiguous, conflicting, or incomplete.

---

## 🚀 Key Features

1. **3-Way Reconciliation & Tracing Engine**:
   - Ingests & indexes Razorpay-inspired `gateway_logs.csv`, `bank_settlement_records.csv`, and `ledger_entries.csv`.
   - Reconciles across `payment_id`, `order_id`, and settlement cycles.
   - Computes expected settlement SLA (T+1 business day default, skipping weekends and banking holidays).

2. **Plain-English Explainer (AI + Zero-Config Fallback)**:
   - Evaluates root causes across 7 realistic fintech scenarios:
     - ✅ **Success**: Settled on T+1 cycle with banking UTR.
     - ❌ **Gateway Failure**: Customer card declined / UPI auth cancelled before capture.
     - ⏳ **Bank Holiday Delay**: Capture occurred before weekend / public holiday; queued for next clearing window.
     - ❌ **Bank Rejection**: Merchant bank account frozen or invalid IFSC code.
     - ⏸️ **Risk / KYC Hold**: Compliance pause due to high-risk fraud flag or missing KYC docs.
     - ⚠️ **Reconciliation Discrepancy**: Payout net amount differs from gateway net payable.
     - 🔍 **Honest Exception**: Missing ledger entries or un-batched transactions past SLA.
   - Works with **Google Gemini API**, **Groq API**, or a high-fidelity **Deterministic Rule Engine** (requires zero API keys to run out-of-the-box).

3. **Honest Exception Engine**:
   - Detects edge cases where the automated agent is not 100% sure:
     - `STATUS_CONFLICT` (e.g. Gateway refunded vs. Bank settled with UTR).
     - `MISSING_LEDGER_ENTRY` (Gateway captured, but internal accounting entry missing).
     - `MISSING_BANK_RECORD_POST_SLA` (Captured and ledgered, but missing from payout batches).
     - `AMOUNT_DISCREPANCY` (Unexplained variance between gateway net and bank payout).
   - Assigns a confidence score ($< 0.7$) and concrete recommended operational actions for human fintech support teams.

4. **Developer-Friendly REST API**:
   - Ready for immediate integration with React, Vue, Next.js, or mobile frontends.
   - Enabled CORS (`*`) for local hackathon development.
   - Interactive Swagger API docs (`http://localhost:8000/docs`).

---

## 🛠️ Tech Stack

- **Language**: Python 3.10+ (tested on Python 3.14)
- **Framework**: FastAPI + Uvicorn
- **Data Validation**: Pydantic v2
- **Testing**: Pytest (23 unit & integration tests)
- **AI / LLM**: Google Gemini API / Groq API / Deterministic Fallback Engine

---

## 📦 Project Structure

```
HackForge/backend/
├── app/
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py           # FastAPI endpoints (/query, /trace, /exceptions, /reload)
│   ├── data/
│   │   ├── __init__.py
│   │   ├── mock_generator.py   # Generates realistic mock CSVs with authentic edge cases
│   │   └── repository.py       # In-memory indexer for fast cross-system querying
│   ├── models/
│   │   ├── __init__.py
│   │   ├── domain.py           # Core fintech entities (Gateway, Bank, Ledger, Trace)
│   │   └── schemas.py          # Request & response Pydantic schemas
│   ├── services/
│   │   ├── __init__.py
│   │   ├── exceptions.py       # Honest Exception detector & low-confidence rater
│   │   ├── explainer.py        # Plain-English AI reasoning engine (Gemini/Groq/Fallback)
│   │   └── tracer.py           # 3-way reconciliation & SLA business calendar logic
│   └── config.py               # Central settings & bank holidays configuration
├── data/                       # Mock fintech CSV datasets
│   ├── gateway_logs.csv
│   ├── bank_settlement_records.csv
│   └── ledger_entries.csv
├── tests/                      # Automated test suite
│   ├── test_api.py             # Endpoint tests
│   ├── test_exceptions.py      # Exception engine tests
│   ├── test_mock_data.py       # Data integrity tests
│   └── test_tracer.py          # Reconciliation logic tests
├── main.py                     # FastAPI application entrypoint
├── requirements.txt            # Python dependencies
├── .env.example                # Environment configuration template
└── README.md
```

---

## ⚡ Quick Start

### 1. Activate Environment & Install Dependencies

```powershell
# From the backend directory
cd backend

# If using existing venv:
.\venv\Scripts\activate

# Or install dependencies:
pip install -r requirements.txt
```

### 2. Configure Environment (Optional)

Copy `.env.example` to `.env`:

```powershell
cp .env.example .env
```

To enable Gemini or Groq, populate the key in `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
# or
GROQ_API_KEY=your_groq_api_key_here
```
> **Note**: If no API key is provided, the service automatically runs the built-in deterministic reasoning engine.

### 3. Run the Backend Server

```powershell
python main.py
```
Or via Uvicorn:
```powershell
uvicorn main:app --reload --port 8000
```

The interactive Swagger UI is available at:
👉 **http://localhost:8000/docs**

---

## 🔌 API Reference for Frontend Teammates

### 1. Ask Settlement Question (Q&A)
- **URL**: `POST /api/v1/settlements/query`
- **Request Body**:
```json
{
  "query": "Why wasn't transaction pay_fail_bank_ifsc_001 settled?"
}
```
*Or structured format:*
```json
{
  "payment_id": "pay_delay_holiday_001"
}
```
- **Response**:
```json
{
  "headline_status": "❌ Settlement Payout Rejected by Beneficiary Bank",
  "plain_english_summary": "Your payment pay_fail_bank_ifsc_001 for INR 5,000.00 was captured successfully, and net payout of INR 4,882.00 was initiated to your bank account. However, the payout was rejected by the clearing bank due to: 'INVALID_IFSC_CODE: Destination bank branch not reachable via NEFT/RTGS network'...",
  "overall_status": "FAILED",
  "delay_or_failure_reason": "Bank payout transfer failed: INVALID_IFSC_CODE: Destination bank branch not reachable via NEFT/RTGS network",
  "expected_settlement_date": "2026-09-02",
  "actual_settlement_date": null,
  "utr": null,
  "next_actions_merchant": [
    "Log into your Merchant Dashboard > Settings > Bank Details.",
    "Update your IFSC code (currently SBIN0999999) to the active branch code.",
    "Re-submit account verification to trigger automatic settlement re-try."
  ],
  "next_actions_support": [
    "Verify return UTR and credit reversal in nodal clearing logs.",
    "Assist merchant in validating newly provided bank account details."
  ],
  "is_exception": false,
  "confidence_score": 1.0,
  "timeline": [
    {
      "timestamp": "2026-09-01 11:00:00",
      "system": "GATEWAY",
      "action": "Payment CAPTURED",
      "status": "captured",
      "details": "Amount: INR 5000.00, Method: CARD, Fee: INR 100.00, Tax: INR 18.00. Captured successfully."
    },
    {
      "timestamp": "2026-09-01",
      "system": "LEDGER",
      "action": "LEDGER_MERCHANT_PAYABLE_CREDIT",
      "status": "pending_clearance",
      "details": "Entry led_1006_cr: INR 4882.00 credit to merchant_payable (Status: pending_clearance)"
    },
    {
      "timestamp": "2026-09-02 10:00:00",
      "system": "BANK",
      "action": "SETTLEMENT_BATCH_INITIATED",
      "status": "failed",
      "details": "Settlement ID: setl_1006, Net Amount: INR 4882.00, Account: XXXXXX4412, IFSC: SBIN0999999. Status: failed. Reason: INVALID_IFSC_CODE: Destination bank branch not reachable via NEFT/RTGS network"
    }
  ]
}
```

---

### 2. Deep 3-Way Trace
- **URL**: `GET /api/v1/settlements/trace/{payment_id}`
- **Example**: `GET /api/v1/settlements/trace/pay_success_001`
- **Response**: Full cross-system trace data including Gateway record, Bank record, Ledger entries, fee breakdown, and chronological timeline.

---

### 3. Active Honest Exception List
- **URL**: `GET /api/v1/settlements/exceptions`
- **Response**:
```json
{
  "total_exceptions": 4,
  "high_severity_count": 3,
  "exceptions": [
    {
      "exception_id": "exc_conflict_pay_conflict_status_001",
      "payment_id": "pay_conflict_status_001",
      "exception_type": "STATUS_CONFLICT",
      "severity": "CRITICAL",
      "reason": "Dangerous data conflict detected: Payment was marked 'refunded' on Gateway, yet Bank settlement shows 'processed' with UTR SBIN00481726354...",
      "confidence_score": 0.35,
      "recommended_ops_action": "Immediately escalate to Finance & Risk Ops to audit bank debit vs refund reversal."
    }
  ]
}
```

---

### 4. Health Check
- **URL**: `GET /health`
- **Response**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "llm_provider": "deterministic_fallback",
  "datasets": {
    "gateway_records": 13,
    "bank_records": 9,
    "ledger_records": 11,
    "unique_payments": 14
  }
}
```

---

## 🧪 Running Automated Tests

Run the full pytest suite:

```powershell
python -m pytest tests/ -v
```

All 23 tests pass:
- Mock dataset generation and schema integrity
- 3-way tracer validation across all 7 scenarios
- Honest exception identification & confidence score thresholds
- API endpoints & response validation
