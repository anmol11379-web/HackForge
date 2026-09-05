// ============================================================
// Shared Types for Settlement Q&A Agent
// ============================================================

// ---------- CSV Record Types ----------

export interface GatewayRecord {
  transaction_id: string;
  gateway_payment_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  created_at: string;
  authorized_at: string | null;
  captured_at: string | null;
  gateway_status: string;
  payment_method: string;
  failure_code: string | null;
  failure_message: string | null;
}

export interface BankRecord {
  transaction_id: string;
  bank_reference_id: string;
  settlement_batch_id: string;
  amount: number;
  currency: string;
  received_at: string;
  processed_at: string | null;
  bank_status: string;
  bank_response_code: string;
  bank_response_message: string;
  settlement_date: string | null;
}

export interface LedgerRecord {
  transaction_id: string;
  ledger_entry_id: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  currency: string;
  ledger_created_at: string;
  ledger_status: string;
  reconciliation_status: string;
  ledger_description: string;
}

// ---------- Investigation Types ----------

export type SettlementStatus =
  | 'SETTLED'
  | 'PENDING'
  | 'DELAYED'
  | 'FAILED'
  | 'REJECTED'
  | 'PARTIALLY_RECORDED'
  | 'UNKNOWN';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface TimelineEvent {
  system: 'gateway' | 'bank' | 'ledger';
  timestamp: string | null;
  status: string;
  description: string;
  reference_id: string;
  error_code?: string | null;
  failure_reason?: string | null;
}

export interface TransactionBundle {
  transaction_id: string;
  gateway: GatewayRecord | null;
  bank: BankRecord[];
  ledger: LedgerRecord[];
}

export interface ReconciliationException {
  type:
    | 'MISSING_GATEWAY'
    | 'MISSING_BANK'
    | 'MISSING_LEDGER'
    | 'AMOUNT_MISMATCH'
    | 'CURRENCY_MISMATCH'
    | 'TIMESTAMP_CONFLICT'
    | 'DUPLICATE_RECORD'
    | 'UNKNOWN_STATUS'
    | 'RECONCILIATION_MISMATCH'
    | 'INSUFFICIENT_EVIDENCE';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
}

export interface InvestigationResult {
  transaction_id: string;
  status: SettlementStatus;
  confidence: ConfidenceLevel;
  summary: string;
  amount: number | null;
  currency: string | null;
  settlement_date: string | null;
  processing_duration_ms: number | null;
  timeline: TimelineEvent[];
  exceptions: ReconciliationException[];
  raw_evidence: TransactionBundle;
  explanation: AIExplanation | null;
}

// ---------- AI Types ----------

export interface AIExplanation {
  summary: string;
  status: string;
  reason: string;
  timeline_explanation: string[];
  exceptions: string[];
  confidence: string;
  recommended_action: string;
}

// ---------- API Types ----------

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  success: boolean;
  data?: InvestigationResult | InvestigationResult[];
  error?: string;
  ai_mode: string;
  multiple_results?: boolean;
}

export interface HealthResponse {
  status: string;
  ai_mode: string;
  timestamp: string;
  version: string;
}
