import { Router, Request, Response } from 'express';
import {
  saveCsvContent,
  reloadDataStore,
  getDataStats,
  validateCsvContent,
  SystemType,
  getDataStore,
} from '../parsers/csvParser.js';

const router = Router();

// POST /api/data/upload — Upload/ingest CSV records for a specific system
router.post('/upload', (req: Request, res: Response) => {
  try {
    const { system, csvContent, mode = 'append' } = req.body;

    if (!system || !['gateway', 'bank', 'ledger'].includes(system)) {
      res.status(400).json({
        success: false,
        error: 'Invalid system specified. Must be "gateway", "bank", or "ledger".',
      });
      return;
    }

    if (!csvContent || typeof csvContent !== 'string' || csvContent.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'CSV content is empty or invalid.',
      });
      return;
    }

    if (!['append', 'replace'].includes(mode)) {
      res.status(400).json({
        success: false,
        error: 'Mode must be either "append" or "replace".',
      });
      return;
    }

    // Save and reload
    const result = saveCsvContent(system as SystemType, csvContent, mode);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to process CSV file.',
      });
      return;
    }

    const stats = getDataStats();
    res.json({
      success: true,
      message: `Successfully ${mode === 'replace' ? 'replaced' : 'appended'} ${result.rowCount} ${system} record(s).`,
      rowCount: result.rowCount,
      system,
      mode,
      stats,
    });
  } catch (error) {
    console.error('[Data Upload Error]', error);
    res.status(500).json({
      success: false,
      error: 'An internal error occurred while processing CSV upload.',
    });
  }
});

// POST /api/data/validate — Validate CSV content without saving
router.post('/validate', (req: Request, res: Response) => {
  try {
    const { system, csvContent } = req.body;

    if (!system || !['gateway', 'bank', 'ledger'].includes(system)) {
      res.status(400).json({
        success: false,
        error: 'Invalid system specified. Must be "gateway", "bank", or "ledger".',
      });
      return;
    }

    const result = validateCsvContent(system as SystemType, csvContent || '');
    res.json({
      success: result.valid,
      valid: result.valid,
      error: result.error,
      rowCount: result.rowCount,
      headers: result.headers,
    });
  } catch (error) {
    console.error('[Data Validate Error]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate CSV.',
    });
  }
});

// POST /api/data/reload — Invalidate cache and reload all CSVs
router.post('/reload', (_req: Request, res: Response) => {
  try {
    const { stats } = reloadDataStore();
    res.json({
      success: true,
      message: 'Data store successfully reloaded.',
      stats,
    });
  } catch (error) {
    console.error('[Data Reload Error]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reload data store.',
    });
  }
});

// GET /api/data/stats — Get counts and status of loaded datasets
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getDataStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Data Stats Error]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve data statistics.',
    });
  }
});

// GET /api/data/records — Get all raw records for gateway, bank, and ledger
router.get('/records', (_req: Request, res: Response) => {
  try {
    const store = getDataStore();
    res.json({
      success: true,
      data: store,
    });
  } catch (error) {
    console.error('[Data Records Error]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve records.',
    });
  }
});

export default router;
