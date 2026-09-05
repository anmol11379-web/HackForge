import { readFileSync, writeFileSync, existsSync, watch } from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';
import type { GatewayRecord, BankRecord, LedgerRecord } from '../types/index.js';

// ---------- Helpers ----------

function toNumber(val: string | undefined | null): number {
  if (val === undefined || val === null || val === '') return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function toNullableString(val: string | undefined | null): string | null {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val.trim();
}

function toISOTimestamp(val: string | undefined | null): string | null {
  if (!val || val.trim() === '') return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? val.trim() : d.toISOString();
}

// ---------- Data directory ----------

const DATA_DIR = path.resolve(__dirname, '../../../data');

// ---------- Generic CSV loader ----------

function loadCSV<T>(filename: string, transform: (row: Record<string, string>) => T): T[] {
  const filePath = path.join(DATA_DIR, filename);
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`[CSV Parser] Failed to read ${filePath}:`, (err as Error).message);
    return [];
  }

  let records: Record<string, string>[];
  try {
    records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    console.error(`[CSV Parser] Failed to parse ${filename}:`, (err as Error).message);
    return [];
  }

  const results: T[] = [];
  for (let i = 0; i < records.length; i++) {
    try {
      results.push(transform(records[i]));
    } catch (err) {
      console.warn(`[CSV Parser] Skipping malformed row ${i + 1} in ${filename}:`, (err as Error).message);
    }
  }
  return results;
}

// ---------- Gateway records ----------

export function loadGatewayRecords(): GatewayRecord[] {
  return loadCSV<GatewayRecord>('gateway_records.csv', (row) => ({
    transaction_id: row.transaction_id?.trim() || '',
    gateway_payment_id: row.gateway_payment_id?.trim() || '',
    merchant_id: row.merchant_id?.trim() || '',
    amount: toNumber(row.amount),
    currency: (row.currency || '').toUpperCase().trim(),
    created_at: toISOTimestamp(row.created_at) || '',
    authorized_at: toISOTimestamp(row.authorized_at),
    captured_at: toISOTimestamp(row.captured_at),
    gateway_status: (row.gateway_status || '').toUpperCase().trim(),
    payment_method: row.payment_method?.trim() || '',
    failure_code: toNullableString(row.failure_code),
    failure_message: toNullableString(row.failure_message),
  }));
}

// ---------- Bank records ----------

export function loadBankRecords(): BankRecord[] {
  return loadCSV<BankRecord>('bank_settlement_records.csv', (row) => ({
    transaction_id: row.transaction_id?.trim() || '',
    bank_reference_id: row.bank_reference_id?.trim() || '',
    settlement_batch_id: row.settlement_batch_id?.trim() || '',
    amount: toNumber(row.amount),
    currency: (row.currency || '').toUpperCase().trim(),
    received_at: toISOTimestamp(row.received_at) || '',
    processed_at: toISOTimestamp(row.processed_at),
    bank_status: (row.bank_status || '').toUpperCase().trim(),
    bank_response_code: row.bank_response_code?.trim() || '',
    bank_response_message: row.bank_response_message?.trim() || '',
    settlement_date: toNullableString(row.settlement_date),
  }));
}

// ---------- Ledger records ----------

export function loadLedgerRecords(): LedgerRecord[] {
  return loadCSV<LedgerRecord>('ledger_records.csv', (row) => ({
    transaction_id: row.transaction_id?.trim() || '',
    ledger_entry_id: row.ledger_entry_id?.trim() || '',
    account_id: row.account_id?.trim() || '',
    debit_amount: toNumber(row.debit_amount),
    credit_amount: toNumber(row.credit_amount),
    currency: (row.currency || '').toUpperCase().trim(),
    ledger_created_at: toISOTimestamp(row.ledger_created_at) || '',
    ledger_status: (row.ledger_status || '').toUpperCase().trim(),
    reconciliation_status: (row.reconciliation_status || '').toUpperCase().trim(),
    ledger_description: row.ledger_description?.trim() || '',
  }));
}

// ---------- Combined data store ----------

export interface DataStore {
  gateway: GatewayRecord[];
  bank: BankRecord[];
  ledger: LedgerRecord[];
}

let cachedStore: DataStore | null = null;
let lastReloadedAt: string = new Date().toISOString();
let isWatching = false;

export function getDataStore(forceReload = false): DataStore {
  if (cachedStore && !forceReload) return cachedStore;
  cachedStore = {
    gateway: loadGatewayRecords(),
    bank: loadBankRecords(),
    ledger: loadLedgerRecords(),
  };
  lastReloadedAt = new Date().toISOString();
  console.log(
    `[CSV Parser] Loaded ${cachedStore.gateway.length} gateway, ` +
    `${cachedStore.bank.length} bank, ${cachedStore.ledger.length} ledger records`
  );
  return cachedStore;
}

