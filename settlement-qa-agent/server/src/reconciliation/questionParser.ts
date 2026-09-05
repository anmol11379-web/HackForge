// ============================================================
// Question Parser
// ============================================================
// Extracts transaction IDs, dates, and intent from natural language,
// supporting Payment IDs (GP-...), Bank Refs (BNK-...), Ledger Entry IDs (LED-...),
// typos, spacing variations, and fuzzy matching.

import { getDataStore } from '../parsers/csvParser.js';

export interface ParsedQuestion {
  transaction_id: string | null;
  date: string | null;
  intent: 'status' | 'failure_reason' | 'delay' | 'trail' | 'search' | 'general';
  original_question: string;
  matched_by?: string;
}

// Extract TXN IDs like TXN1001, TXN-1001, txn1001, TNX1001, TX1001, etc.
const TXN_PATTERN = /\b(?:TXN|TNX|TXM|TZN|TX)[-_ ]*(\d{3,})\b/i;

// Extract dates like 2026-08-25, 2026/08/25, August 25 2026, 25-08-2026
const ISO_DATE_PATTERN = /\b(\d{4}[-/]\d{2}[-/]\d{2})\b/;
const DMY_DATE_PATTERN = /\b(\d{2}[-/]\d{2}[-/]\d{4})\b/;
const NATURAL_DATE_PATTERN = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/i;

// Intent keywords with typo tolerance and common variations
const INTENT_KEYWORDS: Record<string, string[]> = {
  status: ['status', 'ststus', 'stats', 'current', 'state', 'what is', 'wat is', 'check', 'what happened', 'wat happened', 'wat hapend', 'wut hapnd'],
  failure_reason: ['why', 'y', 'fail', 'faild', 'fal', 'failing', 'reject', 'rejct', 'rejected', 'error', 'err', 'reason', 'cause', 'problem', 'problm', 'issue'],
  delay: ['delay', 'dlay', 'delayed', 'slow', 'late', 'behind', 'pending', 'wait', 'stuck', 'inconsistenc', 'held'],
  trail: ['trail', 'trace', 'trce', 'show', 'timeline', 'history', 'path', 'journey', 'flow'],
  search: ['find', 'fnd', 'search', 'list', 'all', 'transactions on', 'settlements on'],
};

