import Anthropic from '@anthropic-ai/sdk';
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

// JSON Schema handed to the API's structured-output mode. Kept in sync with the
// Zod schema above by hand (our Zod v3 isn't compatible with the SDK's
// zodOutputFormat helper).
const SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
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
        additionalProperties: false,
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

export const isSummarizerConfigured = () => Boolean(config.anthropicApiKey);

let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 1 });
  }
  return client;
}

/**
 * Generate a structured summary from a raw transcript.
 * @param {string} transcript
 * @returns {Promise<{ summary: z.infer<typeof visitSummarySchema>, model: string }>}
 * @throws if the summarizer is not configured or the model output is unusable.
 */
export async function summarizeTranscript(transcript) {
  if (!isSummarizerConfigured()) {
    throw new Error('Summarization is not configured (ANTHROPIC_API_KEY is unset)');
  }
  const text = String(transcript ?? '').trim();
  if (text.length < 15) {
    throw new Error('Transcript is too short to summarize');
  }

  const response = await getClient().messages.create(
    {
      model: config.summaryModel,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SUMMARY_JSON_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `Consultation transcript:\n\n${text}`,
        },
      ],
    },
    { timeout: 60_000 },
  );

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to summarize this transcript');
  }

  const jsonText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  let parsed;
  try {
    parsed = visitSummarySchema.parse(JSON.parse(jsonText));
  } catch (err) {
    throw new Error(`Model did not return a valid summary: ${err.message}`);
  }

  return { summary: parsed, model: config.summaryModel };
}
