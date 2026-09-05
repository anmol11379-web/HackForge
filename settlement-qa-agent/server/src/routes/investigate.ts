import { Router, Request, Response } from 'express';
import { investigate, investigateMultiple, findTransactionsByDate } from '../reconciliation/engine.js';
import { getAIExplanation, getAIProvider, getAIProviderLabel, answerGeneralQuery } from '../ai/aiService.js';
import { parseQuestion } from '../reconciliation/questionParser.js';
import type { AskRequest } from '../types/index.js';

const router = Router();

// GET /api/investigate/:transactionId — full investigation
router.get('/investigate/:transactionId', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId || transactionId.trim() === '') {
      res.status(400).json({ success: false, error: 'Transaction ID is required.' });
      return;
    }

    const result = investigate(transactionId.toUpperCase());

    // Check if transaction exists
    if (!result.raw_evidence.gateway && result.raw_evidence.bank.length === 0 && result.raw_evidence.ledger.length === 0) {
      res.status(404).json({
        success: false,
        error: `No transaction matching "${transactionId}" was found. Please check the transaction ID or date.`,
        ai_mode: getAIProvider(),
      });
      return;
    }

    // Get AI explanation
    const explanation = await getAIExplanation(result);
    result.explanation = explanation;

    res.json({
      success: true,
      data: result,
      ai_mode: getAIProvider(),
      ai_mode_label: getAIProviderLabel(),
    });
  } catch (error) {
    console.error('[Investigate] Error:', error);
    res.status(500).json({
      success: false,
      error: 'An internal error occurred during investigation.',
      ai_mode: getAIProvider(),
    });
  }
});

// POST /api/ask — natural language question
router.post('/ask', async (req: Request, res: Response) => {
  try {
    const { question } = req.body as AskRequest;

    if (!question || question.trim() === '') {
      res.status(400).json({ success: false, error: 'Please enter a question or transaction ID.' });
      return;
    }

    // Sanitize input
    const sanitized = question.trim().slice(0, 500);
    const parsed = parseQuestion(sanitized);

    // Date-based search
    if (parsed.date && !parsed.transaction_id) {
      const txnIds = findTransactionsByDate(parsed.date);
      if (txnIds.length === 0) {
        const aiAnswer = await answerGeneralQuery(
          `User searched for transactions on date ${parsed.date}, but none were found in our system. Explain that records currently span August 2026 and suggest checking 2026-08-25.`
        );
        res.json({
          success: true,
          answer: aiAnswer || `No transactions found for date ${parsed.date}. Our records cover August 2026 (e.g., 2026-08-20 to 2026-08-26). Try searching for 2026-08-25 or a specific Transaction ID like TXN1001.`,
          ai_mode: getAIProvider(),
          ai_mode_label: getAIProviderLabel(),
          parsed_question: parsed,
        });
        return;
      }

      // Investigate all matching transactions
      const results = investigateMultiple(txnIds);
      for (const result of results) {
        const explanation = await getAIExplanation(result);
        result.explanation = explanation;
      }

      res.json({
        success: true,
        data: results,
        multiple_results: true,
        ai_mode: getAIProvider(),
        ai_mode_label: getAIProviderLabel(),
        parsed_question: parsed,
      });
      return;
    }

    // Transaction ID search (or payment ID / bank ref / ledger ID resolved to transaction_id)
    if (parsed.transaction_id) {
      const result = investigate(parsed.transaction_id);
      const hasRecords = !!result.raw_evidence.gateway || result.raw_evidence.bank.length > 0 || result.raw_evidence.ledger.length > 0;

      if (hasRecords) {
        const explanation = await getAIExplanation(result);
        result.explanation = explanation;

        res.json({
          success: true,
          data: result,
          ai_mode: getAIProvider(),
          ai_mode_label: getAIProviderLabel(),
          parsed_question: parsed,
        });
        return;
      }

      // Transaction ID was provided or parsed, but no records exist
      const aiAnswer = await answerGeneralQuery(
        `User asked about transaction/payment "${parsed.transaction_id}", but it was not found in Gateway, Bank, or Ledger logs. Explain this politely and suggest sample transactions like TXN1001, TXN1002, or Payment ID GP-101001.`
      );
      res.json({
        success: true,
        answer: aiAnswer || `No transaction matching "${parsed.transaction_id}" was found in our Gateway, Bank, or Ledger logs. Please check the ID or try investigating sample records like TXN1001, TXN1002, or Payment ID GP-101001.`,
        ai_mode: getAIProvider(),
        ai_mode_label: getAIProviderLabel(),
        parsed_question: parsed,
      });
      return;
    }

    // Direct TXN pattern check
    const directId = sanitized.toUpperCase();
    if (/^TXN\d+$/.test(directId)) {
      const result = investigate(directId);
      const hasRecords = !!result.raw_evidence.gateway || result.raw_evidence.bank.length > 0 || result.raw_evidence.ledger.length > 0;

      if (hasRecords) {
        const explanation = await getAIExplanation(result);
        result.explanation = explanation;
        res.json({
          success: true,
          data: result,
          ai_mode: getAIProvider(),
          ai_mode_label: getAIProviderLabel(),
          parsed_question: parsed,
        });
        return;
      }
    }

    // General question, concept question, greeting, or question with spelling errors
    // ALWAYS provide a comprehensive, intelligent AI answer!
    const generalAnswer = await answerGeneralQuery(sanitized);
    res.json({
      success: true,
      answer: generalAnswer,
      ai_mode: getAIProvider(),
      ai_mode_label: getAIProviderLabel(),
      parsed_question: parsed,
    });
  } catch (error) {
    console.error('[Ask] Error:', error);
    res.status(500).json({
      success: false,
      error: 'An internal error occurred while processing your question.',
      ai_mode: getAIProvider(),
    });
  }
});

export default router;