export function resolveIdentifierToTxn(cleaned: string): { transaction_id: string | null; matched_by?: string } {
  // 1. Direct TXN pattern match: TXN1001, TXN-1001, txn 1001, tx1001, tnx1001
  const directTxn = cleaned.match(TXN_PATTERN);
  if (directTxn) {
    return {
      transaction_id: `TXN${directTxn[1]}`,
      matched_by: 'direct_txn',
    };
  }

  let store;
  try {
    store = getDataStore();
  } catch {
    return { transaction_id: null };
  }

  if (!store || (!store.gateway?.length && !store.bank?.length && !store.ledger?.length)) {
    return { transaction_id: null };
  }

  // 2. Payment ID: GP-101001, GP101001, GP 101001
  const gpMatch = cleaned.match(/\b(?:GP)[-_ ]*(\d{4,})\b/i);
  if (gpMatch) {
    const targetNorm = `GP-${gpMatch[1]}`.toUpperCase();
    const targetPlain = `GP${gpMatch[1]}`.toUpperCase();
    const g = store.gateway.find(r => 
      r.gateway_payment_id?.toUpperCase() === targetNorm || 
      r.gateway_payment_id?.replace(/[-_ ]/g, '').toUpperCase() === targetPlain
    );
    if (g) {
      return { transaction_id: g.transaction_id, matched_by: 'gateway_payment_id' };
    }
  }

  // 3. Bank Reference: BNK-201001, BNK 201001, BNK201001, BR-201001
  const bnkMatch = cleaned.match(/\b(?:BNK|BR|BP)[-_ ]*(\d{4,})\b/i);
  if (bnkMatch) {
    const targetNorm = `BNK-${bnkMatch[1]}`.toUpperCase();
    const targetPlain = `BNK${bnkMatch[1]}`.toUpperCase();
    const b = store.bank.find(r => 
      r.bank_reference_id?.toUpperCase() === targetNorm || 
      r.bank_reference_id?.replace(/[-_ ]/g, '').toUpperCase() === targetPlain
    );
    if (b) {
      return { transaction_id: b.transaction_id, matched_by: 'bank_reference_id' };
    }
  }

  // 4. Ledger Entry: LED-401001, LED 401001, LED401001
  const ledMatch = cleaned.match(/\b(?:LED|LE)[-_ ]*(\d{4,})\b/i);
  if (ledMatch) {
    const targetNorm = `LED-${ledMatch[1]}`.toUpperCase();
    const targetPlain = `LED${ledMatch[1]}`.toUpperCase();
    const l = store.ledger.find(r => 
      r.ledger_entry_id?.toUpperCase() === targetNorm || 
      r.ledger_entry_id?.replace(/[-_ ]/g, '').toUpperCase() === targetPlain
    );
    if (l) {
      return { transaction_id: l.transaction_id, matched_by: 'ledger_entry_id' };
    }
  }

  // 5. Batch ID: BATCH-301
  const batchMatch = cleaned.match(/\b(?:BATCH)[-_ ]*(\d+)\b/i);
  if (batchMatch) {
    const targetNorm = `BATCH-${batchMatch[1]}`.toUpperCase();
    const b = store.bank.find(r => r.settlement_batch_id?.toUpperCase() === targetNorm);
    if (b) {
      return { transaction_id: b.transaction_id, matched_by: 'batch_id' };
    }
  }

  // 6. Standalone 4 to 6 digit numbers (e.g. "what happened to 101001?" or "status 1001")
  // Exclude dates like 2026-08-25 so the year 2026 is not misidentified as TXN2026
  const withoutDates = cleaned
    .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g, ' ');

  const numbers = withoutDates.match(/\b(\d{4,6})\b/g);
  if (numbers) {
    for (const num of numbers) {
      if (num.length === 4) {
        const asTxn = `TXN${num}`;
        if (
          store.gateway.some(r => r.transaction_id === asTxn) ||
          store.bank.some(r => r.transaction_id === asTxn) ||
          store.ledger.some(r => r.transaction_id === asTxn)
        ) {
          return { transaction_id: asTxn, matched_by: 'numeric_txn' };
        }
      }
      if (num.length === 6) {
        const asGP = `GP-${num}`;
        const g = store.gateway.find(r => r.gateway_payment_id === asGP);
        if (g) return { transaction_id: g.transaction_id, matched_by: 'numeric_payment_id' };

        const asBNK = `BNK-${num}`;
        const b = store.bank.find(r => r.bank_reference_id === asBNK);
        if (b) return { transaction_id: b.transaction_id, matched_by: 'numeric_bank_ref' };

        const asLED = `LED-${num}`;
        const l = store.ledger.find(r => r.ledger_entry_id === asLED);
        if (l) return { transaction_id: l.transaction_id, matched_by: 'numeric_ledger_id' };
      }
    }
  }

  // 7. Token substring match for IDs with digits like GP-101001 or ORD-7001
  const tokens = cleaned.split(/[\s,?!]+/);
  for (const token of tokens) {
    if (token.length >= 5 && /\d/.test(token)) {
      const upper = token.toUpperCase();
      const g = store.gateway.find(r => r.gateway_payment_id?.toUpperCase().includes(upper));
      if (g) return { transaction_id: g.transaction_id, matched_by: 'token_payment_id' };
      const b = store.bank.find(r => r.bank_reference_id?.toUpperCase().includes(upper));
      if (b) return { transaction_id: b.transaction_id, matched_by: 'token_bank_ref' };
      const l = store.ledger.find(r => 
        r.ledger_entry_id?.toUpperCase().includes(upper) || 
        r.ledger_description?.toUpperCase().includes(upper)
      );
      if (l) return { transaction_id: l.transaction_id, matched_by: 'token_ledger' };
    }
  }

  return { transaction_id: null };
}

export function parseQuestion(question: string): ParsedQuestion {
  const cleaned = question.trim();
  const result: ParsedQuestion = {
    transaction_id: null,
    date: null,
    intent: 'general',
    original_question: cleaned,
  };

  // Extract transaction ID with full cross-reference & typo tolerance
  const resolved = resolveIdentifierToTxn(cleaned);
  if (resolved.transaction_id) {
    result.transaction_id = resolved.transaction_id;
    result.matched_by = resolved.matched_by;
  }

  // Extract date
  const isoDateMatch = cleaned.match(ISO_DATE_PATTERN);
  if (isoDateMatch) {
    result.date = isoDateMatch[1].replace(/\//g, '-');
  } else {
    const dmyDateMatch = cleaned.match(DMY_DATE_PATTERN);
    if (dmyDateMatch) {
      const parts = dmyDateMatch[1].split(/[-/]/);
      result.date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else {
      const naturalDateMatch = cleaned.match(NATURAL_DATE_PATTERN);
      if (naturalDateMatch) {
        const parsed = new Date(naturalDateMatch[1]);
        if (!isNaN(parsed.getTime())) {
          result.date = parsed.toISOString().split('T')[0];
        }
      }
    }
  }

  // Determine intent
  const lowerQuestion = cleaned.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lowerQuestion.includes(kw))) {
      result.intent = intent as ParsedQuestion['intent'];
      break;
    }
  }

  // If we have a date but no transaction ID, it's likely a search
  if (result.date && !result.transaction_id) {
    result.intent = 'search';
  }

  return result;
}
