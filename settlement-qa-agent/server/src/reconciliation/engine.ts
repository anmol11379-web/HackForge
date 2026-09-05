// ============================================================
// Reconciliation Engine
// ============================================================
// Deterministic investigation engine that is the SOURCE OF TRUTH.
// The LLM may explain findings, but never overrides raw data.

import type {
  GatewayRecord,
  BankRecord,
  LedgerRecord,
  TransactionBundle,
  TimelineEvent,
  ReconciliationException,
  InvestigationResult,
  SettlementStatus,
  ConfidenceLevel,
} from '../types/index.js';
import { getDataStore } from '../parsers/csvParser.js';

// ---------- Lookup ----------

export function findTransactionBundle(transactionId: string): TransactionBundle {
  const store = getDataStore();
  const gateway = store.gateway.find((r) => r.transaction_id === transactionId) || null;
  const bank = store.bank.filter((r) => r.transaction_id === transactionId);
  const ledger = store.ledger.filter((r) => r.transaction_id === transactionId);
  return { transaction_id: transactionId, gateway, bank, ledger };
}

export function findTransactionsByDate(date: string): string[] {
  const store = getDataStore();
  const txnIds = new Set<string>();

  // Match against gateway created_at, bank settlement_date, or bank received_at
  for (const rec of store.gateway) {
    if (rec.created_at.startsWith(date)) txnIds.add(rec.transaction_id);
  }
  for (const rec of store.bank) {
    if (rec.settlement_date === date || rec.received_at.startsWith(date)) {
      txnIds.add(rec.transaction_id);
    }
  }
  for (const rec of store.ledger) {
    if (rec.ledger_created_at.startsWith(date)) txnIds.add(rec.transaction_id);
  }

  return Array.from(txnIds).sort();
}

export function getAllTransactionIds(): string[] {
  const store = getDataStore();
  const ids = new Set<string>();
  store.gateway.forEach((r) => ids.add(r.transaction_id));
  store.bank.forEach((r) => ids.add(r.transaction_id));
  store.ledger.forEach((r) => ids.add(r.transaction_id));
  return Array.from(ids).sort();
}

// ---------- Timeline builder ----------

