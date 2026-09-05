"""Single-file Python FastAPI Server for Settlement Q&A Agent.

Provides a self-contained, deterministic 3-way reconciliation engine
across Payment Gateway, Bank Settlement, and Accounting Ledger records.
Optionally explains results using Google Gemini or Groq, falling back
gracefully to deterministic rules.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Configuration & Constants
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CLIENT_DIST = BASE_DIR / "client" / "dist"

load_dotenv(BASE_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("settlement_qa_agent")

PORT = int(os.getenv("PORT", "3001"))
AI_PROVIDER = (os.getenv("AI_PROVIDER") or os.getenv("LLM_PROVIDER") or "mock").lower().strip()
GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip()
GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL") or "openai/gpt-oss-120b"
GEMINI_MODEL = os.getenv("GEMINI_MODEL") or "gemini-flash-latest"

CSV_FILES: dict[str, Path] = {
    "gateway": DATA_DIR / "gateway_records.csv",
    "bank": DATA_DIR / "bank_settlement_records.csv",
    "ledger": DATA_DIR / "ledger_records.csv",
}

REQUIRED_HEADERS: dict[str, list[str]] = {
    "gateway": ["transaction_id", "amount", "currency", "gateway_status"],
    "bank": ["transaction_id", "amount", "currency", "bank_status"],
    "ledger": ["transaction_id", "currency", "ledger_status"],
}

KNOWN_GATEWAY = {"CAPTURED", "AUTHORIZATION_FAILED", "AUTHORIZED", "PENDING", "VOIDED"}
KNOWN_BANK = {"SETTLED", "PENDING", "REJECTED", "RECEIVED", "DELAYED", "FAILED"}
KNOWN_LEDGER = {"POSTED", "PENDING", "REVERSED", "FAILED"}

_store: dict[str, list[dict[str, Any]]] | None = None
_last_reloaded_at: str = ""
_gemini_cooldown_until: float = 0.0
_groq_cooldown_until: float = 0.0

TXN_PATTERN = re.compile(r"\b(?:TXN|TNX|TXM|TZN|TX)[-_ ]*(\d{3,})\b", re.IGNORECASE)
DATE_PATTERN = re.compile(r"\b(\d{4}[-/]\d{2}[-/]\d{2})\b")

# ---------------------------------------------------------------------------
# Data Store Helpers
# ---------------------------------------------------------------------------

def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _clean_str(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _format_iso(value: Any) -> str | None:
    raw = _clean_str(value)
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except ValueError:
        return raw


def _read_csv(path: Path, transform_fn: Any) -> list[dict[str, Any]]:
    if not path.exists():
        logger.warning(f"Data file not found: {path}")
        return []
    with path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        return [
            transform_fn({(k or "").strip(): (v or "").strip() for k, v in row.items()})
            for row in reader
        ]


def _load_store() -> dict[str, list[dict[str, Any]]]:
    return {
        "gateway": _read_csv(
            CSV_FILES["gateway"],
            lambda row: {
                "transaction_id": row.get("transaction_id", ""),
                "gateway_payment_id": row.get("gateway_payment_id", ""),
                "merchant_id": row.get("merchant_id", ""),
                "amount": _to_float(row.get("amount")),
                "currency": row.get("currency", "").upper(),
                "created_at": _format_iso(row.get("created_at")) or "",
                "authorized_at": _format_iso(row.get("authorized_at")),
                "captured_at": _format_iso(row.get("captured_at")),
                "gateway_status": row.get("gateway_status", "").upper(),
                "payment_method": row.get("payment_method", ""),
                "failure_code": _clean_str(row.get("failure_code")),
                "failure_message": _clean_str(row.get("failure_message")),
            },
        ),
        "bank": _read_csv(
            CSV_FILES["bank"],
            lambda row: {
                "transaction_id": row.get("transaction_id", ""),
                "bank_reference_id": row.get("bank_reference_id", ""),
                "settlement_batch_id": row.get("settlement_batch_id", ""),
                "amount": _to_float(row.get("amount")),
                "currency": row.get("currency", "").upper(),
                "received_at": _format_iso(row.get("received_at")) or "",
                "processed_at": _format_iso(row.get("processed_at")),
                "bank_status": row.get("bank_status", "").upper(),
                "bank_response_code": row.get("bank_response_code", ""),
                "bank_response_message": row.get("bank_response_message", ""),
                "settlement_date": _clean_str(row.get("settlement_date")),
            },
        ),
        "ledger": _read_csv(
            CSV_FILES["ledger"],
            lambda row: {
                "transaction_id": row.get("transaction_id", ""),
                "ledger_entry_id": row.get("ledger_entry_id", ""),
                "account_id": row.get("account_id", ""),
                "debit_amount": _to_float(row.get("debit_amount")),
                "credit_amount": _to_float(row.get("credit_amount")),
                "currency": row.get("currency", "").upper(),
                "ledger_created_at": _format_iso(row.get("ledger_created_at")) or "",
                "ledger_status": row.get("ledger_status", "").upper(),
                "reconciliation_status": row.get("reconciliation_status", "").upper(),
                "ledger_description": row.get("ledger_description", ""),
            },
        ),
    }


def get_store(force_reload: bool = False) -> dict[str, list[dict[str, Any]]]:
    global _store, _last_reloaded_at
    if _store is None or force_reload:
        _store = _load_store()
        _last_reloaded_at = datetime.now(timezone.utc).isoformat()
    return _store


def get_active_provider() -> str:
    if AI_PROVIDER == "groq" and GROQ_API_KEY:
        return "groq"
    if AI_PROVIDER == "gemini" and GEMINI_API_KEY:
        return "gemini"
    if AI_PROVIDER in ("auto", "groq", "gemini", ""):
        if GROQ_API_KEY:
            return "groq"
        if GEMINI_API_KEY:
            return "gemini"
    return "mock"


def get_provider_label() -> str:
    mode = get_active_provider()
    if mode == "groq":
        return f"Groq ({GROQ_MODEL})"
    if mode == "gemini":
        return f"Google Gemini ({GEMINI_MODEL})"
    return "Mock Reasoning (Deterministic)"


# ---------------------------------------------------------------------------
# Reconciliation Engine
# ---------------------------------------------------------------------------

def _timestamp_to_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def get_transaction_bundle(transaction_id: str) -> dict[str, Any]:
    store = get_store()
    return {
        "transaction_id": transaction_id,
        "gateway": next((r for r in store["gateway"] if r["transaction_id"] == transaction_id), None),
        "bank": [r for r in store["bank"] if r["transaction_id"] == transaction_id],
        "ledger": [r for r in store["ledger"] if r["transaction_id"] == transaction_id],
    }


def detect_exceptions(data: dict[str, Any]) -> list[dict[str, Any]]:
    gateway = data["gateway"]
    bank = data["bank"]
    ledger = data["ledger"]
    found: list[dict[str, Any]] = []

    def add(kind: str, severity: str, message: str, details: dict[str, Any] | None = None) -> None:
        item: dict[str, Any] = {"type": kind, "severity": severity, "message": message}
        if details:
            item["details"] = details
        found.append(item)

    if not gateway:
        add("MISSING_GATEWAY", "critical", "No gateway record found for this transaction.")

    if gateway and gateway["gateway_status"] != "AUTHORIZATION_FAILED" and not bank:
        add("MISSING_BANK", "critical", "No bank settlement record found despite successful gateway authorization.")

    if gateway and gateway["gateway_status"] != "AUTHORIZATION_FAILED" and not ledger:
        add("MISSING_LEDGER", "warning", "No ledger record found for this transaction.")

    if len(bank) > 1:
        add("DUPLICATE_RECORD", "warning", f"Found {len(bank)} bank settlement records. Potential duplicate.")

    if len(ledger) > 1:
        add("DUPLICATE_RECORD", "warning", f"Found {len(ledger)} ledger entries. Potential duplicate.")

    if gateway and bank:
        amount_diff = abs(gateway["amount"] - bank[0]["amount"])
        curr_diff = gateway["currency"] != bank[0]["currency"]
        if amount_diff > 0.01 or curr_diff:
            add("AMOUNT_OR_CURRENCY_MISMATCH", "critical", "Gateway and bank amount or currency does not match.")

    if gateway and ledger and abs(gateway["amount"] - ledger[0]["debit_amount"]) > 0.01:
        add("AMOUNT_MISMATCH", "warning", "Gateway amount does not match the ledger debit.")

    if gateway and bank:
        bank_time = _timestamp_to_seconds(bank[0].get("received_at"))
        gate_time = _timestamp_to_seconds(gateway.get("captured_at"))
        if bank_time is not None and gate_time is not None and bank_time < gate_time:
            add("TIMESTAMP_CONFLICT", "warning", "Bank received the settlement before the gateway captured the payment.")

    if gateway and gateway["gateway_status"] not in KNOWN_GATEWAY:
        add("UNKNOWN_STATUS", "warning", f'Unknown gateway status: "{gateway["gateway_status"]}"')

    for row in bank:
        if row["bank_status"] not in KNOWN_BANK:
            add("UNKNOWN_STATUS", "warning", f'Unknown bank status: "{row["bank_status"]}"')

    for row in ledger:
        if row["ledger_status"] not in KNOWN_LEDGER:
            add("UNKNOWN_STATUS", "warning", f'Unknown ledger status: "{row["ledger_status"]}"')
        if row.get("reconciliation_status") in {"MISMATCHED", "UNRECONCILED"}:
            severity = "critical" if row["reconciliation_status"] == "MISMATCHED" else "warning"
            add("RECONCILIATION_MISMATCH", severity, f'Ledger entry {row["ledger_entry_id"]} is {row["reconciliation_status"].lower()}.')

    if not gateway and not bank and not ledger:
        add("INSUFFICIENT_EVIDENCE", "critical", "No records found in any system.")

    return found


def investigate(transaction_id: str) -> dict[str, Any]:
    data = get_transaction_bundle(transaction_id)
    gateway, bank, ledger = data["gateway"], data["bank"], data["ledger"]
    found_exceptions = detect_exceptions(data)

    if not gateway and not bank and not ledger:
        status = "UNKNOWN"
    elif gateway and gateway["gateway_status"] == "AUTHORIZATION_FAILED":
        status = "FAILED"
    elif any(row["bank_status"] == "REJECTED" for row in bank):
        status = "REJECTED"
    elif any(row["bank_status"] in {"PENDING", "RECEIVED", "DELAYED"} for row in bank):
        status = "DELAYED" if any(row["bank_status"] == "DELAYED" for row in bank) else "PENDING"
    elif bank and bank[0]["bank_status"] == "SETTLED":
        status = "SETTLED"
    elif gateway and gateway["gateway_status"] == "CAPTURED" and (not bank or not ledger):
        status = "PARTIALLY_RECORDED"
    else:
        status = "UNKNOWN"

    timeline: list[dict[str, Any]] = []
    if gateway:
        timeline.append({
            "system": "gateway",
            "timestamp": gateway.get("created_at"),
            "status": gateway.get("gateway_status"),
            "description": f'Payment {gateway.get("gateway_status", "").lower()} for {gateway.get("currency")} {gateway.get("amount", 0.0):.2f}',
            "reference_id": gateway.get("gateway_payment_id"),
        })

    for row in bank:
        timeline.append({
            "system": "bank",
            "timestamp": row.get("received_at"),
            "status": row.get("bank_status"),
            "description": f'Bank {row.get("bank_status", "").lower()}: {row.get("bank_response_message") or row.get("bank_response_code") or "No message"}',
            "reference_id": row.get("bank_reference_id"),
        })

    for row in ledger:
        timeline.append({
            "system": "ledger",
            "timestamp": row.get("ledger_created_at"),
            "status": row.get("ledger_status"),
            "description": f'Ledger entry: {row.get("ledger_description") or "Recorded"}',
            "reference_id": row.get("ledger_entry_id"),
        })

    timeline.sort(key=lambda event: _timestamp_to_seconds(event.get("timestamp")) or float("inf"))

    amount = gateway["amount"] if gateway else (bank[0]["amount"] if bank else None)
    currency = gateway["currency"] if gateway else (bank[0]["currency"] if bank else None)

    if status == "UNKNOWN":
        summary = "No records were found for this transaction in any system."
    elif amount is not None and currency is not None:
        summary = f"The payment of {currency} {amount:.2f} is {status.lower()} across the available settlement records."
    else:
        summary = f"The transaction is {status.lower()} across available records."

    if any(item["severity"] == "critical" for item in found_exceptions) or not (gateway and bank and ledger):
        confidence = "low"
    elif found_exceptions:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "transaction_id": transaction_id,
        "status": status,
        "confidence": confidence,
        "summary": summary,
        "amount": amount,
        "currency": currency,
        "timeline": timeline,
        "exceptions": found_exceptions,
        "raw_evidence": data,
    }


# ---------------------------------------------------------------------------
# AI Explanations & Fallback
# ---------------------------------------------------------------------------

def generate_fallback_explanation(result: dict[str, Any]) -> dict[str, Any]:
    exceptions = [item["message"] for item in result.get("exceptions", [])]
    return {
        "summary": result["summary"],
        "status": result["status"],
        "reason": result["summary"],
        "timeline_explanation": [event["description"] for event in result.get("timeline", [])],
        "exceptions": exceptions or ["No known exceptions were found."],
        "confidence": result["confidence"],
        "recommended_action": "Review flagged exceptions." if exceptions else "No action required.",
    }


def _extract_json(text: str) -> dict[str, Any] | None:
    """Resiliently extracts and parses JSON dictionary from LLM output."""
    if not text:
        return None
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except Exception:
            pass
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        raw_json = text[first_brace : last_brace + 1].strip()
        try:
            return json.loads(raw_json)
        except Exception:
            cleaned = re.sub(r",\s*([\]}])", r"\1", raw_json)
            try:
                return json.loads(cleaned)
            except Exception:
                pass
    try:
        return json.loads(text.strip())
    except Exception:
        return None


def _clean_llm_text(text: str) -> str:
    """Strips HTML tags, pipe-table rows, and normalises line endings from LLM output."""
    if not text:
        return text
    text = re.sub(r"<br\s*/?>\s*", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"^\s*\|[-|: ]+\|\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _build_investigation_prompt(result: dict[str, Any]) -> tuple[str, str]:
    system_prompt = (
        "You are a professional Fintech Settlement Support AI. "
        "Your job is to analyze cross-system financial data (Payment Gateway, Bank Settlement, and Accounting Ledger) "
        "and explain what happened in clear, friendly everyday English.\n\n"
        "STRICT RULES:\n"
        "1. Write in plain, conversational English that anyone can understand without financial jargon.\n"
        "2. Always explicitly cite specific codes, bank error descriptions, dates, amounts, and references (such as Bank Reference ID, Batch ID, UTR) when present in the evidence.\n"
        "3. Provide realistic, step-by-step next actions for both the merchant and the internal support team.\n"
        "4. Use simple markdown: **bold** for emphasis and '- ' for bullet points. No HTML tags (<br>, <table>). No raw pipe tables.\n"
        "5. Output strictly valid JSON matching the requested keys."
    )

    gw = result.get("raw_evidence", {}).get("gateway")
    bank = result.get("raw_evidence", {}).get("bank") or []
    ledger = result.get("raw_evidence", {}).get("ledger") or []

    evidence = {
        "transaction_id": result.get("transaction_id"),
        "status": result.get("status"),
        "amount": result.get("amount"),
        "currency": result.get("currency"),
        "gateway_status": gw.get("gateway_status") if gw else "MISSING",
        "gateway_failure_code": gw.get("failure_code") if gw else None,
        "gateway_failure_message": gw.get("failure_message") if gw else None,
        "gateway_payment_method": gw.get("payment_method") if gw else None,
        "bank_status": [b.get("bank_status") for b in bank] if bank else "MISSING",
        "bank_response_code": [b.get("bank_response_code") for b in bank] if bank else None,
        "bank_response_message": [b.get("bank_response_message") for b in bank] if bank else None,
        "bank_references": [b.get("bank_reference_id") for b in bank] if bank else None,
        "settlement_batches": [b.get("settlement_batch_id") for b in bank] if bank else None,
        "settlement_dates": [b.get("settlement_date") for b in bank] if bank else None,
        "ledger_status": [l.get("ledger_status") for l in ledger] if ledger else "MISSING",
        "ledger_reconciliation_status": [l.get("reconciliation_status") for l in ledger] if ledger else None,
        "exceptions": [e.get("message") for e in result.get("exceptions", [])],
        "timeline_events": [
            f"[{e.get('system')}] {e.get('timestamp')}: {e.get('status')} - {e.get('description')}"
            for e in result.get("timeline", [])
        ],
    }

    user_prompt = f"""
