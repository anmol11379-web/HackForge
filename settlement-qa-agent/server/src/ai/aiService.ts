// ============================================================
// AI Service — Provider Abstraction
// ============================================================
// Routes investigation results to the configured AI provider.
// Falls back to deterministic explanations if AI is unavailable.

import type { InvestigationResult, AIExplanation } from '../types/index.js';
import { callGroq, callGroqChat } from './providers/groqProvider.js';
import { callGemini, callGeminiChat } from './providers/geminiProvider.js';
import { generateFallbackExplanation, generateFallbackGeneralAnswer } from './fallback.js';
import { getDataStore } from '../parsers/csvParser.js';

export type AIProvider = 'groq' | 'gemini' | 'mock';

export function getAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase().trim();
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (provider === 'groq' && groqKey) return 'groq';
  if (provider === 'gemini' && geminiKey) return 'gemini';
  if (provider === 'mock' && !groqKey && !geminiKey) return 'mock';

  // Auto-detect if provider not explicitly configured or was left as default
  if (provider === 'groq' || provider === 'auto' || provider === '' || provider === 'mock') {
    if (groqKey) return 'groq';
    if (geminiKey) return 'gemini';
  }

  return 'mock';
}

export function getAIProviderLabel(): string {
  const provider = getAIProvider();
  switch (provider) {
    case 'groq': {
      const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
      return `Groq (${model})`;
    }
    case 'gemini': {
      const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
      return `Google Gemini (${model})`;
    }
    case 'mock': return 'Mock Reasoning (Deterministic)';
  }
}

export async function getAIExplanation(
  investigation: InvestigationResult,
): Promise<AIExplanation> {
  const provider = getAIProvider();

  try {
    if (provider === 'gemini') {
      try {
        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
        console.log(`[AI] Using Gemini provider (${process.env.GEMINI_MODEL || 'gemini-flash-latest'})`);
        return await callGemini(apiKey, investigation);
      } catch (geminiError) {
        console.warn(`[AI] Gemini failed (${(geminiError as Error).message}), attempting Groq fallback...`);
        const groqKey = (process.env.GROQ_API_KEY || '').trim();
        if (groqKey) {
          console.log(`[AI Fallback] Using Groq provider (${process.env.GROQ_MODEL || 'openai/gpt-oss-120b'})`);
          return await callGroq(groqKey, investigation);
        }
        throw geminiError;
      }
    }

    if (provider === 'groq') {
      try {
        const apiKey = (process.env.GROQ_API_KEY || '').trim();
        if (!apiKey) throw new Error('GROQ_API_KEY is not set');
        console.log(`[AI] Using Groq provider (${process.env.GROQ_MODEL || 'openai/gpt-oss-120b'})`);
        return await callGroq(apiKey, investigation);
      } catch (groqError) {
        console.warn(`[AI] Groq failed (${(groqError as Error).message}), attempting Gemini fallback...`);
        const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (geminiKey) {
          console.log(`[AI Fallback] Using Gemini provider (${process.env.GEMINI_MODEL || 'gemini-flash-latest'})`);
          return await callGemini(geminiKey, investigation);
        }
        throw groqError;
      }
    }

    console.log('[AI] Using deterministic fallback');
    return generateFallbackExplanation(investigation);
  } catch (error) {
    console.error(`[AI] All LLM providers failed, falling back to deterministic:`, (error as Error).message);
    return generateFallbackExplanation(investigation);
  }
}

export function removeTypicalRecordIds(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const resultLines: string[] = [];
  let tableColToRemove = -1;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      const rawCells = trimmed.slice(1, -1).split('|');

      if (!inTable) {
        inTable = true;
        tableColToRemove = rawCells.findIndex(c =>
          /typical\s*(record\s*)?ids?/i.test(c) ||
          /typical\s*records?/i.test(c) ||
          /sample\s*(record\s*)?ids?/i.test(c) ||
          /(typical|sample)\s*ids?/i.test(c)
        );
      }

      if (tableColToRemove !== -1 && rawCells.length > tableColToRemove) {
        rawCells.splice(tableColToRemove, 1);
        resultLines.push('|' + rawCells.join('|') + '|');
      } else {
        resultLines.push(line);
      }
    } else {
      inTable = false;
      tableColToRemove = -1;

      // Filter standalone bullets or lines for typical record ids
      if (/^[\s*#-]*\*{0,2}typical\s+(record\s+)?ids?[:\s*]/i.test(trimmed)) {
        continue;
      }
      resultLines.push(line);
    }
  }
  return resultLines.join('\n');
}