function buildTimeline(bundle: TransactionBundle): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const { gateway, bank, ledger } = bundle;

  if (gateway) {
    events.push({
      system: 'gateway',
      timestamp: gateway.created_at,
      status: 'CREATED',
      description: `Payment created via ${gateway.payment_method} for ${gateway.currency} ${gateway.amount.toFixed(2)}`,
      reference_id: gateway.gateway_payment_id,
    });

    if (gateway.authorized_at) {
      events.push({
        system: 'gateway',
        timestamp: gateway.authorized_at,
        status: gateway.gateway_status === 'AUTHORIZATION_FAILED' ? 'FAILED' : 'AUTHORIZED',
        description: gateway.gateway_status === 'AUTHORIZATION_FAILED'
          ? `Authorization failed: ${gateway.failure_message || 'Unknown reason'}`
          : 'Payment authorized successfully',
        reference_id: gateway.gateway_payment_id,
        error_code: gateway.failure_code,
        failure_reason: gateway.failure_message,
      });
    } else if (gateway.gateway_status === 'AUTHORIZATION_FAILED') {
      events.push({
        system: 'gateway',
        timestamp: gateway.created_at,
        status: 'FAILED',
        description: `Authorization failed: ${gateway.failure_message || 'Unknown reason'}`,
        reference_id: gateway.gateway_payment_id,
        error_code: gateway.failure_code,
        failure_reason: gateway.failure_message,
      });
    }

    if (gateway.captured_at) {
      events.push({
        system: 'gateway',
        timestamp: gateway.captured_at,
        status: 'CAPTURED',
        description: 'Payment captured successfully',
        reference_id: gateway.gateway_payment_id,
      });
    }
  }

  for (const bankRec of bank) {
    events.push({
      system: 'bank',
      timestamp: bankRec.received_at,
      status: 'RECEIVED',
      description: `Settlement received by bank (batch ${bankRec.settlement_batch_id})`,
      reference_id: bankRec.bank_reference_id,
    });

    if (bankRec.processed_at) {
      const statusLabel = bankRec.bank_status === 'SETTLED'
        ? 'SETTLED'
        : bankRec.bank_status === 'REJECTED'
          ? 'REJECTED'
          : bankRec.bank_status === 'PENDING'
            ? 'PENDING'
            : bankRec.bank_status;
      events.push({
        system: 'bank',
        timestamp: bankRec.processed_at,
        status: statusLabel,
        description: `Bank ${bankRec.bank_status.toLowerCase()}: ${bankRec.bank_response_message}`,
        reference_id: bankRec.bank_reference_id,
        error_code: bankRec.bank_status === 'REJECTED' ? bankRec.bank_response_code : undefined,
        failure_reason: bankRec.bank_status === 'REJECTED' ? bankRec.bank_response_message : undefined,
      });
    } else {
      events.push({
        system: 'bank',
        timestamp: bankRec.received_at,
        status: bankRec.bank_status,
        description: `Bank status: ${bankRec.bank_response_message}`,
        reference_id: bankRec.bank_reference_id,
      });
    }
  }

  for (const ledgerRec of ledger) {
    events.push({
      system: 'ledger',
      timestamp: ledgerRec.ledger_created_at,
      status: ledgerRec.ledger_status,
      description: `Ledger entry: ${ledgerRec.ledger_description} (reconciliation: ${ledgerRec.reconciliation_status.toLowerCase()})`,
      reference_id: ledgerRec.ledger_entry_id,
    });
  }

  // Sort chronologically
  events.sort((a, b) => {
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  return events;
}

// ---------- Exception detection ----------

function detectExceptions(bundle: TransactionBundle): ReconciliationException[] {
  const exceptions: ReconciliationException[] = [];
  const { gateway, bank, ledger } = bundle;

  // Missing records
  if (!gateway) {
    exceptions.push({
      type: 'MISSING_GATEWAY',
      severity: 'critical',
      message: 'No gateway record found for this transaction.',
    });
  }

  if (bank.length === 0) {
    // Only flag if gateway succeeded
    if (gateway && gateway.gateway_status !== 'AUTHORIZATION_FAILED') {
      exceptions.push({
        type: 'MISSING_BANK',
        severity: 'critical',
        message: 'No bank settlement record found despite successful gateway authorization.',
      });
    }
  }

  if (ledger.length === 0) {
    if (gateway && gateway.gateway_status !== 'AUTHORIZATION_FAILED') {
      exceptions.push({
        type: 'MISSING_LEDGER',
        severity: 'warning',
        message: 'No ledger record found for this transaction.',
      });
    }
  }

  // Duplicate records
  if (bank.length > 1) {
    exceptions.push({
      type: 'DUPLICATE_RECORD',
      severity: 'warning',
      message: `Found ${bank.length} bank settlement records. Potential duplicate.`,
      details: { system: 'bank', count: bank.length },
    });
  }

  if (ledger.length > 1) {
    exceptions.push({
      type: 'DUPLICATE_RECORD',
      severity: 'warning',
      message: `Found ${ledger.length} ledger entries. Potential duplicate.`,
      details: { system: 'ledger', count: ledger.length },
    });
  }

  // Amount mismatches
  if (gateway && bank.length > 0) {
    const bankRec = bank[0];
    if (Math.abs(gateway.amount - bankRec.amount) > 0.01) {
      exceptions.push({
        type: 'AMOUNT_MISMATCH',
        severity: 'critical',
        message: `Amount mismatch between gateway (${gateway.currency} ${gateway.amount.toFixed(2)}) and bank (${bankRec.currency} ${bankRec.amount.toFixed(2)}).`,
        details: { gateway_amount: gateway.amount, bank_amount: bankRec.amount, difference: Math.abs(gateway.amount - bankRec.amount) },
      });
    }
  }

  if (gateway && ledger.length > 0) {
    const ledgerRec = ledger[0];
    if (Math.abs(gateway.amount - ledgerRec.debit_amount) > 0.01) {
      exceptions.push({
        type: 'AMOUNT_MISMATCH',
        severity: 'warning',
        message: `Amount mismatch between gateway (${gateway.currency} ${gateway.amount.toFixed(2)}) and ledger debit (${ledgerRec.currency} ${ledgerRec.debit_amount.toFixed(2)}).`,
        details: { gateway_amount: gateway.amount, ledger_debit: ledgerRec.debit_amount },
      });
    }
  }

  if (bank.length > 0 && ledger.length > 0) {
    const bankRec = bank[0];
    const ledgerRec = ledger[0];
    if (Math.abs(bankRec.amount - ledgerRec.debit_amount) > 0.01) {
      exceptions.push({
        type: 'AMOUNT_MISMATCH',
        severity: 'warning',
        message: `Amount mismatch between bank (${bankRec.currency} ${bankRec.amount.toFixed(2)}) and ledger debit (${ledgerRec.currency} ${ledgerRec.debit_amount.toFixed(2)}).`,
        details: { bank_amount: bankRec.amount, ledger_debit: ledgerRec.debit_amount },
      });
    }
  }

  // Currency mismatches
  if (gateway && bank.length > 0) {
    if (gateway.currency !== bank[0].currency) {
      exceptions.push({
        type: 'CURRENCY_MISMATCH',
        severity: 'critical',
        message: `Currency mismatch between gateway (${gateway.currency}) and bank (${bank[0].currency}).`,
        details: { gateway_currency: gateway.currency, bank_currency: bank[0].currency },
      });
    }
  }

  if (gateway && ledger.length > 0) {
    if (gateway.currency !== ledger[0].currency) {
      exceptions.push({
        type: 'CURRENCY_MISMATCH',
        severity: 'warning',
        message: `Currency mismatch between gateway (${gateway.currency}) and ledger (${ledger[0].currency}).`,
      });
    }
  }

  // Timestamp conflicts
  if (gateway && bank.length > 0) {
    const bankRec = bank[0];
    const gatewayTime = gateway.captured_at ? new Date(gateway.captured_at).getTime() : null;
    const bankReceivedTime = new Date(bankRec.received_at).getTime();
    if (gatewayTime && bankReceivedTime < gatewayTime) {
      exceptions.push({
        type: 'TIMESTAMP_CONFLICT',
        severity: 'warning',
        message: `Bank received the settlement (${bankRec.received_at}) before the gateway captured the payment (${gateway.captured_at}). This may indicate a data inconsistency.`,
      });
    }
  }

  if (bank.length > 0 && ledger.length > 0) {
    const bankRec = bank[0];
    const ledgerRec = ledger[0];
    const bankProcessedTime = bankRec.processed_at ? new Date(bankRec.processed_at).getTime() : null;
    const ledgerTime = new Date(ledgerRec.ledger_created_at).getTime();
    if (bankProcessedTime && ledgerTime < bankProcessedTime) {
      exceptions.push({
        type: 'TIMESTAMP_CONFLICT',
        severity: 'warning',
        message: `Ledger entry was created (${ledgerRec.ledger_created_at}) before bank processing completed (${bankRec.processed_at}). This may indicate a data inconsistency.`,
      });
    }
  }

  // Unknown statuses
  const knownGatewayStatuses = ['CAPTURED', 'AUTHORIZATION_FAILED', 'AUTHORIZED', 'PENDING', 'VOIDED'];
  const knownBankStatuses = ['SETTLED', 'PENDING', 'REJECTED', 'RECEIVED', 'DELAYED', 'FAILED'];
  const knownLedgerStatuses = ['POSTED', 'PENDING', 'REVERSED', 'FAILED'];

  if (gateway && !knownGatewayStatuses.includes(gateway.gateway_status)) {
    exceptions.push({
      type: 'UNKNOWN_STATUS',
      severity: 'warning',
      message: `Unknown gateway status: "${gateway.gateway_status}"`,
    });
  }

  for (const bankRec of bank) {
    if (!knownBankStatuses.includes(bankRec.bank_status)) {
      exceptions.push({
        type: 'UNKNOWN_STATUS',
        severity: 'warning',
        message: `Unknown bank status: "${bankRec.bank_status}"`,
      });
    }
  }

  for (const ledgerRec of ledger) {
    if (!knownLedgerStatuses.includes(ledgerRec.ledger_status)) {
      exceptions.push({
        type: 'UNKNOWN_STATUS',
        severity: 'warning',
        message: `Unknown ledger status: "${ledgerRec.ledger_status}"`,
      });
    }
  }

  // Reconciliation mismatches
  for (const ledgerRec of ledger) {
    if (ledgerRec.reconciliation_status === 'MISMATCHED') {
      exceptions.push({
        type: 'RECONCILIATION_MISMATCH',
        severity: 'critical',
        message: `Ledger entry ${ledgerRec.ledger_entry_id} has reconciliation status MISMATCHED.`,
      });
    } else if (ledgerRec.reconciliation_status === 'UNRECONCILED') {
      exceptions.push({
        type: 'RECONCILIATION_MISMATCH',
        severity: 'warning',
        message: `Ledger entry ${ledgerRec.ledger_entry_id} is not yet reconciled.`,
      });
    }
  }

  // Insufficient evidence
  if (!gateway && bank.length === 0 && ledger.length === 0) {
    exceptions.push({
      type: 'INSUFFICIENT_EVIDENCE',
      severity: 'critical',
      message: 'No records found in any system. The available records are insufficient to determine the exact cause.',
    });
  } else if (gateway && bank.length === 0 && ledger.length === 0 && gateway.gateway_status === 'CAPTURED') {
    exceptions.push({
      type: 'INSUFFICIENT_EVIDENCE',
      severity: 'critical',
      message: 'Only a gateway record exists. No bank or ledger records are available to trace the settlement.',
    });
  }

  return exceptions;
}

// ---------- Status determination ----------

function determineStatus(bundle: TransactionBundle, exceptions: ReconciliationException[]): SettlementStatus {
  const { gateway, bank, ledger } = bundle;

  // No records at all
  if (!gateway && bank.length === 0 && ledger.length === 0) {
    return 'UNKNOWN';
  }

  // Gateway authorization failure
  if (gateway && gateway.gateway_status === 'AUTHORIZATION_FAILED') {
    return 'FAILED';
  }

  // Bank rejection
  if (bank.some((b) => b.bank_status === 'REJECTED')) {
    return 'REJECTED';
  }

  // Unknown bank status
  if (bank.some((b) => !['SETTLED', 'PENDING', 'REJECTED', 'RECEIVED', 'DELAYED', 'FAILED'].includes(b.bank_status))) {
    return 'UNKNOWN';
  }

  // Bank pending
  if (bank.some((b) => b.bank_status === 'PENDING' || b.bank_status === 'RECEIVED')) {
    return 'PENDING';
  }

  // Bank delay detection: if processed_at is > 4 hours after received_at
  for (const bankRec of bank) {
    if (bankRec.bank_status === 'SETTLED' && bankRec.received_at && bankRec.processed_at) {
      const received = new Date(bankRec.received_at).getTime();
      const processed = new Date(bankRec.processed_at).getTime();
      const diffHours = (processed - received) / (1000 * 60 * 60);
      if (diffHours > 4) {
        return 'DELAYED';
      }
    }
  }

  // Missing records (gateway ok, but bank or ledger missing)
  if (gateway && gateway.gateway_status === 'CAPTURED') {
    if (bank.length === 0 || ledger.length === 0) {
      return 'PARTIALLY_RECORDED';
    }
  }

  // All three present and bank settled
  if (gateway && bank.length > 0 && ledger.length > 0) {
    if (bank[0].bank_status === 'SETTLED') {
      return 'SETTLED';
    }
  }

  // Fallback based on available evidence
  if (bank.length > 0 && bank[0].bank_status === 'SETTLED') {
    return 'SETTLED';
  }

  return 'UNKNOWN';
}

// ---------- Confidence scoring ----------

function calculateConfidence(bundle: TransactionBundle, exceptions: ReconciliationException[]): ConfidenceLevel {
  const criticalCount = exceptions.filter((e) => e.severity === 'critical').length;
  const warningCount = exceptions.filter((e) => e.severity === 'warning').length;
  const hasAllSystems = bundle.gateway !== null && bundle.bank.length > 0 && bundle.ledger.length > 0;

  if (criticalCount > 0 || !hasAllSystems) return 'low';
  if (warningCount > 2) return 'low';
  if (warningCount > 0) return 'medium';
  return 'high';
}

// ---------- Processing duration ----------

function calculateProcessingDuration(bundle: TransactionBundle): number | null {
  const { gateway, bank } = bundle;
  if (!gateway) return null;

  const startTime = new Date(gateway.created_at).getTime();
  if (isNaN(startTime)) return null;

  // End time: bank processed_at > bank received_at > gateway captured_at
  let endTime: number | null = null;
  if (bank.length > 0 && bank[0].processed_at) {
    endTime = new Date(bank[0].processed_at).getTime();
  } else if (bank.length > 0) {
    endTime = new Date(bank[0].received_at).getTime();
  } else if (gateway.captured_at) {
    endTime = new Date(gateway.captured_at).getTime();
  }

  if (endTime === null || isNaN(endTime)) return null;
  return endTime - startTime;
}

// ---------- Deterministic summary ----------

function generateDeterministicSummary(
  bundle: TransactionBundle,
  status: SettlementStatus,
  exceptions: ReconciliationException[],
): string {
  const { gateway, bank, ledger } = bundle;
  const parts: string[] = [];

  if (!gateway && bank.length === 0 && ledger.length === 0) {
    return 'No records were found for this transaction in any system. The available records are insufficient to determine the exact cause.';
  }

  if (gateway) {
    if (gateway.gateway_status === 'AUTHORIZATION_FAILED') {
      parts.push(`The payment of ${gateway.currency} ${gateway.amount.toFixed(2)} was not authorized by the gateway. Reason: ${gateway.failure_message || 'unknown'}.`);
      return parts.join(' ');
    }
    parts.push(`The payment of ${gateway.currency} ${gateway.amount.toFixed(2)} was created on ${new Date(gateway.created_at).toLocaleDateString()} and successfully captured by the gateway.`);
  }

  if (bank.length === 0 && gateway) {
    parts.push('However, no bank settlement record was found. The settlement may not have been initiated or the record is missing.');
  } else if (bank.length > 0) {
    const bankRec = bank[0];
    if (bankRec.bank_status === 'SETTLED') {
      parts.push(`The bank settled the transaction on ${bankRec.settlement_date || 'an unspecified date'}.`);
    } else if (bankRec.bank_status === 'REJECTED') {
      parts.push(`The bank rejected the settlement: ${bankRec.bank_response_message}.`);
    } else if (bankRec.bank_status === 'PENDING' || bankRec.bank_status === 'RECEIVED') {
      parts.push(`The bank has received the settlement but processing is still pending.`);
    } else {
      parts.push(`The bank status is "${bankRec.bank_status}": ${bankRec.bank_response_message}.`);
    }
  }

  if (ledger.length === 0 && gateway && gateway.gateway_status !== 'AUTHORIZATION_FAILED') {
    parts.push('No ledger entry has been created for this transaction.');
  } else if (ledger.length > 0) {
    const ledgerRec = ledger[0];
    if (ledger.length > 1) {
      parts.push(`Warning: ${ledger.length} ledger entries exist (possible duplicate).`);
    }
    if (ledgerRec.reconciliation_status === 'RECONCILED') {
      parts.push('The ledger entry is reconciled.');
    } else if (ledgerRec.reconciliation_status === 'MISMATCHED') {
      parts.push('The ledger entry has a reconciliation mismatch that needs investigation.');
    } else {
      parts.push(`The ledger entry is ${ledgerRec.reconciliation_status.toLowerCase()}.`);
    }
  }

  // Mention key exceptions
  const amountMismatches = exceptions.filter((e) => e.type === 'AMOUNT_MISMATCH');
  const currencyMismatches = exceptions.filter((e) => e.type === 'CURRENCY_MISMATCH');
  const timestampConflicts = exceptions.filter((e) => e.type === 'TIMESTAMP_CONFLICT');

  if (amountMismatches.length > 0) {
    parts.push('Note: Amount discrepancies were detected across systems.');
  }
  if (currencyMismatches.length > 0) {
    parts.push('Note: Currency mismatches were detected across systems.');
  }
  if (timestampConflicts.length > 0) {
    parts.push('Note: Timestamp inconsistencies were detected that may indicate data quality issues.');
  }

  return parts.join(' ');
}

// ---------- Main investigation ----------

export function investigate(transactionId: string): InvestigationResult {
  const bundle = findTransactionBundle(transactionId);
  const exceptions = detectExceptions(bundle);
  const status = determineStatus(bundle, exceptions);
  const confidence = calculateConfidence(bundle, exceptions);
  const timeline = buildTimeline(bundle);
  const summary = generateDeterministicSummary(bundle, status, exceptions);
  const processingDuration = calculateProcessingDuration(bundle);

  const amount = bundle.gateway?.amount ?? (bundle.bank.length > 0 ? bundle.bank[0].amount : null);
  const currency = bundle.gateway?.currency ?? (bundle.bank.length > 0 ? bundle.bank[0].currency : null);
  const settlementDate = bundle.bank.length > 0 ? bundle.bank[0].settlement_date : null;

  return {
    transaction_id: transactionId,
    status,
    confidence,
    summary,
    amount,
    currency,
    settlement_date: settlementDate,
    processing_duration_ms: processingDuration,
    timeline,
    exceptions,
    raw_evidence: bundle,
    explanation: null, // Will be filled by AI service if available
  };
}

export function investigateMultiple(transactionIds: string[]): InvestigationResult[] {
  return transactionIds.map((id) => investigate(id));
}
