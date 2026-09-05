# Settlement Q&A Agent for Fintech Support

> **⚠️ DEMO APPLICATION** — This project uses synthetic mock data only. No real customer, banking, payment, or financial data is used.

An AI-powered support agent that traces payment transactions across three financial systems (payment gateway, bank settlement, and internal ledger), detects anomalies, and explains settlement outcomes in plain English.

## What It Does

Support agents can ask questions like:
- **"Why was TXN1001 delayed?"** → Full investigation with timeline, explanation, and exceptions
- **"What is the status of TXN1005?"** → Status check with missing record detection
- **"Find failed settlements on 2026-08-25"** → Date-based search across all systems
- **"Was TXN1004 rejected by the bank?"** → Natural-language intent detection

The system:
1. Parses the question to extract transaction IDs or dates
2. Loads matching records from gateway, bank, and ledger CSV files
3. Runs a deterministic reconciliation engine (amount/currency/timestamp comparison, missing record detection, duplicate detection)
4. Generates a chronological timeline
5. Optionally sends structured results to an LLM (Groq or Gemini) for plain-English explanation
6. Returns everything: status, confidence level, timeline, exceptions, and auditable raw evidence

## Architecture

```
┌──────────────┐     REST API     ┌──────────────────────────────────┐
│   React UI   │ ◄──────────────► │       Express Backend            │
│  (Vite + TS  │                  │                                  │
│  + Tailwind) │                  │  ┌──────────────────────────┐    │
└──────────────┘                  │  │   Question Parser        │    │
                                  │  │   (TXN ID / Date / NLP)  │    │
                                  │  └──────────┬───────────────┘    │
                                  │             ▼                    │
                                  │  ┌──────────────────────────┐    │
                                  │  │   CSV Data Layer         │    │
                                  │  │   (Gateway/Bank/Ledger)  │    │
                                  │  └──────────┬───────────────┘    │
                                  │             ▼                    │
                                  │  ┌──────────────────────────┐    │
                                  │  │   Reconciliation Engine  │    │  ◄── SOURCE OF TRUTH
                                  │  │   (Deterministic)        │    │
                                  │  └──────────┬───────────────┘    │
                                  │             ▼                    │
                                  │  ┌──────────────────────────┐    │
                                  │  │   AI Service (Optional)  │    │
                                  │  │   Groq / Gemini / Mock   │    │
                                  │  └──────────────────────────┘    │
                                  └──────────────────────────────────┘
```

**Key principle:** The deterministic reconciliation engine is always the source of truth. The LLM may explain findings in plain English, but it can never override the raw data.

## Folder Structure

```
settlement-qa-agent/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/         # UI components (Header, SearchBar, Timeline, etc.)
│   │   ├── pages/              # Dashboard page
│   │   ├── services/           # API client (axios)
│   │   ├── types/              # TypeScript interfaces
│   │   ├── App.tsx             # Root component
│   │   ├── main.tsx            # React entry point
│   │   └── index.css           # Global styles (Tailwind)
│   ├── index.html
│   ├── vite.config.ts          # Vite + Tailwind + API proxy
│   └── package.json
├── server/                     # Express backend
│   ├── src/
│   │   ├── ai/                 # AI service layer
│   │   │   ├── aiService.ts    # Provider abstraction
│   │   │   ├── fallback.ts     # Deterministic explanation generator
│   │   │   └── providers/      # Groq + Gemini implementations
│   │   ├── parsers/
│   │   │   └── csvParser.ts    # CSV loading, validation, normalization
│   │   ├── reconciliation/
│   │   │   ├── engine.ts       # Core investigation engine
│   │   │   └── questionParser.ts # NLP question parsing
│   │   ├── routes/
│   │   │   ├── health.ts       # GET /api/health
│   │   │   ├── transactions.ts # GET /api/transactions
│   │   │   └── investigate.ts  # GET /api/investigate, POST /api/ask
│   │   ├── types/
│   │   │   └── index.ts        # Shared TypeScript interfaces
│   │   └── index.ts            # Express app entry point
│   └── package.json
├── data/                       # Mock CSV data files
│   ├── gateway_records.csv     # 20 payment gateway records
│   ├── bank_settlement_records.csv  # 17 bank settlement records
│   └── ledger_records.csv      # 16 ledger records
├── tests/
│   ├── reconciliation.test.ts  # 67 automated tests
│   └── TEST_GUIDE.md           # Manual test guide (15 scenarios)
├── .env                        # Environment config (gitignored)
├── .env.example                # Template for .env
├── .gitignore
└── README.md
```

## Installation

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm 9+

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd settlement-qa-agent

# 2. Install server dependencies
cd server
npm install

# 3. Install client dependencies
cd ../client
npm install

