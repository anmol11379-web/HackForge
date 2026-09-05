import { Router } from 'express';
import { getAIProvider, getAIProviderLabel } from '../ai/aiService.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ai_mode: getAIProvider(),
    ai_mode_label: getAIProviderLabel(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

export default router;