Analyze this settlement evidence and explain what happened:

Evidence:
{json.dumps(evidence, indent=2, default=str)}

Return strictly valid JSON with these exact keys:
{{
  "summary": "2-3 short, friendly paragraphs explaining what happened. Mention the exact reasons, bank response messages, Bank Reference/UTR if settled, dates, and amounts in plain English.",
  "status": "{result.get('status')}",
  "reason": "Short clear headline with emoji and plain root cause, e.g. ✅ Settlement Completed & Funds Credited (Ref: b_ref_001) or ❌ Card Authorization Declined: Insufficient Funds or ⏳ Settlement Queued: Bank Processing Delay",
  "timeline_explanation": ["Step 1...", "Step 2...", "Step 3..."],
  "exceptions": ["Discrepancy 1...", "Discrepancy 2..."],
  "confidence": "{result.get('confidence', 'high')}",
  "recommended_action": "Friendly, practical step-by-step next action for the merchant and support team."
}}
"""
    return system_prompt, user_prompt


def _call_gemini(result: dict[str, Any]) -> dict[str, Any] | None:
    global _gemini_cooldown_until
    if not GEMINI_API_KEY or time.time() < _gemini_cooldown_until:
        return None

    system_prompt, user_prompt = _build_investigation_prompt(result)
    full_prompt = f"{system_prompt}\n\n{user_prompt}"

    gemini_models = [GEMINI_MODEL, "gemini-3.6-flash", "gemini-2.5-flash"]
    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }

    seen = set()
    models = [m for m in gemini_models if m and not (m in seen or seen.add(m))]

    with httpx.Client(timeout=25.0) as client:
        for model in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
            try:
                res = client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    parsed = _extract_json(text)
                    if parsed and "summary" in parsed:
                        logger.info(f"Generated explanation via Gemini ({model}).")
                        return {
                            "summary": _clean_llm_text(str(parsed.get("summary", ""))),
                            "status": str(parsed.get("status", result.get("status"))),
                            "reason": _clean_llm_text(str(parsed.get("reason", result.get("summary")))),
                            "timeline_explanation": parsed.get("timeline_explanation") or [e["description"] for e in result.get("timeline", [])],
                            "exceptions": parsed.get("exceptions") or [e["message"] for e in result.get("exceptions", [])],
                            "confidence": str(parsed.get("confidence", result.get("confidence"))),
                            "recommended_action": _clean_llm_text(str(parsed.get("recommended_action", ""))),
                        }
                elif res.status_code == 429:
                    _gemini_cooldown_until = time.time() + 60.0
                    logger.warning("Gemini 429 quota reached. Enabling 60s cooldown.")
                    break
                else:
                    logger.warning(f"Gemini ({model}) error {res.status_code}: {res.text[:150]}")
            except Exception as exc:
                logger.warning(f"Gemini call to {model} failed: {exc}")

    return None


def _call_groq(result: dict[str, Any]) -> dict[str, Any] | None:
    global _groq_cooldown_until
    if not GROQ_API_KEY or time.time() < _groq_cooldown_until:
        return None

    system_prompt, user_prompt = _build_investigation_prompt(result)
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    groq_models = [GROQ_MODEL, "openai/gpt-oss-120b"]

    seen = set()
    models = [m for m in groq_models if m and not (m in seen or seen.add(m))]

    with httpx.Client(timeout=20.0) as client:
        for model in models:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            }
            try:
                res = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                if res.status_code == 200:
                    data = res.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    parsed = _extract_json(content)
                    if parsed and "summary" in parsed:
                        logger.info(f"Generated explanation via Groq ({model}).")
                        return {
                            "summary": _clean_llm_text(str(parsed.get("summary", ""))),
                            "status": str(parsed.get("status", result.get("status"))),
                            "reason": _clean_llm_text(str(parsed.get("reason", result.get("summary")))),
                            "timeline_explanation": parsed.get("timeline_explanation") or [e["description"] for e in result.get("timeline", [])],
                            "exceptions": parsed.get("exceptions") or [e["message"] for e in result.get("exceptions", [])],
                            "confidence": str(parsed.get("confidence", result.get("confidence"))),
                            "recommended_action": _clean_llm_text(str(parsed.get("recommended_action", ""))),
                        }
                elif res.status_code == 429:
                    _groq_cooldown_until = time.time() + 60.0
                    logger.warning("Groq 429 rate limit reached. Enabling 60s cooldown.")
                    break
                else:
                    logger.warning(f"Groq ({model}) error {res.status_code}: {res.text[:150]}")
            except Exception as exc:
                logger.warning(f"Groq call to {model} failed: {exc}")

    return None


def get_explanation(result: dict[str, Any]) -> dict[str, Any]:
    provider_name = get_active_provider()
    explanation = None

    if provider_name == "gemini":
        explanation = _call_gemini(result)
        if not explanation:
            logger.info("Gemini failed; failing over to Groq for investigation.")
            explanation = _call_groq(result)
    elif provider_name == "groq":
        explanation = _call_groq(result)
        if not explanation:
            logger.info("Groq failed; failing over to Gemini for investigation.")
            explanation = _call_gemini(result)
    else:
        # Auto mode: try Groq first (fast 1.5s), then Gemini
        if GROQ_API_KEY:
            explanation = _call_groq(result)
        if not explanation and GEMINI_API_KEY:
            explanation = _call_gemini(result)

    if explanation:
        return explanation

    return generate_fallback_explanation(result)


def _general_query_with_gemini(question: str) -> str | None:
    global _gemini_cooldown_until
    if not GEMINI_API_KEY or time.time() < _gemini_cooldown_until:
        return None

    system_prompt = (
        "You are Fintech AI, an intelligent, friendly financial operations assistant. "
        "You specialize in payment settlement, 3-way reconciliation (Payment Gateway, Bank Statements, Accounting Ledgers), "
        "and diagnosing settlement delays and exceptions.\n\n"
        "STRICT RULES:\n"
        "1. Answer in clear, friendly, everyday English with simple markdown formatting (bullet points, bold highlights).\n"
        "2. Do NOT use heavy finance jargon without immediately explaining it in plain words.\n"
        "3. Do NOT use HTML tags (<br>, <table>, <b>, <ul>) or raw pipe tables.\n"
        "4. Separate paragraphs with blank lines (two newlines).\n"
        "5. Provide helpful recommended queries or next steps with emojis.\n"
        "6. Always format the response with an emoji title (e.g. ### 👥 Who Can Use Fintech AI?), structured bullet points, and practical next steps."
    )

    full_prompt = f"{system_prompt}\n\nUser Question: {question}"
    gemini_models = [GEMINI_MODEL, "gemini-3.6-flash", "gemini-2.5-flash"]
    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {"temperature": 0.2},
    }

    seen = set()
    models = [m for m in gemini_models if m and not (m in seen or seen.add(m))]

    with httpx.Client(timeout=25.0) as client:
        for model in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
            try:
                res = client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    if text:
                        return _clean_llm_text(text)
                elif res.status_code == 429:
                    _gemini_cooldown_until = time.time() + 60.0
                    logger.warning("Gemini 429 quota reached in settlement-qa-agent. Cooldown enabled for 60s.")
                    break
            except Exception as exc:
                logger.warning(f"Gemini general query error on {model}: {exc}")

    return None


def _general_query_with_groq(question: str) -> str | None:
    global _groq_cooldown_until
    if not GROQ_API_KEY or time.time() < _groq_cooldown_until:
        return None

    system_prompt = (
        "You are Fintech AI, an intelligent, friendly financial operations assistant. "
        "You specialize in payment settlement, 3-way reconciliation (Payment Gateway, Bank Statements, Accounting Ledgers), "
        "and diagnosing settlement delays and exceptions.\n\n"
        "STRICT RULES:\n"
        "1. Answer in clear, friendly, everyday English with simple markdown formatting (bullet points, bold highlights).\n"
        "2. Do NOT use heavy finance jargon without immediately explaining it in plain words.\n"
        "3. Do NOT use HTML tags (<br>, <table>, <b>, <ul>) or raw pipe tables.\n"
        "4. Separate paragraphs with blank lines (two newlines).\n"
        "5. Provide helpful recommended queries or next steps with emojis.\n"
        "6. Always format the response with an emoji title (e.g. ### 👥 Who Can Use Fintech AI?), structured bullet points, and practical next steps."
    )

    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    groq_models = [GROQ_MODEL, "openai/gpt-oss-120b"]

    seen = set()
    models = [m for m in groq_models if m and not (m in seen or seen.add(m))]

    with httpx.Client(timeout=20.0) as client:
        for model in models:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question},
                ],
                "temperature": 0.2,
            }
            try:
                res = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                if res.status_code == 200:
                    data = res.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if content:
                        return _clean_llm_text(content)
                elif res.status_code == 429:
                    _groq_cooldown_until = time.time() + 60.0
                    logger.warning("Groq 429 rate limit reached in settlement-qa-agent. Cooldown enabled for 60s.")
                    break
            except Exception as exc:
                logger.warning(f"Groq general query error on {model}: {exc}")

    return None


def answer_general_query(question: str) -> str:
    provider = get_active_provider()
    ans = None

    if provider == "gemini":
        ans = _general_query_with_gemini(question)
        if not ans:
            logger.info("Gemini general query failed; failing over to Groq.")
            ans = _general_query_with_groq(question)
    elif provider == "groq":
        ans = _general_query_with_groq(question)
        if not ans:
            logger.info("Groq general query failed; failing over to Gemini.")
            ans = _general_query_with_gemini(question)
    else:
        if GROQ_API_KEY:
            ans = _general_query_with_groq(question)
        if not ans and GEMINI_API_KEY:
            ans = _general_query_with_gemini(question)

    if ans:
        return ans

    # Minimal friendly fallback if both LLMs are completely unreachable
    return (
        f"### 🤖 Fintech AI Payment Assistant\n\n"
        f"I reviewed your question: *\"{question}\"*.\n\n"
        "I am your intelligent assistant for payment investigations, settlement tracking, and 3-way financial reconciliation.\n\n"
        "**Helpful Things You Can Try:**\n"
        "- **Ask Conceptual Questions:**\n"
        "  - *\"Who can use this AI?\"*\n"
        "  - *\"What is 3-way reconciliation?\"*\n"
        "  - *\"Why do settlements get delayed?\"*\n"
        "- **Trace a Transaction:**\n"
        "  - Enter a Transaction ID (e.g. `TXN1001`, `TXN1002`, `TXN1003`)\n"
        "  - Enter a Date filter (e.g. `2026-08-20`)"
    )


# ---------------------------------------------------------------------------
# NLP & Query Parsing
# ---------------------------------------------------------------------------

def parse_question(question: str) -> dict[str, Any]:
    cleaned = question.strip()
    match = TXN_PATTERN.search(cleaned)
    date_match = DATE_PATTERN.search(cleaned)

    txn_id = f"TXN{match.group(1)}" if match else None
    search_date = date_match.group(1).replace("/", "-") if date_match else None

    return {
        "transaction_id": txn_id,
        "date": search_date,
        "intent": "search" if (search_date and not txn_id) else "general",
        "original_question": cleaned,
    }


def get_all_transaction_ids(date: str | None = None) -> list[str]:
    store = get_store()
    ids: set[str] = set()
    for system_records in store.values():
        for row in system_records:
            if not date or any(
                str(row.get(field) or "").startswith(date)
                for field in ("created_at", "received_at", "ledger_created_at", "settlement_date")
            ):
                ids.add(row["transaction_id"])
    return sorted(ids)


def get_store_stats() -> dict[str, Any]:
    store = get_store()
    return {
        "gatewayCount": len(store["gateway"]),
        "bankCount": len(store["bank"]),
        "ledgerCount": len(store["ledger"]),
        "uniqueTransactions": len(get_all_transaction_ids()),
        "lastReloadedAt": _last_reloaded_at,
    }


# ---------------------------------------------------------------------------
# FastAPI Application & Endpoints
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    store = get_store()
    logger.info(
        f"Settlement Q&A Agent ready on port {PORT}: "
        f"{len(store['gateway'])} gateway, {len(store['bank'])} bank, {len(store['ledger'])} ledger records. "
        f"AI Mode: {get_provider_label()}"
    )
    yield


app = FastAPI(title="Settlement Q&A Agent", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "ai_mode": get_active_provider(),
        "ai_mode_label": get_provider_label(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }


@app.get("/api/transactions")
def list_transactions(date: str | None = None):
    ids = get_all_transaction_ids(date)
    return {"success": True, "data": ids, "count": len(ids)}


@app.get("/api/transactions/catalog")
def catalog():
    rows = []
    for txn_id in get_all_transaction_ids():
        result = investigate(txn_id)
        evidence = result["raw_evidence"]
        date_source = evidence["gateway"] or (evidence["bank"] or evidence["ledger"])[0]
        date_value = (
            date_source.get("created_at")
            or date_source.get("settlement_date")
            or date_source.get("received_at")
            or date_source.get("ledger_created_at")
            or ""
        )
        rows.append({
            "transaction_id": txn_id,
            "date": date_value[:10],
            "amount": result["amount"],
            "currency": result["currency"],
            "merchant_id": evidence["gateway"].get("merchant_id") if evidence["gateway"] else None,
            "payment_method": evidence["gateway"].get("payment_method") if evidence["gateway"] else None,
            "gateway_status": evidence["gateway"].get("gateway_status", "MISSING") if evidence["gateway"] else "MISSING",
            "bank_status": ", ".join(r["bank_status"] for r in evidence["bank"]) or "MISSING",
            "ledger_status": ", ".join(r["ledger_status"] for r in evidence["ledger"]) or "MISSING",
            "overall_status": result["status"],
            "confidence_level": result["confidence"],
            "exception_count": len(result["exceptions"]),
            "summary": result["summary"],
        })
    return {"success": True, "data": rows, "total": len(rows)}


@app.get("/api/investigate/{transaction_id}")
def investigate_route(transaction_id: str):
    result = investigate(transaction_id.upper())
    evidence = result["raw_evidence"]
    if not evidence["gateway"] and not evidence["bank"] and not evidence["ledger"]:
        return JSONResponse(
            {"success": False, "error": f'No transaction matching "{transaction_id}" was found.'},
            status_code=404,
        )
    result["explanation"] = get_explanation(result)
    return {
        "success": True,
        "data": result,
        "ai_mode": get_active_provider(),
        "ai_mode_label": get_provider_label(),
    }


@app.post("/api/ask")
async def ask(request: Request):
    body = await request.json()
    question = str((body or {}).get("question") or "").strip()[:500]
    if not question:
        return JSONResponse(
            {"success": False, "error": "Please enter a question or transaction ID."},
            status_code=400,
        )

    parsed = parse_question(question)

    if parsed["date"] and not parsed["transaction_id"]:
        matching_ids = get_all_transaction_ids(parsed["date"])
        results = [investigate(txn_id) for txn_id in matching_ids]
        for item in results:
            item["explanation"] = get_explanation(item)
        return {
            "success": True,
            "data": results,
            "multiple_results": True,
            "ai_mode": get_active_provider(),
            "ai_mode_label": get_provider_label(),
            "parsed_question": parsed,
        }

    if parsed["transaction_id"]:
        result = investigate(parsed["transaction_id"])
        evidence = result["raw_evidence"]
        if evidence["gateway"] or evidence["bank"] or evidence["ledger"]:
            result["explanation"] = get_explanation(result)
            return {
                "success": True,
                "data": result,
                "ai_mode": get_active_provider(),
                "ai_mode_label": get_provider_label(),
                "parsed_question": parsed,
            }

    # Answer general conceptual questions or FAQs
    answer = answer_general_query(question)
    return {
        "success": True,
        "answer": answer,
        "ai_mode": get_active_provider(),
        "ai_mode_label": get_provider_label(),
        "parsed_question": parsed,
    }


@app.post("/api/data/reload")
def reload_data():
    get_store(force_reload=True)
    return {
        "success": True,
        "message": "Data store successfully reloaded.",
        "stats": get_store_stats(),
    }


@app.post("/api/data/validate")
async def validate_data(request: Request):
    body = await request.json()
    system = body.get("system")
    content = body.get("csvContent") or ""

    if system not in REQUIRED_HEADERS:
        return JSONResponse(
            {"success": False, "valid": False, "error": "Invalid system specified."},
            status_code=400,
        )

    reader = csv.DictReader(io.StringIO(content))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    rows = list(reader)
    missing = [h for h in REQUIRED_HEADERS[system] if h not in headers]

    return {
        "success": not missing and bool(rows),
        "valid": not missing and bool(rows),
        "error": f"Missing required columns: {', '.join(missing)}" if missing else None,
        "rowCount": len(rows),
        "headers": headers,
    }


@app.post("/api/data/upload")
async def upload_data(request: Request):
    body = await request.json()
    system = body.get("system")
    content = body.get("csvContent") or ""
    mode = body.get("mode", "append")

    if system not in REQUIRED_HEADERS or mode not in ("append", "replace"):
        return JSONResponse(
            {"success": False, "error": "Invalid system or upload mode."},
            status_code=400,
        )

    reader = csv.DictReader(io.StringIO(content))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    rows = list(reader)
    missing = [h for h in REQUIRED_HEADERS[system] if h not in headers]

    if not rows or missing:
        return JSONResponse(
            {
                "success": False,
                "error": f"Missing required columns: {', '.join(missing)}" if missing else "CSV has no data rows.",
            },
            status_code=400,
        )

    path = CSV_FILES[system]
    if mode == "replace" or not path.exists():
        path.write_text(content.strip() + "\n", encoding="utf-8")
    else:
        existing = path.read_text(encoding="utf-8")
        path.write_text(
            existing.rstrip("\n") + "\n" + "\n".join(content.strip().splitlines()[1:]) + "\n",
            encoding="utf-8",
        )

    get_store(force_reload=True)
    return {
        "success": True,
        "message": f"Successfully {mode}d {len(rows)} {system} record(s).",
        "rowCount": len(rows),
        "system": system,
        "mode": mode,
        "stats": get_store_stats(),
    }


@app.get("/api/data/stats")
def data_stats():
    return {"success": True, "stats": get_store_stats()}


@app.get("/api/data/records")
def data_records():
    return {"success": True, "data": get_store()}


# ---------------------------------------------------------------------------
# SPA Static File Serving
# ---------------------------------------------------------------------------

if CLIENT_DIST.exists():
    app.mount("/assets", StaticFiles(directory=CLIENT_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(_request: Request, full_path: str):
        candidate = CLIENT_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(
            CLIENT_DIST / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