# 4. Create environment config
cd ..
cp .env.example .env
```

## Environment Variables

Edit `.env` in the project root:

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | AI backend: `groq`, `gemini`, or `mock` | `mock` |
| `GROQ_API_KEY` | Groq API key (from https://console.groq.com) | Empty |
| `GEMINI_API_KEY` | Gemini API key (from https://aistudio.google.com/apikey) | Empty |
| `PORT` | Server port | `3001` |

**Never commit `.env` to version control.**

## Running the Application

### Start the TypeScript backend
```bash
cd server
npm run dev
```
The server starts on http://localhost:3001 with a formatted banner showing loaded record counts and AI mode.

### Start the frontend
```bash
cd client
npm run dev
```
The frontend starts on http://localhost:5173 with a Vite proxy forwarding `/api` requests to the backend.

### Python backend

The Python backend is consolidated in [`main.py`](main.py). It uses the same CSV files and `/api` contract as the React client, so no `app/` package is required to run it:

```powershell
python -m pip install -r requirements.txt
python main.py
```

It runs on `http://localhost:3001` by default. Set `PORT` in `.env` to change the port.

### Both at once (separate terminals)
```bash
# Terminal 1
cd settlement-qa-agent/server && npm run dev

# Terminal 2
cd settlement-qa-agent/client && npm run dev
```

## Mock Reasoning Mode

By default, the application runs in **mock reasoning mode** (`AI_PROVIDER=mock`). This means:
- All explanations are generated deterministically by the reconciliation engine
- No external API calls are made
- The application is fully functional without any API keys
- The header shows "Mock Reasoning (Deterministic)" with an amber indicator

## Configuring AI Providers

### Groq
```env
AI_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
```
Uses `llama-3.3-70b-versatile` model with JSON response format.

