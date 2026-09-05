// ============================================================
// Groq Provider
// ============================================================

import type { InvestigationResult, AIExplanation } from '../../types/index.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function callGroq(
  apiKey: string,
  investigation: InvestigationResult,
): Promise<AIExplanation> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(investigation);

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from Groq');

  return parseAIResponse(content);
}

export async function callGroqChat(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from Groq');
  return content.trim();
}

function buildSystemPrompt(): string {
  return `You are Fintech AI, a friendly payment analysis assistant. You explain transaction investigations clearly and concisely so that anyone can understand what happened.

CRITICAL RULES:
1. CLEAR LANGUAGE (NO HEAVY JARGON):
   - Do NOT use heavy, complicated words, academic terms, or dense financial jargon.
   - Do NOT include phrases like "in simple words", "in simple terms", or "in plain English" in your responses. Just provide clear, direct explanations.
   - Instead of "reconciliation discrepancy exception", say "the payment amounts did not match between systems" or "a record was missing".
   - Instead of "batch clearing settlement cycle rollover", say "the bank takes time to process payments, especially after cutoff hours or over weekends".
   - Keep sentences short, crisp, and direct.
2. ONLY explain what is supported by the evidence provided. Never fabricate records, timestamps, causes, or statuses.
3. Clearly distinguish between verified facts and reasonable interpretations.
4. Mention ALL missing records and mismatches clearly (e.g., "The bank has not recorded this payment yet").
5. When evidence is insufficient, state simply: "The records are not complete enough to know the exact cause."
6. Never invent data that is not in the investigation result.

You MUST respond with valid JSON in this exact format:
{
  "summary": "Clear summary of what happened without heavy words",
  "status": "The settlement status (SETTLED/PENDING/DELAYED/FAILED/REJECTED/PARTIALLY_RECORDED/UNKNOWN)",
  "reason": "The main reason for the status",
  "timeline_explanation": ["Step 1...", "Step 2...", "Step 3..."],
  "exceptions": ["Problem 1...", "Problem 2..."],
  "confidence": "high/medium/low",
  "recommended_action": "Clear next steps"
}`;
}

function buildUserPrompt(investigation: InvestigationResult): string {
  return `Analyze this settlement investigation and provide a clear explanation:

Transaction ID: ${investigation.transaction_id}
Deterministic Status: ${investigation.status}
Deterministic Confidence: ${investigation.confidence}
Deterministic Summary: ${investigation.summary}

Timeline Events:
${investigation.timeline.map((e, i) => `${i + 1}. [${e.system}] ${e.timestamp || 'N/A'} - ${e.status}: ${e.description}${e.error_code ? ` (Error: ${e.error_code})` : ''}`).join('\n')}

Detected Exceptions:
${investigation.exceptions.length > 0 ? investigation.exceptions.map((e) => `- [${e.severity}] ${e.type}: ${e.message}`).join('\n') : 'None'}

Raw Evidence Summary:
- Gateway record: ${investigation.raw_evidence.gateway ? 'Present' : 'Missing'}
- Bank records: ${investigation.raw_evidence.bank.length} found
- Ledger records: ${investigation.raw_evidence.ledger.length} found
- Amount: ${investigation.amount !== null ? `${investigation.currency} ${investigation.amount.toFixed(2)}` : 'Unknown'}

Please provide your analysis as JSON. Do NOT change the status from "${investigation.status}" — the deterministic engine is the source of truth.`;
}

function parseAIResponse(content: string): AIExplanation {
  try {
    let jsonStr = content.trim();
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    // Validate required fields
    if (!parsed.summary || !parsed.status || !parsed.reason) {
      throw new Error('Missing required fields in AI response');
    }
    // Clean up timeline items
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
    throw new Error(`Failed to parse AI response: ${(err as Error).message}`);
  }
}
