"""AI Reasoning and Plain-English Explanation Engine.

All responses are dynamically generated using Google Gemini or Groq LLM APIs
with the configured API keys. Canned deterministic response generators have been
replaced with live LLM reasoning and seamless dual-provider failover.
"""

import json
import logging
import re
import time
from typing import Optional, Dict, Any, List, Tuple
import httpx

from app.config import settings
from app.models.domain import SettlementTraceResult, SettlementStatus
from app.models.schemas import SettlementQueryResponse

logger = logging.getLogger(__name__)


def _clean_llm_text(text: str) -> str:
    """Strips HTML tags, pipe-table rows, and normalises line endings from LLM output."""
    if not text:
        return text

    # Replace <br> variants with a real newline
    text = re.sub(r"<br\s*/?>\s*", "\n", text, flags=re.IGNORECASE)

    # Strip every remaining HTML tag
    text = re.sub(r"<[^>]+>", "", text)

    # Remove markdown table header separator rows like |---|---|
    text = re.sub(r"^\s*\|[-|: ]+\|\s*$", "", text, flags=re.MULTILINE)

    # Remove pure pipe-table rows (lines that start AND end with |)
    text = re.sub(r"^\s*\|.*\|\s*$", lambda m: _table_row_to_bullet(m.group()), text, flags=re.MULTILINE)

    # Collapse 3+ consecutive blank lines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def _table_row_to_bullet(row: str) -> str:
    """Converts a markdown table row like | Col A | Col B | into bullet text."""
    cells = [c.strip() for c in row.strip().strip("|").split("|") if c.strip()]
    if not cells:
        return ""
    return "- " + "  ".join(cells)


def _coerce_list(val: Any) -> List[str]:
    """Coerces string, list, or dictionary values from LLM responses into a clean list of strings."""
    if not val:
        return []
    if isinstance(val, list):
        items = []
        for item in val:
            if isinstance(item, str):
                cleaned = item.strip()
                if cleaned:
                    items.append(cleaned)
            elif isinstance(item, dict):
                text = " ".join(str(v).strip() for v in item.values() if v)
                if text:
                    items.append(text)
            elif item is not None:
                items.append(str(item).strip())
        return items
    if isinstance(val, str):
        lines = [line.strip().lstrip("-*• ").strip() for line in val.split("\n") if line.strip()]
        return lines if lines else [val.strip()]
    return [str(val)]


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Resiliently extracts and parses JSON dictionary from LLM output."""
    if not text:
        return None

    # 1. Try markdown code block ```json ... ```
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except Exception:
            pass

    # 2. Try substring between first { and last }
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        raw_json = text[first_brace : last_brace + 1].strip()
        try:
            return json.loads(raw_json)
        except Exception:
            # Strip trailing commas before closing braces/brackets
            cleaned = re.sub(r",\s*([\]}])", r"\1", raw_json)
            try:
                return json.loads(cleaned)
            except Exception:
                pass

    # 3. Direct load attempt
    try:
        return json.loads(text.strip())
    except Exception:
        return None


def extract_identifiers_from_query(query_text: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Extracts payment_id, order_id, txn_id, or date from freeform user queries."""
    if not query_text:
        return None, None, None

    # Match payment_id pattern (e.g. pay_xxxxx)
    pay_match = re.search(r"\b(pay_[a-zA-Z0-9_]+)\b", query_text, re.IGNORECASE)
    if pay_match:
        payment_id = pay_match.group(1)
        # Match date
        date_match = re.search(r"\b(20\d{2}[-/]\d{2}[-/]\d{2})\b", query_text)
        return payment_id, date_match.group(1) if date_match else None, None

    # Match TXN pattern (e.g. TXN1001, txn_1001)
    txn_match = re.search(r"\b(txn[-_ ]*[a-zA-Z0-9]+)\b", query_text, re.IGNORECASE)
    if txn_match:
        payment_id = txn_match.group(1)
        date_match = re.search(r"\b(20\d{2}[-/]\d{2}[-/]\d{2})\b", query_text)
        return payment_id, date_match.group(1) if date_match else None, None

    # Match order_id pattern (e.g. order_xxxxx)
    order_match = re.search(r"\b(order_[a-zA-Z0-9_]+)\b", query_text, re.IGNORECASE)
    order_id = order_match.group(1) if order_match else None

    # Match date pattern YYYY-MM-DD
    date_match = re.search(r"\b(20\d{2}[-/]\d{2}[-/]\d{2})\b", query_text)
    date_str = date_match.group(1) if date_match else None

    return order_id, date_str, None


