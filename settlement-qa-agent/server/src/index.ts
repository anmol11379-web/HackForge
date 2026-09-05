import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import healthRoutes from './routes/health.js';
import transactionRoutes from './routes/transactions.js';
import investigateRoutes from './routes/investigate.js';
import dataRoutes from './routes/data.js';
import { getDataStore, startCsvWatcher } from './parsers/csvParser.js';
import { getAIProvider, getAIProviderLabel } from './ai/aiService.js';

import fs from 'fs';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API Routes
app.use('/api', healthRoutes);
app.use('/api', transactionRoutes);
app.use('/api', investigateRoutes);
app.use('/api/data', dataRoutes);

// Production Static Client Serving
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 404 handler for API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found.' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// Start server
app.listen(PORT, () => {
  // Pre-load data and start auto-reload file watcher
  const store = getDataStore();
  startCsvWatcher();
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║       Settlement Q&A Agent — Server          ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║  Port:     ${PORT}                              ║`);
  console.log(`  ║  AI Mode:  ${getAIProviderLabel().padEnd(33)}║`);
  console.log(`  ║  Gateway:  ${String(store.gateway.length).padEnd(2)} records                       ║`);
  console.log(`  ║  Bank:     ${String(store.bank.length).padEnd(2)} records                       ║`);
  console.log(`  ║  Ledger:   ${String(store.ledger.length).padEnd(2)} records                       ║`);
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log('  ║  ⚠  DEMO ONLY — Using synthetic mock data   ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  → http://localhost:${PORT}/api/health`);
  console.log('');
});
