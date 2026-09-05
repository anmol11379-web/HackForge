// ============================================================
// Automated Reconciliation Tests
// ============================================================
// Run with: cd server && npm test

import { investigate, findTransactionsByDate } from '../server/src/reconciliation/engine.js';
import { parseQuestion } from '../server/src/reconciliation/questionParser.js';
import { generateFallbackExplanation } from '../server/src/ai/fallback.js';
import { getDataStore } from '../server/src/parsers/csvParser.js';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
    errors.push(testName);
  }
}

function section(name: string) {
  console.log(`\n═══ ${name} ═══`);
}

// Pre-load data
getDataStore(true);

// ──────────────────────────────────────────────────────
section('1. CSV Parsing');
{
  const store = getDataStore();
  assert(store.gateway.length >= 1000, `Loaded at least 1000 gateway records (found ${store.gateway.length})`);
  assert(store.bank.length >= 1000, `Loaded at least 1000 bank records (found ${store.bank.length})`);
  assert(store.ledger.length >= 1000, `Loaded at least 1000 ledger records (found ${store.ledger.length})`);
}

// ──────────────────────────────────────────────────────
section('2. TXN1001 — Fully Settled');
{
  const result = investigate('TXN1001');
  assert(result.status === 'SETTLED', 'Status is SETTLED', result.status);
  assert(result.confidence === 'high', 'Confidence is high', result.confidence);
  assert(result.exceptions.length === 0, 'No exceptions', `${result.exceptions.length} exceptions`);
  assert(result.amount === 250, 'Amount is 250', `${result.amount}`);
  assert(result.currency === 'USD', 'Currency is USD', result.currency ?? '');
  assert(result.timeline.length === 6, 'Timeline has 6 events', `${result.timeline.length}`);
}

// ──────────────────────────────────────────────────────
section('3. TXN1002 — Delayed Bank Settlement');
{
  const result = investigate('TXN1002');
  assert(result.status === 'DELAYED', 'Status is DELAYED', result.status);
  assert(result.amount === 1500.75, 'Amount is 1500.75', `${result.amount}`);
  assert(result.timeline.length > 0, 'Has timeline events');
}

// ──────────────────────────────────────────────────────
section('4. TXN1003 — Gateway Authorization Failure');
{
  const result = investigate('TXN1003');
  assert(result.status === 'FAILED', 'Status is FAILED', result.status);
  assert(result.raw_evidence.gateway !== null, 'Has gateway record');
  assert(result.raw_evidence.bank.length === 0, 'No bank records');
  assert(result.raw_evidence.ledger.length === 0, 'No ledger records');
  assert(result.raw_evidence.gateway?.failure_code === 'AUTH_DECLINED', 'Failure code is AUTH_DECLINED');
}

// ──────────────────────────────────────────────────────
section('5. TXN1004 — Bank Rejection');
{
  const result = investigate('TXN1004');
  assert(result.status === 'REJECTED', 'Status is REJECTED', result.status);
  assert(result.raw_evidence.bank.length > 0, 'Has bank record');
  assert(result.raw_evidence.bank[0].bank_status === 'REJECTED', 'Bank status is REJECTED');
}

// ──────────────────────────────────────────────────────
section('6. TXN1005 — Missing Bank Record');
{
  const result = investigate('TXN1005');
  assert(result.status === 'PARTIALLY_RECORDED', 'Status is PARTIALLY_RECORDED', result.status);
  assert(result.raw_evidence.bank.length === 0, 'No bank records');
  assert(result.exceptions.some(e => e.type === 'MISSING_BANK'), 'Has MISSING_BANK exception');
}

// ──────────────────────────────────────────────────────
section('7. TXN1006 — Missing Ledger Record');
{
  const result = investigate('TXN1006');
  assert(result.status === 'PARTIALLY_RECORDED', 'Status is PARTIALLY_RECORDED', result.status);
  assert(result.raw_evidence.ledger.length === 0, 'No ledger records');
  assert(result.exceptions.some(e => e.type === 'MISSING_LEDGER'), 'Has MISSING_LEDGER exception');
}