export function reloadDataStore(): { store: DataStore; stats: DataStats } {
  const store = getDataStore(true);
  return { store, stats: getDataStats() };
}

export interface DataStats {
  gatewayCount: number;
  bankCount: number;
  ledgerCount: number;
  uniqueTransactions: number;
  lastReloadedAt: string;
}

export function getDataStats(): DataStats {
  const store = getDataStore();
  const ids = new Set<string>();
  store.gateway.forEach((r) => ids.add(r.transaction_id));
  store.bank.forEach((r) => ids.add(r.transaction_id));
  store.ledger.forEach((r) => ids.add(r.transaction_id));

  return {
    gatewayCount: store.gateway.length,
    bankCount: store.bank.length,
    ledgerCount: store.ledger.length,
    uniqueTransactions: ids.size,
    lastReloadedAt,
  };
}

// ---------- CSV Ingestion & Validation ----------

export type SystemType = 'gateway' | 'bank' | 'ledger';

const SYSTEM_FILENAME_MAP: Record<SystemType, string> = {
  gateway: 'gateway_records.csv',
  bank: 'bank_settlement_records.csv',
  ledger: 'ledger_records.csv',
};

const REQUIRED_HEADERS: Record<SystemType, string[]> = {
  gateway: ['transaction_id', 'amount', 'currency', 'gateway_status'],
  bank: ['transaction_id', 'amount', 'currency', 'bank_status'],
  ledger: ['transaction_id', 'currency', 'ledger_status'],
};

export function validateCsvContent(
  system: SystemType,
  csvContent: string
): { valid: boolean; error?: string; rowCount: number; headers: string[] } {
  if (!csvContent || csvContent.trim() === '') {
    return { valid: false, error: 'CSV content is empty.', rowCount: 0, headers: [] };
  }

  let records: Record<string, string>[];
  try {
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    return {
      valid: false,
      error: `Invalid CSV syntax: ${(err as Error).message}`,
      rowCount: 0,
      headers: [],
    };
  }

  if (records.length === 0) {
    return { valid: false, error: 'CSV has no data rows.', rowCount: 0, headers: [] };
  }

  const headers = Object.keys(records[0]).map((h) => h.trim().toLowerCase());
  const required = REQUIRED_HEADERS[system];
  const missing = required.filter((r) => !headers.includes(r));

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required columns for ${system} records: ${missing.join(', ')}. Found: ${headers.join(', ')}`,
      rowCount: records.length,
      headers,
    };
  }

  return { valid: true, rowCount: records.length, headers };
}

export function saveCsvContent(
  system: SystemType,
  csvContent: string,
  mode: 'append' | 'replace' = 'append'
): { success: boolean; rowCount: number; error?: string } {
  const validation = validateCsvContent(system, csvContent);
  if (!validation.valid) {
    return { success: false, rowCount: 0, error: validation.error };
  }

  const filename = SYSTEM_FILENAME_MAP[system];
  const filePath = path.join(DATA_DIR, filename);

  try {
    if (mode === 'replace' || !existsSync(filePath)) {
      writeFileSync(filePath, csvContent.trim() + '\n', 'utf-8');
    } else {
      // Append mode: parse incoming and append rows without repeating the header
      const existingContent = readFileSync(filePath, 'utf-8');
      const lines = csvContent.trim().split(/\r?\n/);
      // Skip header line if existing file has content
      const rowsToAppend = lines.length > 1 ? lines.slice(1).join('\n') : '';
      if (rowsToAppend) {
        const separator = existingContent.endsWith('\n') ? '' : '\n';
        writeFileSync(filePath, existingContent + separator + rowsToAppend + '\n', 'utf-8');
      }
    }

    // Force reload cache
    getDataStore(true);
    return { success: true, rowCount: validation.rowCount };
  } catch (err) {
    return {
      success: false,
      rowCount: 0,
      error: `Failed to save CSV file: ${(err as Error).message}`,
    };
  }
}

// ---------- Auto-Reload File Watcher ----------

export function startCsvWatcher() {
  if (isWatching) return;
  isWatching = true;

  try {
    let debounceTimer: NodeJS.Timeout | null = null;
    watch(DATA_DIR, (eventType, filename) => {
      if (filename && filename.endsWith('.csv')) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          console.log(`[CSV Watcher] File change detected (${filename}, ${eventType}). Reloading data store...`);
          getDataStore(true);
        }, 300);
      }
    });
    console.log(`[CSV Watcher] Watching ${DATA_DIR} for changes.`);
  } catch (err) {
    console.warn('[CSV Watcher] Could not start directory watcher:', (err as Error).message);
  }
}
