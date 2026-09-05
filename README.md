# PS-8: Settlement Q&A Agent for Fintech Support

**Team Name:** Hack Forge  
**Event:** Origin Hackathon 2026 (Organized by DSC Club VIT Bhopal)  
**Category:** AI + Development

---

## Team Members & Roles

| Member Name | Registration Number | Core Responsibilities |
| :--- | :--- | :--- |
| **Anmol Mishra** | `25BAI11379` | Frontend Development |
| **Anadi Khare** | `25MIM10218` | User Interface, UX & Graphic Design, Data Management |
| **Sarvagya Anand** | `25BCE10648` | Backend Development |
| **Priyansh Vivek** | `25BAI10834` | Management, Content Strategy, PPT & Information Gathering |

---

## Overview & Problem Statement

Businesses utilizing modern payment platforms constantly encounter support queries asking, *"Why wasn't my settlement processed?"* Conventionally, support teams must manually dig through siloed gateway logs, bank batch files, and ledger entries to diagnose a single transaction.

**Settlement Q&A Agent** is an AI-powered fintech support assistant built by Team Hack Forge to automatically ingest transaction identifiers or dates, trace them across multi-system logs, and synthesize plain-English explanations with a transparent exception mechanism.

---

## System Architecture & Features

* **Cross-System Log Tracer:** Automatically queries and correlates records across gateway, bank, and ledger data stores using a unified transaction ID.
* **Natural Language Explanation Engine:** Converts raw error codes, payload dumps, and status strings into clear, human-readable answers for support personnel or merchants.
* **Transparent Exception Handling:** Implements an honest confidence scoring system. If data is mismatched or incomplete, it outputs an explicit exception list rather than hallucinating a resolution.

---

## Recommended Tech Stack

* **Reasoning Layer:** Free-tier LLM API (Groq or Gemini) optimized for structured data parsing and natural language generation.
* **Data Storage:** Self-generated mock CSV files simulating real-world transaction lifecycles.
* **Interface:** Lightweight web chat or form-based UI built with Streamlit, Flask, or Next.js.

---

## Mock Data Schema

To test the agent's tracing logic, maintain internal consistency across three synchronized CSV files using matching transaction IDs:

| File Name | Primary Columns | Description |
| :--- | :--- | :--- |
| `gateway_logs.csv` | `transaction_id`, `timestamp`, `gateway_status`, `error_code`, `payload_ref` | Captures initial API requests and payment gateway responses. |
| `bank_settlements.csv` | `transaction_id`, `payout_batch_id`, `bank_status`, `settlement_date`, `transfer_ref` | Logs batch processing updates, payout execution, and bank acknowledgments. |
| `ledger_entries.csv` | `transaction_id`, `account_id`, `debit`, `credit`, `ledger_status`, `fee` | Tracks double-entry accounting records, merchant balance adjustments, and fees. |

# HackForge

Settlement investigation tools for the HackForge hackathon.

## Main application

[`settlement-qa-agent`](settlement-qa-agent) is the canonical application for this repository. All new features, bug fixes, configuration changes, and UI work should be made there.

[`merged-settlement-agent`](merged-settlement-agent) is an older standalone FastAPI implementation retained for reference only. It is not part of the main development workflow.

## Primary application

```powershell
cd settlement-qa-agent\server
npm install
npm run dev
```

In another terminal:

```powershell
cd settlement-qa-agent\client
npm install
npm run dev
```

See [`settlement-qa-agent/README.md`](settlement-qa-agent/README.md) for configuration, API details, and tests.

## Repository hygiene

Generated dependencies, virtual environments, caches, build output, local environment files, and editor metadata are ignored by the root `.gitignore`.