// ──────────────────────────────────────────────────────
section('8. TXN1007 — Amount Mismatch');
{
  const result = investigate('TXN1007');
  assert(result.exceptions.some(e => e.type === 'AMOUNT_MISMATCH'), 'Has AMOUNT_MISMATCH exception');
  // Gateway: 600, Bank: 585
  assert(result.raw_evidence.gateway?.amount === 600, 'Gateway amount is 600');
  assert(result.raw_evidence.bank[0]?.amount === 585, 'Bank amount is 585');
}

// ──────────────────────────────────────────────────────
section('9. TXN1008 — Currency Mismatch');
{
  const result = investigate('TXN1008');
  assert(result.exceptions.some(e => e.type === 'CURRENCY_MISMATCH'), 'Has CURRENCY_MISMATCH exception');
  // Gateway: USD, Bank: EUR
  assert(result.raw_evidence.gateway?.currency === 'USD', 'Gateway currency is USD');
  assert(result.raw_evidence.bank[0]?.currency === 'EUR', 'Bank currency is EUR');
}

// ──────────────────────────────────────────────────────
section('10. TXN1009 — Duplicate Ledger Record');
{
  const result = investigate('TXN1009');
  assert(result.raw_evidence.ledger.length === 2, 'Has 2 ledger records', `${result.raw_evidence.ledger.length}`);
  assert(result.exceptions.some(e => e.type === 'DUPLICATE_RECORD'), 'Has DUPLICATE_RECORD exception');
}

// ──────────────────────────────────────────────────────
section('11. TXN1010 — Timestamp Inconsistency');
{
  const result = investigate('TXN1010');
  assert(result.exceptions.some(e => e.type === 'TIMESTAMP_CONFLICT'), 'Has TIMESTAMP_CONFLICT exception');
}

// ──────────────────────────────────────────────────────
section('12. TXN1011 — Pending Settlement');
{
  const result = investigate('TXN1011');
  assert(result.status === 'PENDING', 'Status is PENDING', result.status);
}

// ──────────────────────────────────────────────────────
section('13. TXN1012 — Fully Reconciled');
{
  const result = investigate('TXN1012');
  assert(result.status === 'SETTLED', 'Status is SETTLED', result.status);
  assert(result.confidence === 'high', 'Confidence is high', result.confidence);
  assert(result.exceptions.length === 0, 'No exceptions', `${result.exceptions.length}`);
}

// ──────────────────────────────────────────────────────
section('14. TXN1013 — Unknown Bank Status');
{
  const result = investigate('TXN1013');
  assert(result.status === 'UNKNOWN', 'Status is UNKNOWN', result.status);
  assert(result.exceptions.some(e => e.type === 'UNKNOWN_STATUS'), 'Has UNKNOWN_STATUS exception');
}

// ──────────────────────────────────────────────────────
section('15. TXN1014 — Insufficient Evidence');
{
  const result = investigate('TXN1014');
  assert(result.status === 'PARTIALLY_RECORDED', 'Status is PARTIALLY_RECORDED', result.status);
  assert(result.raw_evidence.bank.length === 0, 'No bank records');
  assert(result.raw_evidence.ledger.length === 0, 'No ledger records');
  assert(result.exceptions.some(e => e.type === 'INSUFFICIENT_EVIDENCE'), 'Has INSUFFICIENT_EVIDENCE exception');
}

// ──────────────────────────────────────────────────────
section('16. Unknown Transaction');
{
  const result = investigate('TXN9999');
  assert(result.status === 'UNKNOWN', 'Status is UNKNOWN', result.status);
  assert(result.raw_evidence.gateway === null, 'No gateway record');
  assert(result.raw_evidence.bank.length === 0, 'No bank records');
  assert(result.raw_evidence.ledger.length === 0, 'No ledger records');
}

