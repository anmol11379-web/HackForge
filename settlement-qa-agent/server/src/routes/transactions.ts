import { Router, Request, Response } from 'express';
import {
  findTransactionBundle,
  findTransactionsByDate,
  getAllTransactionIds,
  investigate,
} from '../reconciliation/engine.js';
import { getDataStore } from '../parsers/csvParser.js';

const router = Router();

// GET /api/transactions/catalog — List all loaded transactions with reconciled statuses
router.get('/transactions/catalog', (_req: Request, res: Response) => {
  try {
    const ids = getAllTransactionIds();
    const catalog = ids.map((id) => {
      const result = investigate(id);
      const bundle = result.raw_evidence;
      return {
        transaction_id: id,
        date: bundle.gateway?.created_at?.slice(0, 10) || bundle.bank[0]?.settlement_date || bundle.bank[0]?.received_at?.slice(0, 10) || bundle.ledger[0]?.ledger_created_at?.slice(0, 10) || null,
        amount: result.amount,
        currency: result.currency,
        merchant_id: bundle.gateway?.merchant_id || null,
        payment_method: bundle.gateway?.payment_method || null,
        gateway_status: bundle.gateway ? bundle.gateway.gateway_status : 'MISSING',
        bank_status: bundle.bank.length > 0 ? bundle.bank.map((b) => b.bank_status).join(', ') : 'MISSING',
        ledger_status: bundle.ledger.length > 0 ? bundle.ledger.map((l) => l.ledger_status).join(', ') : 'MISSING',
        overall_status: result.status,
        confidence_level: result.confidence,
        exception_count: result.exceptions.length,
        summary: result.summary,
      };
    });

    res.json({
      success: true,
      data: catalog,
      total: catalog.length,
    });
  } catch (error) {
    console.error('[Catalog Error]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to build transaction catalog.',
    });
  }
});

// GET /api/transactions/:transactionId — raw records lookup
router.get('/transactions/:transactionId', (req: Request, res: Response) => {
  const { transactionId } = req.params;

  if (!transactionId || transactionId.trim() === '') {
    res.status(400).json({ success: false, error: 'Transaction ID is required.' });
    return;
  }

  const bundle = findTransactionBundle(transactionId.toUpperCase());

  if (!bundle.gateway && bundle.bank.length === 0 && bundle.ledger.length === 0) {
    res.status(404).json({
      success: false,
      error: `No transaction matching "${transactionId}" was found. Please check the transaction ID.`,
    });
    return;
  }

  res.json({ success: true, data: bundle });
});

// GET /api/transactions?date=YYYY-MM-DD — date-based search
router.get('/transactions', (req: Request, res: Response) => {
  const { date } = req.query;

  if (!date || typeof date !== 'string') {
    // Return all transaction IDs
    const store = getDataStore();
    const ids = new Set<string>();
    store.gateway.forEach((r) => ids.add(r.transaction_id));
    store.bank.forEach((r) => ids.add(r.transaction_id));
    store.ledger.forEach((r) => ids.add(r.transaction_id));
    res.json({ success: true, data: Array.from(ids).sort() });
    return;
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ success: false, error: 'Date must be in YYYY-MM-DD format.' });
    return;
  }

  const txnIds = findTransactionsByDate(date);

  if (txnIds.length === 0) {
    res.status(404).json({
      success: false,
      error: `No transactions found for date ${date}.`,
    });
    return;
  }

  res.json({ success: true, data: txnIds, count: txnIds.length });
});

export default router;
