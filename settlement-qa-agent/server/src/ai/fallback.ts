// ============================================================
// Deterministic Fallback Explanation Generator
// ============================================================
// Produces structured explanations when no AI API is available.
// This is ALWAYS the source of truth — AI only rephrases.

import type { InvestigationResult, AIExplanation } from '../types/index.js';

export function generateFallbackExplanation(result: InvestigationResult): AIExplanation {
  const { status, timeline, exceptions, summary, raw_evidence } = result;
  const { gateway, bank, ledger } = raw_evidence;

  // Build timeline explanation
  const timelineExplanation: string[] = [];
  for (const event of timeline) {
    const time = event.timestamp
      ? new Date(event.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : 'unknown time';
    const system = event.system.charAt(0).toUpperCase() + event.system.slice(1);
    timelineExplanation.push(`${system}: ${event.description} (at ${time})`);
  }

  // Build reason
  let reason = '';
  switch (status) {
    case 'SETTLED':
      reason = 'The transaction was successfully processed through all systems.';
      break;
    case 'DELAYED':
      if (bank.length > 0 && bank[0].processed_at && bank[0].received_at) {
        const delayMs = new Date(bank[0].processed_at).getTime() - new Date(bank[0].received_at).getTime();
        const delayHours = Math.round(delayMs / (1000 * 60 * 60) * 10) / 10;
        reason = `The bank took ${delayHours} hours to process the settlement after receiving it. This is likely due to the settlement being received after the batch processing cutoff.`;
      } else {
        reason = 'The settlement processing took longer than expected.';
      }
      break;
    case 'FAILED':
      if (gateway?.failure_message) {
        reason = `The transaction failed at the gateway: ${gateway.failure_message}.`;
      } else {
        reason = 'The transaction failed during processing.';
      }
      break;
    case 'REJECTED':
      if (bank.length > 0) {
        reason = `The bank rejected the settlement: ${bank[0].bank_response_message}.`;
      } else {
        reason = 'The settlement was rejected.';
      }
      break;
    case 'PENDING':
      reason = 'The settlement is currently being processed and has not yet completed.';
      break;
    case 'PARTIALLY_RECORDED':
      const missing: string[] = [];
      if (bank.length === 0) missing.push('bank settlement');
      if (ledger.length === 0) missing.push('ledger entry');
      reason = `The transaction is missing ${missing.join(' and ')} records. The settlement trail is incomplete.`;
      break;
    case 'UNKNOWN':
    default:
      reason = 'The available records are insufficient to determine the exact cause or current state.';
      break;
  }

  // Build exception messages
  const exceptionMessages = exceptions.map((e) => e.message);

  // Recommended action
  let recommendedAction = '';
  switch (status) {
    case 'SETTLED':
      if (exceptions.length > 0) {
        recommendedAction = 'Review the flagged exceptions to ensure data consistency.';
      } else {
        recommendedAction = 'No action required. Transaction is fully settled.';
      }
      break;
    case 'DELAYED':
      recommendedAction = 'Check the bank settlement batch timing and processing cutoff rules.';
      break;
    case 'FAILED':
      recommendedAction = 'Contact the payment method issuer or review the failure code for more details.';
      break;
    case 'REJECTED':
      recommendedAction = 'Contact the bank to understand the rejection reason and determine if the settlement can be retried.';
      break;
    case 'PENDING':
      recommendedAction = 'Wait for bank processing to complete. Follow up if it remains pending beyond the expected settlement window.';
      break;
    case 'PARTIALLY_RECORDED':
      recommendedAction = 'Investigate why records are missing from some systems. Check system connectivity and batch processing logs.';
      break;
    default:
      recommendedAction = 'Escalate to the operations team for manual investigation.';
      break;
  }

  // Confidence
  const confidence = result.confidence;

  return {
    summary,
    status,
    reason,
    timeline_explanation: timelineExplanation,
    exceptions: exceptionMessages.length > 0 ? exceptionMessages : ['No known exceptions were found.'],
    confidence,
    recommended_action: recommendedAction,
  };
}

export function generateFallbackGeneralAnswer(
  question: string,
  totalGateway = 1100,
  totalBank = 1058,
  totalLedger = 1048,
): string {
  const q = question.toLowerCase().trim();

  // 1. Who can use this AI / Target audience
  if (
    /\b(who\s+(can\s+)?use|who\s+is\s+(this|it)\s+for|target\s+audience|who\s+should\s+use|who\s+needs)\b/i.test(q) ||
    (q.includes('who') && (q.includes('use') || q.includes('for') || q.includes('audience') || q.includes('fintech')))
  ) {
    return `### 👥 Who Can Use Fintech AI?

Fintech AI is built for anyone involved in payment processing, operations, customer support, or financial reconciliation:

- **Customer Support Teams:** Instantly answer customer and merchant queries about why a charge failed, was delayed, or when money will arrive, without waiting on backend engineering.
- **Settlement Operations (SettlementOps):** Monitor end-to-end clearing pipelines, track bank holiday queues, and ensure settlement batches execute on time.
- **Finance & Accounting Teams:** Verify 3-way matching across Payment Gateways, Banks, and Internal General Ledgers to guarantee every penny is accounted for with zero financial leakage.
- **Risk & Compliance Officers:** Quickly review transactions flagged for AML clearance, high fraud risk, or reserve review holds.
- **Merchants & Business Owners:** Get clear, plain-English explanations of their payout status and concrete next steps to resolve stuck funds.
- **Non-Technical Users & Executives:** No SQL, accounting background, or coding skills required. You can ask questions in everyday human language!`;
  }

  // 2. What is AI / How does AI work
  if (
    /\b(what\s+is\s+ai|what\s+is\s+artificial\s+intelligence|define\s+ai|meaning\s+of\s+ai|how\s+does\s+ai\s+work|what\s+is\s+an\s+ai\s+agent)\b/i.test(q) ||
    (/\bwhat\b/i.test(q) && /\bai\b/i.test(q) && !q.includes('txn') && !q.includes('pay_'))
  ) {
    return `### 🤖 What is AI (Artificial Intelligence)?

**Artificial Intelligence (AI)** refers to advanced computer systems designed to perform tasks that traditionally require human intelligence—such as understanding everyday language, recognizing complex patterns, cross-referencing vast datasets, and reasoning through problems.

### 💡 How AI is Applied in This Settlement Agent:
1. **Autonomous 3-Way Cross-Referencing:** In milliseconds, the agent analyzes and correlates records across three separate silos: **Payment Gateway**, **Bank Statements**, and **Accounting Ledgers**.
2. **Plain-English Translation:** Instead of cryptic banking error codes (like \`BAD_REQUEST_DECLINED\`, \`503_GW_TIMEOUT\`, or \`IFSC_INVALID\`), the AI gives straightforward explanations that anyone can understand.
3. **Honest Exception Detection:** Flags data mismatches, missing ledger records, and status conflicts with confidence scores so operations teams only intervene when human review is truly needed.
4. **Actionable Recommendations:** Gives merchants and support personnel concrete next steps (e.g. updating bank details, waiting for clearing cycles, or contacting the customer).`;
  }

  // 3. What can this AI do / Capabilities / Features
  if (
    /\b(what\s+can\s+(you|this\s+ai)\s+do|what\s+do\s+you\s+do|capabilities|features|what\s+is\s+your\s+purpose|help\s+me\s+with)\b/i.test(q) ||
    (q.includes('what') && (q.includes('feature') || q.includes('purpose') || q.includes('capability')))
  ) {
    return `### ⚡ What Fintech AI Can Do

Fintech AI serves as your 24/7 intelligent financial operations analyst:

- **🔍 3-Way Reconciliation:** Automatically matches records between Payment Gateway charges, Bank settlement batches, and Double-entry Ledger entries.
- **🗣️ Natural Language Q&A:** Ask questions like *"Why was TXN1003 declined?"*, *"What happened to GP-101001?"*, or *"Show payments on 2026-08-25"*.
- **⏱️ Delay & Failure Diagnostics:** Identifies root causes of delays (bank cut-off hours, holiday windows, AML reviews) and failures (insufficient funds, invalid IFSC).
- **⚠️ Honest Exception Management:** Identifies edge cases where records disagree or data pipelines failed, presenting low-confidence items with transparent reasoning.
- **📊 Real-Time Data Explorer:** Inspect and filter across 1,100+ simulated production transactions directly in the dashboard table.`;
  }

  // 4. What is Settlement / How does settlement work
  if (
    (q.includes('settlement') || q.includes('settle')) &&
    (q.includes('what') || q.includes('explain') || q.includes('how') || q.includes('wat') || q.includes('mean'))
  ) {
    return `### 💳 How Payment Settlement Works

**Settlement** is the multi-step financial process where money paid by a customer at checkout actually travels across banking networks and lands in the merchant's business bank account.

**The 3 Key Steps:**
1. **Authorization & Capture (Payment Gateway):** The customer enters their card or UPI details. The gateway confirms sufficient funds with the issuing bank and captures the payment.
2. **Clearing & Payout (Bank Settlement):** The acquiring bank bundles approved payments into a settlement batch (e.g. \`BATCH-301\`) and transmits net funds via banking clearing rails (NEFT/RTGS/ACH) to the merchant's account with a unique Bank Reference / UTR number.
3. **Accounting & Reconciliation (General Ledger):** The merchant's internal accounting system records debit and credit entries, accounting for interchange fees and taxes to ensure the books balance.

Fintech AI monitors all 3 steps simultaneously to make sure funds never disappear into a black hole!`;
  }

  // 5. What is Reconciliation / 3-Way Reconciliation
  if (
    (q.includes('reconciliation') || q.includes('recon') || q.includes('3-way')) &&
    (q.includes('what') || q.includes('how') || q.includes('explain') || q.includes('mean'))
  ) {
    return `### ⚖️ What is 3-Way Reconciliation?

**3-Way Reconciliation** is an essential financial integrity check comparing three independent sources of record for every single transaction:

1. **Payment Gateway Records:** What the customer authorized and what the gateway reported captured.
2. **Bank Settlement Records:** What money actually cleared and was disbursed with a Bank Reference/UTR.
3. **Accounting Ledger Records:** What internal double-entry bookkeeping posted for merchant payables and fee expenses.

**Why it matters:** If a gateway marks a payment as successful, but the bank never pays out, or the bank pays out but the ledger records a different amount, you have an anomaly. Fintech AI catches these mismatches automatically!`;
  }

  // 6. Why payments fail
  if (q.includes('fail') || q.includes('reject') || q.includes('decline') || q.includes('fal') || q.includes('err')) {
    return `### ⚠️ Why Payments Fail

- **Card Declined / Insufficient Funds:** The customer's issuing bank declined the charge due to lack of funds, incorrect PIN/CVV, or expired card.
- **Invalid Bank Details (IFSC / Account):** Destination account details provided in merchant onboarding are incorrect or the branch is offline.
- **Network / Gateway Timeouts:** Communication dropped between the payment gateway and the card network before confirmation.
- **Compliance & AML Block:** Transactions flagged by fraud monitoring algorithms for suspicious activity or high-value risk hold.`;
  }

  // 7. Why payments get delayed
  if (q.includes('delay') || q.includes('slow') || q.includes('late') || q.includes('dlay')) {
    return `### ⏱️ Why Payments Get Delayed

- **Bank Clearing Cut-off Hours:** Banking rails pause processing in late afternoons. Transactions captured after cut-off wait until the next business morning.
- **Weekends & National Holidays:** Commercial banks and clearing houses do not settle batches on non-working days.
- **Risk & Velocity Holds:** Sudden spikes in transaction value or unusual velocity can trigger temporary safety reviews before disbursement.`;
  }

  // 8. System Counts / Database Info
  if (q.includes('how many') || q.includes('count') || q.includes('total') || q.includes('records') || q.includes('database')) {
    return `### 📊 Live System Counts

- **Payment Requests (Gateway):** ${totalGateway.toLocaleString()}
- **Bank Settlement Records:** ${totalBank.toLocaleString()}
- **Accounting Ledger Records:** ${totalLedger.toLocaleString()}

All records span the August 2026 reporting period, providing a full test suite of settled payments, delays, and flagged reconciliation exceptions.`;
  }

  // 9. Greetings & Identity (using word boundary checks)
  if (/\b(hello|hi|hey|greetings|howdy|good\s+morning|good\s+afternoon|good\s+evening|who\s+are\s+you|what\s+is\s+your\s+name)\b/i.test(q)) {
    return `**Hello! I am Fintech AI.**

I am your intelligent assistant for payment investigations, settlement tracking, and 3-way financial reconciliation.

**Ways you can interact with me:**
- **Ask conceptual questions:** *"Who can use this AI?"*, *"What is AI?"*, *"How does settlement work?"*
- **Investigate a transaction:** Enter any Transaction ID like \`TXN1001\` or Payment ID like \`GP-101001\`
- **Filter by date:** Enter a date like \`2026-08-25\` to see all payments on that day
- **Investigate problems:** Ask *"Why was TXN1003 declined?"* or *"Why is TXN1002 delayed?"*`;
  }

  // 10. Intelligent General Fallback
  return `### 🤖 Fintech AI Payment Assistant

I am here to help you understand payments, investigate transactions, and answer questions about settlement operations.

**Helpful things you can try:**
- **Ask questions:**
  - *"Who can use this AI?"*
  - *"What is AI and how does it help with settlements?"*
  - *"What is 3-way reconciliation?"*
  - *"Why do payments get delayed?"*
- **Trace a transaction:**
  - Enter a **Transaction ID** (e.g. \`TXN1001\`, \`TXN1002\`, \`TXN1003\`)
  - Enter a **Payment ID** (e.g. \`GP-101001\`)
  - Enter a **Date** (e.g. \`2026-08-25\`)
- **Explore data:** Click any row in the **Database** table on the right to inspect its raw cross-system evidence!`;
}