// ──────────────────────────────────────────────────────
section('17. Date-Based Search');
{
  const txnIds = findTransactionsByDate('2026-08-25');
  assert(txnIds.length >= 4, 'Found 4+ transactions on 2026-08-25', `${txnIds.length}`);
  assert(txnIds.includes('TXN1019'), 'Includes TXN1019');
  assert(txnIds.includes('TXN1020'), 'Includes TXN1020');
}

// ──────────────────────────────────────────────────────
section('18. Natural-Language Question Parsing');
{
  const q1 = parseQuestion('Why was TXN1001 delayed?');
  assert(q1.transaction_id === 'TXN1001', 'Extracts TXN1001', q1.transaction_id ?? '');
  assert(q1.intent === 'failure_reason', 'Intent is failure_reason', q1.intent);

  const q2 = parseQuestion('Show the settlement trail for TXN1002');
  assert(q2.transaction_id === 'TXN1002', 'Extracts TXN1002', q2.transaction_id ?? '');
  assert(q2.intent === 'trail', 'Intent is trail', q2.intent);

  const q3 = parseQuestion('Find failed settlements on 2026-08-25');
  assert(q3.date === '2026-08-25', 'Extracts date 2026-08-25', q3.date ?? '');
  assert(q3.intent === 'search', 'Intent is search', q3.intent);

  const q4 = parseQuestion('What is the status of TXN1005?');
  assert(q4.transaction_id === 'TXN1005', 'Extracts TXN1005', q4.transaction_id ?? '');
  assert(q4.intent === 'status', 'Intent is status', q4.intent);
}

// ──────────────────────────────────────────────────────
section('19. AI Fallback Mode');
{
  const result = investigate('TXN1001');
  const explanation = generateFallbackExplanation(result);
  assert(typeof explanation.summary === 'string' && explanation.summary.length > 0, 'Has summary');
  assert(explanation.status === 'SETTLED', 'Status matches', explanation.status);
  assert(explanation.confidence === 'high', 'Confidence matches', explanation.confidence);
  assert(explanation.timeline_explanation.length > 0, 'Has timeline explanation');
  assert(explanation.recommended_action.length > 0, 'Has recommended action');
}

// ──────────────────────────────────────────────────────
section('20. TXN1018 — Ledger Reconciliation Mismatch');
{
  const result = investigate('TXN1018');
  assert(result.exceptions.some(e => e.type === 'RECONCILIATION_MISMATCH'), 'Has RECONCILIATION_MISMATCH exception');
  assert(result.exceptions.some(e => e.type === 'AMOUNT_MISMATCH'), 'Has AMOUNT_MISMATCH exception');
}

// ──────────────────────────────────────────────────────
section('21. Typo Tolerance and Multi-Identifier Resolution');
{
  const qGP = parseQuestion('what happened to GP-101001?');
  assert(qGP.transaction_id === 'TXN1001', 'Resolves GP-101001 to TXN1001', qGP.transaction_id ?? '');

  const qTypoTxn = parseQuestion('y was txn 1001 delayed?');
  assert(qTypoTxn.transaction_id === 'TXN1001', 'Resolves "txn 1001" typo to TXN1001', qTypoTxn.transaction_id ?? '');

  const qNum = parseQuestion('check 1002');
  assert(qNum.transaction_id === 'TXN1002', 'Resolves standalone number 1002 to TXN1002', qNum.transaction_id ?? '');

  const qBnk = parseQuestion('status of bnk-201001');
  assert(qBnk.transaction_id === 'TXN1001', 'Resolves bank ref BNK-201001 to TXN1001', qBnk.transaction_id ?? '');
}

// ──────────────────────────────────────────────────────
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`  Failed tests:`);
  errors.forEach(e => console.log(`    - ${e}`));
}
console.log('════════════════════════════════════════\n');
process.exit(failed > 0 ? 1 : 0);
