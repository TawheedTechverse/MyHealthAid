import { z } from 'zod';
import { config } from '../config/env.js';

/**
 * Structured shape of a visit-note summary. Stored as JSONB and rendered as
 * sections in the UI. Every field is always present; unknown information is an
 * empty string / empty array rather than a guess.
 */
export const visitSummarySchema = z.object({
  chiefComplaint: z.string(),
  historyOfPresentIllness: z.string(),
  assessment: z.string(),
  plan: z.string(),
  followUp: z.string(),
  medications: z
    .array(
      z.object({
        name: z.string(),
        instruction: z.string(),
      }),
    )
    .default([]),
});

// Response schema handed to Gemini's structured-output mode
// (generationConfig.responseSchema). This is an OpenAPI-3.0-style subset, not
// full JSON Schema: no `additionalProperties`. Kept in sync with the Zod
// schema above by hand.
const SUMMARY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    chiefComplaint: { type: 'string' },
    historyOfPresentIllness: { type: 'string' },
    assessment: { type: 'string' },
    plan: { type: 'string' },
    followUp: { type: 'string' },
    medications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          instruction: { type: 'string' },
        },
        required: ['name', 'instruction'],
      },
    },
  },
  required: [
    'chiefComplaint',
    'historyOfPresentIllness',
    'assessment',
    'plan',
    'followUp',
    'medications',
  ],
};

const SYSTEM_PROMPT = [
  'You are a clinical documentation assistant. A doctor dictated notes aloud',
  'during or just after a patient consultation and the audio was auto-transcribed,',
  'so the text may contain speech-recognition errors.',
  '',
  'Turn the transcript into a concise, structured draft visit note. Rules:',
  '- Use only information stated in the transcript. Never invent findings,',
  '  diagnoses, measurements, or medications.',
  '- If the transcript does not cover a field, return an empty string for it',
  '  (or an empty array for medications). Do not write "not mentioned".',
  '- Write in brief clinical language, not full sentences where a phrase suffices.',
  '- "historyOfPresentIllness" is the narrative of the current problem.',
  '- "assessment" is the working diagnosis / clinical impression.',
  '- "plan" is what will be done (tests, referrals, procedures, advice).',
  '- "followUp" is the return interval or conditions to come back.',
  '- For each medication give its name and the dosing instruction as dictated.',
  '- Silently correct obvious transcription errors in drug and medical terms.',
  'This is a draft for the physician to review and edit; it is not a final record.',
].join('\n');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 60_000;
// Gemini returns 503 ("high demand") fairly often on the free tier; a couple
// of short retries clears most of them without the caller noticing.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

export const isSummarizerConfigured = () => Boolean(config.geminiApiKey);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a structured summary from a raw transcript.
 * @param {string} transcript
 * @returns {Promise<{ summary: z.infer<typeof visitSummarySchema>, model: string }>}
 * @throws if the summarizer is not configured or the model output is unusable.
 */
export async function summarizeTranscript(transcript) {
  if (!isSummarizerConfigured()) {
    throw new Error('Summarization is not configured (GEMINI_API_KEY is unset)');
  }
  const text = String(transcript ?? '').trim();
  if (text.length < 15) {
    throw new Error('Transcript is too short to summarize');
  }

  const url = `${API_BASE}/models/${config.summaryModel}:generateContent?key=${config.geminiApiKey}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `Consultation transcript:\n\n${text}` }],
      },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SUMMARY_RESPONSE_SCHEMA,
    },
  };

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
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
    } catch (err) {
      lastError = new Error(`Could not reach Gemini: ${err.message}`);
      clearTimeout(timer);
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      lastError = new Error(
        `Gemini API error ${response.status}: ${errText.slice(0, 300) || response.statusText}`,
      );
      // 429/5xx are worth a retry; 4xx (bad key, bad model, bad schema) are not.
      if (response.status === 429 || response.status >= 500) {
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      throw lastError;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];

    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'RECITATION') {
      throw new Error(`The model declined to summarize this transcript (${candidate.finishReason})`);
    }

    const jsonText = (candidate?.content?.parts ?? [])
      .map((part) => part.text)
      .filter(Boolean)
      .join('')
      .trim();

    if (!jsonText) {
      lastError = new Error(`Gemini returned no text (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
      continue;
    }

    let parsed;
    try {
      parsed = visitSummarySchema.parse(JSON.parse(jsonText));
    } catch (err) {
      throw new Error(`Model did not return a valid summary: ${err.message}`);
    }

    return { summary: parsed, model: config.summaryModel };
  }

  throw lastError ?? new Error('Summarization failed for an unknown reason');
}
