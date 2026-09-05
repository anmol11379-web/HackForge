"""Repository for reading, indexing, and querying mock fintech CSV datasets."""

import csv
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

from app.config import settings
from app.models.domain import GatewayTransaction, BankSettlementRecord, LedgerEntry

logger = logging.getLogger(__name__)


class SettlementDataRepository:
    """In-memory indexed repository for gateway, bank, and ledger records."""

    def __init__(
        self,
        gateway_path: Optional[Path] = None,
        bank_path: Optional[Path] = None,
        ledger_path: Optional[Path] = None,
    ):
        self.gateway_path = gateway_path or settings.GATEWAY_CSV_PATH
        self.bank_path = bank_path or settings.BANK_CSV_PATH
        self.ledger_path = ledger_path or settings.LEDGER_CSV_PATH

        self.gateway_by_id: Dict[str, GatewayTransaction] = {}
        self.gateway_by_order_id: Dict[str, GatewayTransaction] = {}
        self.bank_by_payment_id: Dict[str, BankSettlementRecord] = {}
        self.ledger_by_payment_id: Dict[str, List[LedgerEntry]] = {}

        self.all_payment_ids: set[str] = set()
        self.load_all()

    def load_all(self) -> Dict[str, int]:
        """Loads all CSV files and indexes them."""
        self.gateway_by_id.clear()
        self.gateway_by_order_id.clear()
        self.bank_by_payment_id.clear()
        self.ledger_by_payment_id.clear()
        self.all_payment_ids.clear()

        gw_count = self._load_gateway()
        bank_count = self._load_bank()
        ledger_count = self._load_ledger()

        logger.info(
            f"Loaded {gw_count} gateway, {bank_count} bank, {ledger_count} ledger entries."
        )
        return {
            "gateway_records": gw_count,
            "bank_records": bank_count,
            "ledger_records": ledger_count,
        }

    def _load_gateway(self) -> int:
        if not self.gateway_path.exists():
            logger.warning(f"Gateway CSV not found at {self.gateway_path}")
            return 0

        count = 0
        with open(self.gateway_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                pid = row["payment_id"].strip()
                if not pid:
                    continue
                gw = GatewayTransaction(
                    payment_id=pid,
                    order_id=row.get("order_id", "").strip(),
                    merchant_id=row.get("merchant_id", "").strip(),
                    amount_inr=float(row.get("amount_inr", 0.0) or 0.0),
                    currency=row.get("currency", "INR").strip(),
                    status=row.get("status", "").strip(),
                    method=row.get("method", "").strip(),
                    captured_at=row.get("captured_at", "").strip() or None,
                    fee_inr=float(row.get("fee_inr", 0.0) or 0.0),
                    tax_inr=float(row.get("tax_inr", 0.0) or 0.0),
                    error_code=row.get("error_code", "").strip() or None,
                    error_description=row.get("error_description", "").strip() or None,
                    risk_level=row.get("risk_level", "normal").strip(),
                )
                self.gateway_by_id[pid] = gw
                if gw.order_id:
                    self.gateway_by_order_id[gw.order_id] = gw
                self.all_payment_ids.add(pid)
                count += 1
        return count

    def _load_bank(self) -> int:
        if not self.bank_path.exists():
            logger.warning(f"Bank CSV not found at {self.bank_path}")
            return 0

        count = 0
        with open(self.bank_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                pid = row["payment_id"].strip()
                if not pid:
                    continue
                bank = BankSettlementRecord(
                    settlement_id=row.get("settlement_id", "").strip(),
                    payment_id=pid,
                    utr=row.get("utr", "").strip() or None,
                    merchant_id=row.get("merchant_id", "").strip(),
                    bank_account_num=row.get("bank_account_num", "").strip(),
                    ifsc=row.get("ifsc", "").strip(),
                    gross_amount_inr=float(row.get("gross_amount_inr", 0.0) or 0.0),
                    net_amount_inr=float(row.get("net_amount_inr", 0.0) or 0.0),
                    status=row.get("status", "").strip(),
                    failure_reason=row.get("failure_reason", "").strip() or None,
                    initiated_at=row.get("initiated_at", "").strip() or None,
                    settled_at=row.get("settled_at", "").strip() or None,
                )
                self.bank_by_payment_id[pid] = bank
                self.all_payment_ids.add(pid)
                count += 1
        return count

    def _load_ledger(self) -> int:
        if not self.ledger_path.exists():
            logger.warning(f"Ledger CSV not found at {self.ledger_path}")
            return 0

        count = 0
        with open(self.ledger_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                pid = row["payment_id"].strip()
                if not pid:
                    continue
                entry = LedgerEntry(
                    entry_id=row.get("entry_id", "").strip(),
                    payment_id=pid,
                    settlement_id=row.get("settlement_id", "").strip() or None,
                    merchant_id=row.get("merchant_id", "").strip(),
                    account_type=row.get("account_type", "").strip(),
                    amount_inr=float(row.get("amount_inr", 0.0) or 0.0),
                    entry_type=row.get("entry_type", "").strip(),
                    post_date=row.get("post_date", "").strip(),
                    status=row.get("status", "").strip(),
                    hold_reason=row.get("hold_reason", "").strip() or None,
                )
                if pid not in self.ledger_by_payment_id:
                    self.ledger_by_payment_id[pid] = []
                self.ledger_by_payment_id[pid].append(entry)
                self.all_payment_ids.add(pid)
                count += 1
        return count

    def get_gateway(self, payment_id: str) -> Optional[GatewayTransaction]:
        return self.gateway_by_id.get(payment_id)

    def get_gateway_by_order(self, order_id: str) -> Optional[GatewayTransaction]:
        return self.gateway_by_order_id.get(order_id)

    def get_bank(self, payment_id: str) -> Optional[BankSettlementRecord]:
        return self.bank_by_payment_id.get(payment_id)

    def get_ledger(self, payment_id: str) -> List[LedgerEntry]:
        return self.ledger_by_payment_id.get(payment_id, [])

    def get_all_payment_ids(self) -> List[str]:
        return sorted(list(self.all_payment_ids))

    def find_payments(
        self,
        merchant_id: Optional[str] = None,
        date_str: Optional[str] = None,
    ) -> List[str]:
        """Finds matching payment IDs by merchant or date."""
        matches = set()
        for pid in self.all_payment_ids:
            gw = self.gateway_by_id.get(pid)
            bank = self.bank_by_payment_id.get(pid)
            ledger_entries = self.ledger_by_payment_id.get(pid, [])

            # Check merchant
            m_id = None
            if gw:
                m_id = gw.merchant_id
            elif bank:
                m_id = bank.merchant_id
            elif ledger_entries:
                m_id = ledger_entries[0].merchant_id

            if merchant_id and m_id != merchant_id:
                continue

            # Check date
            if date_str:
                date_match = False
                if gw and gw.captured_at and gw.captured_at.startswith(date_str):
                    date_match = True
                if bank and bank.settled_at and bank.settled_at.startswith(date_str):
                    date_match = True
                if bank and bank.initiated_at and bank.initiated_at.startswith(date_str):
                    date_match = True
                for le in ledger_entries:
                    if le.post_date and le.post_date.startswith(date_str):
                        date_match = True
                if not date_match:
                    continue

            matches.add(pid)
        return sorted(list(matches))


# Singleton repository instance
repository = SettlementDataRepository()