export function stripRepetitiveIntro(text: string, question: string): string {
  if (!text) return '';
  const isGreetingOrIdentity = /^(hi|hello|hey|who\s+are\s+you|what\s+is\s+your\s+name|who\s+are\s+u|introduce\s+yourself)/i.test(question.trim());

  let cleaned = text;
  if (!isGreetingOrIdentity) {
    // Strip leading self-intros like "**Fintech AI here!**", "Fintech AI here!", "Fintech AI is here!"
    cleaned = cleaned.replace(/^\s*(?:\*\*)?Fintech\s+AI\s+(?:is\s+)?here[!.:]*(?:\*\*)?\s*/i, '');
    cleaned = cleaned.replace(/^\s*(?:\*\*)?Hello!?(?:\s+I\s+am\s+Fintech\s+AI[.!:]*)(?:\*\*)?\s*/i, '');

    // Strip trailing repetitive phrases
    cleaned = cleaned.replace(/\n*\s*(?:In short,\s*)?(?:if you [^\n]+,\s*)?Fintech\s+AI\s+is\s+here(?:\s+for you|\s+to help)?[.!]*\s*$/i, '');
  }

  // Strip meta phrases like "in simple words", "in simple terms"
  cleaned = cleaned.replace(/\s*(?:in\s+simple\s+(?:everyday\s+)?words|in\s+simple(?:,\s+clear)?\s+terms|in\s+simple(?:,\s+easy-to-understand)?\s+words)\s*/gi, ' ');
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  return cleaned.trim();
}

export async function answerGeneralQuery(question: string): Promise<string> {
  const provider = getAIProvider();
  let totalGateway = 1100;
  let totalBank = 1058;
  let totalLedger = 1048;
  const failureCodes: Record<string, number> = {};

  try {
    const store = getDataStore();
    if (store) {
      totalGateway = store.gateway.length;
      totalBank = store.bank.length;
      totalLedger = store.ledger.length;
      for (const g of store.gateway) {
        if (g.failure_code) {
          failureCodes[g.failure_code] = (failureCodes[g.failure_code] || 0) + 1;
        }
      }
    }
  } catch (err) {
    // If store loading fails, use defaults
  }

  const systemPrompt = `You are Fintech AI, a friendly and super-clear payment assistant.

Core Principles:
1. NAME: Your name is always "Fintech AI". Never use any other name.
2. SIMPLE LANGUAGE (NO HEAVY WORDS - CRITICAL):
   - NEVER use heavy, academic, or overly complicated financial words.
   - Speak in clear, natural, everyday English so that ANY person can easily understand.
   - Keep sentences short, warm, and friendly.
   - Say "the payment was approved" instead of "successful authorization on card rails".
   - Say "the bank moved the money" instead of "batch clearing settlement cycle executed".
   - Say "the amounts didn't match" instead of "reconciliation discrepancy anomaly detected".
   - Say "a record was missing" instead of "unreconciled missing ledger entry".
3. DIRECT ANSWER (NO REPETITIVE INTRODUCTIONS - CRITICAL):
   - DO NOT start your response with "Fintech AI here!", "Fintech AI is here!", or similar self-introductions on normal queries.
   - Jump straight into answering the user's question directly.
   - ONLY state your name or say "Hello! I am Fintech AI" if the user specifically asks who you are, asks for your name, or greets you.
   - DO NOT append repetitive sign-offs like "Fintech AI is here for you" at the end of messages.
4. UNDERSTAND INTENT & TYPOS:
   - Always understand what the user is asking, even with spelling errors or typos (e.g. "wat is setlment", "y did it fail", "who can use this").
5. CLEAN FORMATTING:
   - Use clear bullet points and bold highlights so responses are very easy to read.
6. NO SAMPLE RECORD IDS:
   - NEVER include a "Typical record IDs" column or lists of internal ID patterns.
7. NO META-PHRASES:
   - NEVER write phrases like "in simple words", "in simple terms", or "in plain English" in your responses. Just provide the direct, clear explanation naturally.

Live System Snapshot:
- Gateway Payments Tracked: ${totalGateway.toLocaleString()}
- Bank Records: ${totalBank.toLocaleString()}
- Account Ledger Records: ${totalLedger.toLocaleString()}
- Common Failure Codes: ${Object.entries(failureCodes).slice(0, 5).map(([k, v]) => `${k} (${v})`).join(', ') || 'AUTH_DECLINED, INSUFFICIENT_FUNDS'}`;

  try {
    let answer = '';
    if (provider === 'gemini') {
      try {
        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
        answer = await callGeminiChat(apiKey, systemPrompt, question);
      } catch (geminiError) {
        console.warn(`[AI General Query] Gemini failed (${(geminiError as Error).message}), attempting Groq fallback...`);
        const groqKey = (process.env.GROQ_API_KEY || '').trim();
        if (groqKey) {
          answer = await callGroqChat(groqKey, systemPrompt, question);
        }
      }
    } else if (provider === 'groq') {
      try {
        const apiKey = (process.env.GROQ_API_KEY || '').trim();
        if (!apiKey) throw new Error('GROQ_API_KEY is not set');
        answer = await callGroqChat(apiKey, systemPrompt, question);
      } catch (groqError) {
        console.warn(`[AI General Query] Groq failed (${(groqError as Error).message}), attempting Gemini fallback...`);
        const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (geminiKey) {
          answer = await callGeminiChat(geminiKey, systemPrompt, question);
        }
      }
    }

    if (!answer) {
      answer = generateFallbackGeneralAnswer(question, totalGateway, totalBank, totalLedger);
    }

    const cleaned = removeTypicalRecordIds(answer);
    return stripRepetitiveIntro(cleaned, question);
  } catch (error) {
    console.error(`[AI General Query] All LLM providers failed, falling back to deterministic:`, (error as Error).message);
    const fallback = generateFallbackGeneralAnswer(question, totalGateway, totalBank, totalLedger);
    const cleaned = removeTypicalRecordIds(fallback);
    return stripRepetitiveIntro(cleaned, question);
  }
}