class SettlementExplainer:
    """Generates plain-English explanations using Google Gemini and Groq APIs with automatic failover."""

    def __init__(self):
        self.provider = (settings.LLM_PROVIDER or "auto").lower().strip()
        self.gemini_key = (settings.GEMINI_API_KEY or "").strip()
        self.groq_key = (settings.GROQ_API_KEY or "").strip()
        self.gemini_models = [
            settings.GEMINI_MODEL,
            "gemini-3.6-flash",
            "gemini-2.5-flash",
        ]
        self.groq_models = [
            settings.GROQ_MODEL,
            "openai/gpt-oss-120b",
        ]
        self._gemini_cooldown_until: float = 0.0
        self._groq_cooldown_until: float = 0.0

    def _call_gemini(self, prompt: str, system_instruction: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Calls Google Gemini API with model fallback and error handling."""
        if not self.gemini_key:
            return None

        if time.time() < self._gemini_cooldown_until:
            logger.info("Gemini in cooldown period; skipping to failover provider.")
            return None

        full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
        payload = {
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "response_mime_type": "application/json",
            },
        }

        # Deduplicate model candidates
        seen = set()
        models = [m for m in self.gemini_models if m and not (m in seen or seen.add(m))]

        with httpx.Client(timeout=25.0) as client:
            for model_name in models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.gemini_key}"
                try:
                    resp = client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        parsed = _extract_json(text)
                        if parsed:
                            logger.info(f"Successfully generated response via Gemini ({model_name}).")
                            return parsed
                    elif resp.status_code == 429:
                        self._gemini_cooldown_until = time.time() + 60.0
                        logger.warning("Gemini 429 quota reached. Enabling 60s cooldown.")
                        break
                    else:
                        logger.warning(f"Gemini model {model_name} returned status {resp.status_code}: {resp.text[:150]}")
                except Exception as exc:
                    logger.warning(f"Gemini call to {model_name} failed: {exc}")

        return None

    def _call_groq(self, prompt: str, system_prompt: str) -> Optional[Dict[str, Any]]:
        """Calls Groq API with model fallback and error handling."""
        if not self.groq_key:
            return None

        if time.time() < self._groq_cooldown_until:
            logger.info("Groq in cooldown period; skipping to failover provider.")
            return None

        headers = {
            "Authorization": f"Bearer {self.groq_key}",
            "Content-Type": "application/json",
        }

        # Deduplicate model candidates
        seen = set()
        models = [m for m in self.groq_models if m and not (m in seen or seen.add(m))]

        with httpx.Client(timeout=20.0) as client:
            for model_name in models:
                payload = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                }
                try:
                    resp = client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        json=payload,
                        headers=headers,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                        parsed = _extract_json(content)
                        if parsed:
                            logger.info(f"Successfully generated response via Groq ({model_name}).")
                            return parsed
                    elif resp.status_code == 429:
                        self._groq_cooldown_until = time.time() + 60.0
                        logger.warning("Groq 429 rate limit reached. Enabling 60s cooldown.")
                        break
                    else:
                        logger.warning(f"Groq model {model_name} returned status {resp.status_code}: {resp.text[:150]}")
                except Exception as exc:
                    logger.warning(f"Groq call to {model_name} failed: {exc}")

        return None

    def explain(self, trace: SettlementTraceResult, user_question: Optional[str] = None) -> SettlementQueryResponse:
        """Explains the settlement trace result using live Gemini or Groq LLM reasoning."""
        # 1. Build concise evidence package for the LLM
        evidence = {
            "payment_id": trace.payment_id,
            "order_id": trace.order_id,
            "merchant_id": trace.merchant_id,
            "captured_amount_inr": trace.captured_amount,
            "net_settlement_inr": trace.net_settlement_amount,
            "fee_inr": trace.fee_inr,
            "tax_inr": trace.tax_inr,
            "gateway_status": trace.gateway_status,
            "gateway_details": trace.gateway_record or {},
            "bank_status": trace.bank_status,
            "bank_settlement_details": trace.bank_record or {},
            "bank_failure_reason": (trace.bank_record or {}).get("failure_reason"),
            "bank_account": (trace.bank_record or {}).get("bank_account_num"),
            "bank_ifsc": (trace.bank_record or {}).get("ifsc"),
            "utr": trace.utr,
            "ledger_status": trace.ledger_status,
            "ledger_records": trace.ledger_records or [],
            "expected_settlement_date": trace.expected_settlement_date,
            "actual_settlement_date": trace.actual_settlement_date,
            "calculated_overall_status": trace.overall_status.value,
            "is_exception": trace.is_exception,
            "exception_details": trace.exception_details.model_dump() if trace.exception_details else None,
            "timeline_events": [f"[{s.system}] {s.timestamp}: {s.action} - {s.status} ({s.details})" for s in trace.timeline],
        }

        question = user_question or "What happened to this settlement transaction and where are the funds?"

        system_prompt = (
            "You are a professional Fintech Settlement Support AI. "
            "Your job is to analyze cross-system financial data (Payment Gateway, Bank Settlement, and Accounting Ledger) "
            "and explain what happened in clear, friendly everyday English.\n\n"
            "STRICT RULES:\n"
            "1. Write in plain, conversational English that anyone can understand without financial jargon.\n"
            "2. Always explicitly cite specific codes, bank error descriptions, dates, amounts, and references (such as IFSC, UTR, etc.) when present in the evidence.\n"
            "3. Provide realistic, step-by-step next actions for both the merchant and the internal support team.\n"
            "4. Use simple markdown: **bold** for emphasis and '- ' for bullet points. No HTML tags (<br>, <table>). No raw pipe tables.\n"
            "5. Output strictly valid JSON matching the requested keys."
        )

        user_prompt = f"""
Analyze the settlement evidence below and answer the user question: "{question}".

Settlement Evidence:
{json.dumps(evidence, indent=2, default=str)}

Return strictly valid JSON with these exact keys:
{{
  "headline_status": "Short clear headline with emoji, e.g. ✅ Settlement Credited or ❌ Settlement Payout Rejected",
  "plain_english_summary": "2-3 short paragraphs explaining what happened. Mention the exact reasons, bank error codes (e.g. IFSC code if invalid), UTR number if settled, dates, and amounts in plain English.",
  "delay_or_failure_reason": "One plain sentence describing the root cause.",
  "next_actions_merchant": ["Step-by-step action for merchant"],
  "next_actions_support": ["Action for internal support team"],
  "overall_status": "{trace.overall_status.value}",
  "confidence_score": {trace.confidence_score}
}}
"""

        # 2. Query LLM with provider routing and dual failover
        parsed = None

        if self.provider == "gemini":
            parsed = self._call_gemini(user_prompt, system_prompt)
            if not parsed:
                logger.info("Gemini failed; failing over to Groq.")
                parsed = self._call_groq(user_prompt, system_prompt)
        elif self.provider == "groq":
            parsed = self._call_groq(user_prompt, system_prompt)
            if not parsed:
                logger.info("Groq failed; failing over to Gemini.")
                parsed = self._call_gemini(user_prompt, system_prompt)
        else:
            # Auto mode: try Groq first (blazing fast ~1.5s), then Gemini
            if self.groq_key:
                parsed = self._call_groq(user_prompt, system_prompt)
            if not parsed and self.gemini_key:
                parsed = self._call_gemini(user_prompt, system_prompt)

        # 3. If LLM returned a valid response, build response from it
        if parsed:
            return self._build_response_from_llm_dict(trace, parsed)

        # 4. Emergency fallback only if both LLM APIs failed/unreachable
        logger.error("Both Gemini and Groq LLM API calls failed. Returning factual summary.")
        return self._build_offline_fallback(trace)

    def explain_general_query(self, user_question: str) -> SettlementQueryResponse:
        """Explains general/conceptual questions using live Gemini or Groq LLM generation."""
        system_prompt = (
            "You are Fintech AI, an intelligent, friendly financial operations assistant. "
            "You specialize in payment settlement, 3-way reconciliation (Payment Gateway, Bank Statements, Accounting Ledgers), "
            "and diagnosing settlement delays and exceptions.\n\n"
            "STRICT RULES:\n"
            "1. Answer in clear, friendly, everyday English with simple markdown formatting (bullet points, bold highlights).\n"
            "2. Do NOT use heavy finance jargon without immediately explaining it in plain words.\n"
            "3. Do NOT use HTML tags (<br>, <table>, <b>, <ul>) or markdown tables (|col|col| format).\n"
            "4. Separate paragraphs with blank lines (two newlines).\n"
            "5. Provide helpful recommended queries or next steps.\n"
            "6. Output strictly valid JSON matching the requested keys."
        )

        user_prompt = f"""
User Question: "{user_question}"

Return strictly valid JSON with these exact keys:
{{
  "headline_status": "Short title with emoji, e.g. 👥 Who Can Use Fintech AI? or 💳 How Settlement Works",
  "plain_english_summary": "Comprehensive, structured explanation in 2-4 short paragraphs or bullet points answering the question. Plain English only.",
  "next_actions_merchant": ["Helpful suggestion or query to try, e.g. Try querying pay_success_001"],
  "next_actions_support": ["Helpful suggestion or query to try, e.g. Inspect the Exceptions tab for active anomalies"]
}}
"""

        parsed = None

        if self.provider == "gemini":
            parsed = self._call_gemini(user_prompt, system_prompt)
            if not parsed:
                logger.info("Gemini failed; failing over to Groq for general query.")
                parsed = self._call_groq(user_prompt, system_prompt)
        elif self.provider == "groq":
            parsed = self._call_groq(user_prompt, system_prompt)
            if not parsed:
                logger.info("Groq failed; failing over to Gemini for general query.")
                parsed = self._call_gemini(user_prompt, system_prompt)
        else:
            # Auto mode
            if self.groq_key:
                parsed = self._call_groq(user_prompt, system_prompt)
            if not parsed and self.gemini_key:
                parsed = self._call_gemini(user_prompt, system_prompt)

        if parsed:
            summary = _clean_llm_text(parsed.get("plain_english_summary", ""))
            return SettlementQueryResponse(
                headline_status=parsed.get("headline_status", "Fintech AI Assistant"),
                plain_english_summary=summary,
                overall_status=SettlementStatus.INFO,
                confidence_score=1.0,
                is_general_query=True,
                next_actions_merchant=_coerce_list(parsed.get("next_actions_merchant")) or [
                    "Enter a payment ID like pay_success_001 to trace records",
                    "Ask why a payment failed (e.g. pay_fail_gateway_001)",
                ],
                next_actions_support=_coerce_list(parsed.get("next_actions_support")) or [
                    "Check the Exceptions tab to review flagged items",
                ],
            )

        # Emergency fallback if both LLMs unreachable
        return SettlementQueryResponse(
            headline_status="⚠️ AI Service Temporarily Offline",
            plain_english_summary=(
                f"We received your question: '{user_question}'.\n\n"
                "The live AI service (Gemini / Groq) is currently unreachable. "
                "Please verify your internet connection and API key configurations in the .env file."
            ),
            overall_status=SettlementStatus.INFO,
            confidence_score=0.5,
            is_general_query=True,
            next_actions_merchant=["Check API keys in .env", "Retry your question"],
            next_actions_support=["Verify Gemini and Groq API connectivity"],
        )

    def _build_response_from_llm_dict(
        self, trace: SettlementTraceResult, llm_dict: Dict[str, Any]
    ) -> SettlementQueryResponse:
        """Builds final SettlementQueryResponse from LLM parsed dictionary."""
        summary = _clean_llm_text(
            llm_dict.get("plain_english_summary", trace.delay_or_failure_reason or "")
        )

        # Determine overall_status from LLM or retain trace status
        llm_status_str = str(llm_dict.get("overall_status", "")).upper()
        overall_status = trace.overall_status
        for status_enum in SettlementStatus:
            if status_enum.value == llm_status_str:
                overall_status = status_enum
                break

        return SettlementQueryResponse(
            headline_status=llm_dict.get("headline_status", f"Settlement Status: {overall_status.value}"),
            plain_english_summary=summary,
            overall_status=overall_status,
            delay_or_failure_reason=llm_dict.get("delay_or_failure_reason", trace.delay_or_failure_reason),
            expected_settlement_date=trace.expected_settlement_date,
            actual_settlement_date=trace.actual_settlement_date,
            utr=trace.utr,
            timeline=trace.timeline,
            next_actions_merchant=_coerce_list(llm_dict.get("next_actions_merchant")),
            next_actions_support=_coerce_list(llm_dict.get("next_actions_support")),
            is_exception=trace.is_exception,
            confidence_score=float(llm_dict.get("confidence_score", trace.confidence_score)),
            exception_details=trace.exception_details,
            trace_data=trace,
            is_general_query=False,
        )

    def _build_offline_fallback(self, trace: SettlementTraceResult) -> SettlementQueryResponse:
        """Minimal transparent factual fallback used only when both LLM APIs are completely unreachable."""
        pid = trace.payment_id
        amount = f"INR {trace.captured_amount:,.2f}" if trace.captured_amount else "N/A"

        return SettlementQueryResponse(
            headline_status=f"Settlement Status: {trace.overall_status.value}",
            plain_english_summary=(
                f"**Transaction:** `{pid}`\n\n"
                f"• **Amount:** {amount}\n"
                f"• **Status:** {trace.overall_status.value}\n"
                f"• **Reason:** {trace.delay_or_failure_reason or 'No delay or failure detected.'}\n\n"
                "*(Note: Live LLM explanation could not be generated as both Gemini and Groq API calls were unreachable.)*"
            ),
            overall_status=trace.overall_status,
            delay_or_failure_reason=trace.delay_or_failure_reason,
            expected_settlement_date=trace.expected_settlement_date,
            actual_settlement_date=trace.actual_settlement_date,
            utr=trace.utr,
            timeline=trace.timeline,
            next_actions_merchant=["Verify transaction ID", "Check API keys in .env"],
            next_actions_support=["Check connection to Groq and Gemini APIs"],
            is_exception=trace.is_exception,
            confidence_score=trace.confidence_score,
            exception_details=trace.exception_details,
            trace_data=trace,
            is_general_query=False,
        )


# Singleton explainer instance
explainer = SettlementExplainer()
