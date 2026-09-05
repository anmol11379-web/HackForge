// ============================================================
// Google Gemini Provider
// ============================================================

import type { InvestigationResult, AIExplanation } from '../../types/index.js';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function callGemini(
  apiKey: string,
  investigation: InvestigationResult,
): Promise<AIExplanation> {
  const prompt = buildPrompt(investigation);
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  return parseAIResponse(content);
}

export async function callGeminiChat(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\nUser Question:\n${userPrompt}` }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1200,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');
  return content.trim();
}

function buildPrompt(investigation: InvestigationResult): string {
  return `You are Fintech AI, a friendly payment analysis assistant. Analyze this investigation data and respond with JSON.

RULES:
1. SIMPLE WORDS (NO HEAVY JARGON): Do NOT use heavy words or complex finance jargon. Speak in simple everyday words so that ANY person can easily understand.
2. ONLY explain what is supported by evidence. Never fabricate data.
3. Distinguish facts from interpretations.
4. Mention ALL missing records and mismatches in plain English.
5. When evidence is insufficient, say so simply.
6. Do NOT change the status from "${investigation.status}" — the deterministic engine is the source of truth.

Transaction ID: ${investigation.transaction_id}
Status: ${investigation.status}
Confidence: ${investigation.confidence}
Summary: ${investigation.summary}

Timeline:
${investigation.timeline.map((e, i) => `${i + 1}. [${e.system}] ${e.timestamp || 'N/A'} - ${e.status}: ${e.description}${e.error_code ? ` (Error: ${e.error_code})` : ''}`).join('\n')}

Exceptions:
${investigation.exceptions.length > 0 ? investigation.exceptions.map((e) => `- [${e.severity}] ${e.type}: ${e.message}`).join('\n') : 'None'}

Evidence: Gateway=${investigation.raw_evidence.gateway ? 'Present' : 'Missing'}, Bank=${investigation.raw_evidence.bank.length} records, Ledger=${investigation.raw_evidence.ledger.length} records
Amount: ${investigation.amount !== null ? `${investigation.currency} ${investigation.amount.toFixed(2)}` : 'Unknown'}

Respond with this JSON format:
{
  "summary": "Plain-English summary",
  "status": "${investigation.status}",
  "reason": "Primary reason for current status",
  "timeline_explanation": ["Step 1...", "Step 2..."],
  "exceptions": ["Exception 1..."],
  "confidence": "${investigation.confidence}",
  "recommended_action": "Suggested next steps"
}`;
}

function parseAIResponse(content: string): AIExplanation {
  try {
    // Try to extract JSON from the response (Gemini may wrap it in markdown)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    const parsed = JSON.parse(jsonStr.trim());
    if (!parsed.summary || !parsed.status || !parsed.reason) {
      throw new Error('Missing required fields in AI response');
    }
    let timelineExplanation: string[] = [];
    if (Array.isArray(parsed.timeline_explanation)) {
      parsed.timeline_explanation.forEach((item: any) => {
        const str = String(item).trim();
        if (str.includes('","')) {
          timelineExplanation.push(...str.split('","').map((s) => s.replace(/^"|"$/g, '').trim()));
        } else {
          timelineExplanation.push(str.replace(/^"|"$/g, '').trim());
        }
      });
    } else if (typeof parsed.timeline_explanation === 'string') {
      timelineExplanation = parsed.timeline_explanation
        .split('\n')
        .map((s: string) => s.replace(/^[-*•0-9.]\s*/, '').trim())
        .filter(Boolean);
    }

    return {
      summary: String(parsed.summary),
      status: String(parsed.status),
      reason: String(parsed.reason),
      timeline_explanation: timelineExplanation.filter(Boolean),
      exceptions: Array.isArray(parsed.exceptions)
        ? parsed.exceptions.map((e: any) => String(e).replace(/^"|"$/g, '').trim()).filter(Boolean)
        : [],
      confidence: String(parsed.confidence || 'medium'),
      recommended_action: String(parsed.recommended_action || ''),
    };
  } catch (err) {
    throw new Error(`Failed to parse Gemini response: ${(err as Error).message}`);
  }
}