### Google Gemini
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```
Uses `gemini-2.0-flash` model with JSON response format.

### Failover
If the AI provider fails (network error, invalid response, rate limit), the system automatically falls back to deterministic explanations. The application never becomes unavailable due to AI issues.

## CSV Data Format

### Gateway Records (`gateway_records.csv`)
| Field | Type | Description |
|-------|------|-------------|
| transaction_id | String | Unique ID (e.g., TXN1001) |
| gateway_payment_id | String | Gateway reference |
| merchant_id | String | Merchant identifier |
| amount | Number | Payment amount |
| currency | String | Currency code (USD, EUR, GBP) |
| created_at | ISO 8601 | Payment creation time |
| authorized_at | ISO 8601 | Authorization time (null if failed) |
| captured_at | ISO 8601 | Capture time (null if failed) |
| gateway_status | String | CAPTURED, AUTHORIZATION_FAILED |
| payment_method | String | credit_card, debit_card, bank_transfer |
| failure_code | String | Error code (null if success) |
| failure_message | String | Error description (null if success) |

### Bank Records (`bank_settlement_records.csv`)
| Field | Type | Description |
|-------|------|-------------|
| transaction_id | String | Matching transaction ID |
| bank_reference_id | String | Bank reference |
| settlement_batch_id | String | Batch identifier |
| amount | Number | Settlement amount |
| currency | String | Currency code |
| received_at | ISO 8601 | When bank received the settlement |
| processed_at | ISO 8601 | When bank processed it |
| bank_status | String | SETTLED, PENDING, REJECTED, RECEIVED |
| bank_response_code | String | Response code |
| bank_response_message | String | Response message |
| settlement_date | Date | Settlement date (YYYY-MM-DD) |

### Ledger Records (`ledger_records.csv`)
| Field | Type | Description |
|-------|------|-------------|
| transaction_id | String | Matching transaction ID |
| ledger_entry_id | String | Ledger entry reference |
| account_id | String | Account identifier |
| debit_amount | Number | Debit amount |
| credit_amount | Number | Credit amount |
| currency | String | Currency code |
| ledger_created_at | ISO 8601 | Entry creation time |
| ledger_status | String | POSTED, PENDING, REVERSED |
| reconciliation_status | String | RECONCILED, UNRECONCILED, MISMATCHED |
| ledger_description | String | Human-readable description |

## Reconciliation Rules

The engine applies these checks in order:

1. **Record matching** — Find gateway/bank/ledger rows by `transaction_id`
2. **Amount comparison** — Flag differences > $0.01 between systems
3. **Currency comparison** — Flag any currency mismatches
4. **Timestamp validation** — Ensure chronological order (gateway → bank → ledger)
5. **Missing record detection** — Flag when any system has no record
6. **Duplicate detection** — Flag when any system has >1 record
7. **Status mapping** — Map raw statuses to canonical: `SETTLED`, `PENDING`, `DELAYED`, `FAILED`, `REJECTED`, `PARTIALLY_RECORDED`, `UNKNOWN`
8. **Confidence scoring** — High (no issues), Medium (warnings only), Low (critical issues or missing data)

### Status Determination Priority
1. No records → `UNKNOWN`
2. Gateway failed → `FAILED`
3. Bank rejected → `REJECTED`
4. Unknown bank status → `UNKNOWN`
5. Bank pending/received → `PENDING`
6. Bank processing took >4 hours → `DELAYED`
7. Missing bank or ledger → `PARTIALLY_RECORDED`
8. All systems present + bank settled → `SETTLED`

## Example Questions

| Question | Expected Result |
|----------|----------------|
| `TXN1001` | Settled, high confidence, no exceptions |
| `Why was TXN1002 delayed?` | Delayed, bank processing took 15+ hours |
| `TXN1003` | Failed, gateway authorization declined |
| `Was TXN1004 rejected by the bank?` | Rejected, bank account frozen |
| `What is the status of TXN1005?` | Partially recorded, missing bank record |
| `Show the settlement trail for TXN1006` | Partially recorded, missing ledger record |
| `Are there any mismatches for TXN1007?` | Amount mismatch (600 vs 585) |
| `TXN1008` | Currency mismatch (USD vs EUR) |
| `TXN1009` | Duplicate ledger entries detected |
| `TXN1011` | Pending, bank processing in progress |
| `TXN1013` | Unknown, unrecognized bank status |
| `Find failed settlements on 2026-08-25` | Multiple results (6 transactions) |
| `TXN9999` | Error: Transaction not found |

## Testing

### Automated Tests
```bash
cd server
npm test
```
Runs 67 assertions across 20 test sections covering all transaction scenarios, question parsing, date search, and AI fallback.

### Manual Testing
See `tests/TEST_GUIDE.md` for 15 step-by-step test cases with expected results.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status + AI mode |
| GET | `/api/transactions/catalog` | List all transactions with reconciled statuses & metadata |
| GET | `/api/transactions/:id` | Raw records for a transaction |
| GET | `/api/transactions?date=YYYY-MM-DD` | Find transactions by date |
| GET | `/api/investigate/:id` | Full investigation with reconciliation & explanation |
| POST | `/api/ask` | Natural language question → investigation |
| POST | `/api/data/upload` | Ingest and validate custom CSV records (append/replace) |
| POST | `/api/data/validate` | Validate CSV headers and format without saving |
| POST | `/api/data/reload` | Force cache reload across all CSV files |
| GET | `/api/data/stats` | Record counts for gateway, bank, and ledger |

### POST /api/ask
```json
{
  "question": "Why was TXN1001 delayed?"
}
```

### POST /api/data/upload
```json
{
  "system": "gateway",
  "csvContent": "transaction_id,gateway_payment_id,merchant_id,amount,currency,created_at,authorized_at,captured_at,gateway_status,payment_method,failure_code,failure_message\nTXN3001,GP-3001,MERCH-501,450.00,USD,2026-08-29T10:00:00Z,2026-08-29T10:00:15Z,2026-08-29T10:00:45Z,CAPTURED,credit_card,,",
  "mode": "append"
}
```

## Known Limitations

1. **In-Memory & File Store** — Data is persisted to local CSV files with auto-reload. For enterprise scale, integrate PostgreSQL / Snowflake.
2. **No authentication** — The API is open for demo purposes. Add JWT / OAuth2 auth middleware for production.
3. **No real-time updates** — Investigation results are point-in-time snapshots.
4. **Simple NLP** — Question parsing uses regex + fuzzy extraction; LLM handles unstructured explanation.
5. **Single-server** — No horizontal scaling or load balancing.
6. **No pagination** — Date-based searches return all matching transactions.

## Production Extensions

To take this project to production, consider:

1. **Database** — Replace CSV files with PostgreSQL or MongoDB for real-time data ingestion
2. **Authentication** — Add JWT or OAuth2 for API access control
3. **WebSocket** — Real-time investigation status updates
4. **Queue processing** — Use Bull/BullMQ for async investigation jobs
5. **Audit logging** — Log all investigation queries and results
6. **Role-based access** — Different views for L1 support, L2 support, and engineers
7. **Alerting** — Auto-detect settlement anomalies and trigger alerts
8. **Batch investigation** — Process multiple transactions at once
9. **Export** — PDF/CSV export of investigation reports
10. **Monitoring** — APM integration (Datadog, New Relic) for the investigation pipeline
11. **Full NLP** — Replace regex parsing with a proper NLP model or use the LLM for intent extraction
12. **Testing** — Add integration tests, E2E tests with Playwright, and load testing

## How the System Works

1. **Input** — User enters a transaction ID, date, or natural-language question
2. **Parsing** — `questionParser.ts` extracts the transaction ID or date using regex patterns
3. **Data loading** — `csvParser.ts` reads and normalizes all three CSV files (cached in memory)
4. **Bundle creation** — All matching records from gateway, bank, and ledger are grouped
5. **Reconciliation** — `engine.ts` compares amounts, currencies, timestamps; detects missing records, duplicates, and unknown statuses
6. **Timeline** — Events are sorted chronologically with system labels and status indicators
7. **Status** — A deterministic status is assigned based on the reconciliation rules
8. **Confidence** — A confidence level is calculated based on exception count and data completeness
9. **AI explanation** — If configured, the structured investigation result (not raw CSVs) is sent to the LLM with strict evidence-only instructions
10. **Response** — The complete investigation result (status, timeline, exceptions, explanation, raw evidence) is returned to the frontend
11. **Display** — The React frontend renders summary cards, timeline, explanation, exceptions, and expandable raw evidence

The LLM never sees raw CSV files. It only receives the structured investigation result with pre-computed exceptions. If the LLM fails or is unavailable, the deterministic fallback generates a template-based explanation from the same data.
