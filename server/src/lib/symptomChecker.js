import { z } from 'zod';
import { config } from '../config/env.js';

export const symptomResultSchema = z.object({
  urgency: z.enum(['self-care', 'see-gp', 'urgent']),
  advice: z.string(),
  reasons: z.array(z.string()).default([]),
});

export const FALLBACK_RESULT = {
  urgency: 'see-gp',
  advice:
    'We could not get a confident assessment. As a precaution, please see your GP to have this checked.',
  reasons: ['Assessment unavailable - defaulting to a safe recommendation.'],
};

// Case-insensitive phrase matching. Deliberately broad and simple - a real
// triage system would be far more careful, but here a false positive (an
// unnecessary nudge to call 000) is the safe failure mode, not the harmful one.
const RED_FLAGS = [
  { label: 'chest pain', patterns: [/chest pain/i, /tightness in (my |the )?chest/i] },
  {
    label: 'difficulty breathing',
    patterns: [/trouble breathing/i, /can'?t breathe/i, /shortness of breath/i, /difficulty breathing/i],
  },
  {
    label: 'possible stroke signs',
    patterns: [/face.{0,15}droop/i, /slurred speech/i, /sudden.{0,20}(numbness|weakness)/i, /can'?t speak/i],
  },
  {
    label: 'heavy bleeding',
    patterns: [/heavy bleeding/i, /won'?t stop bleeding/i, /bleeding (a lot|heavily|severely)/i],
  },
  {
    label: 'thoughts of suicide or self-harm',
    patterns: [/suicid/i, /self[- ]?harm/i, /(kill|hurt) myself/i, /end my life/i],
    suicide: true,
  },
];

/** @returns {{ matched: boolean, flags: string[], suicide: boolean }} */
export function detectRedFlags(text) {
  const input = String(text ?? '');
  const flags = [];
  let suicide = false;
  for (const flag of RED_FLAGS) {
    if (flag.patterns.some((p) => p.test(input))) {
      flags.push(flag.label);
      if (flag.suicide) suicide = true;
    }
  }
  return { matched: flags.length > 0, flags, suicide };
}

const SYSTEM_PROMPT = [
  'You are a safety-conscious triage assistant inside a patient-facing symptom checker.',
  'You must NEVER diagnose a condition, and NEVER prescribe or recommend a specific',
  'medication, dose, or treatment. You only advise how urgently the patient should seek',
  "in-person care, using the symptoms described and the context given (their current",
  'care plan and most recent visit summary, if any - both may be absent).',
  'Return exactly one urgency level:',
  '- "self-care": safe to manage at home; mild or non-specific symptoms.',
  '- "see-gp": should see their doctor soon, but it is not an emergency.',
  '- "urgent": should seek care urgently (same-day GP, urgent care, or ED) but this is',
  '  not already a known life-threatening emergency (those are filtered out before you',
  '  are ever called).',
  'Keep advice to 2-3 short, plain-language sentences and never speculate on a diagnosis.',
  'Give brief reasons (short phrases) for the urgency you chose.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    urgency: { type: 'string', enum: ['self-care', 'see-gp', 'urgent'] },
    advice: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['urgency', 'advice', 'reasons'],
};

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Calls Gemini to triage a (non-red-flag) symptom description, using the
 * patient's active plan and latest visit summary as context. Never throws -
 * any failure (no key, network, bad/invalid output) resolves to
 * FALLBACK_RESULT so a broken integration degrades to a safe recommendation
 * rather than blocking the patient.
 * @param {string} input
 * @param {{ activePlan: {title:string, description:string}|null, latestSummary: object|null }} context
 */
export async function checkSymptom(input, context) {
  if (!config.geminiApiKey) {
    return FALLBACK_RESULT;
  }

  const contextText = [
    context.activePlan
      ? `Active care plan: "${context.activePlan.title}" - ${context.activePlan.description}`
      : 'No active care plan on file.',
    context.latestSummary
      ? `Most recent visit summary: ${JSON.stringify(context.latestSummary)}`
      : 'No visit summaries on file.',
  ].join('\n');

  const url = `${API_BASE}/models/${config.summaryModel}:generateContent?key=${config.geminiApiKey}`;
  const body = {
    contents: [
      { role: 'user', parts: [{ text: `Patient context:\n${contextText}\n\nSymptom description: ${input}` }] },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      return FALLBACK_RESULT;
    }

    const data = await response.json();
    const jsonText = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text)
      .filter(Boolean)
      .join('')
      .trim();
    if (!jsonText) {
      return FALLBACK_RESULT;
    }

    const parsed = symptomResultSchema.safeParse(JSON.parse(jsonText));
    return parsed.success ? parsed.data : FALLBACK_RESULT;
  } catch {
    return FALLBACK_RESULT;
  }
}
