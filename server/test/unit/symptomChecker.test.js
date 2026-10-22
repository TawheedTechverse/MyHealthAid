import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRedFlags, checkSymptom, FALLBACK_RESULT } from '../../src/lib/symptomChecker.js';
import { config } from '../../src/config/env.js';

test('detectRedFlags matches each category and flags suicide separately', () => {
  assert.equal(detectRedFlags('I have severe chest pain').matched, true);
  assert.equal(detectRedFlags('I am having trouble breathing').matched, true);
  assert.equal(detectRedFlags('My face is drooping and my speech is slurred').matched, true);
  assert.equal(detectRedFlags('I have heavy bleeding that won\'t stop').matched, true);

  const suicide = detectRedFlags('I have been having thoughts of suicide');
  assert.equal(suicide.matched, true);
  assert.equal(suicide.suicide, true);
});

test('detectRedFlags does not match ordinary symptoms', () => {
  const result = detectRedFlags('I have had a mild headache since yesterday');
  assert.equal(result.matched, false);
  assert.equal(result.flags.length, 0);
  assert.equal(result.suicide, false);
});

test('checkSymptom returns the fallback when no API key is configured (mocked fetch must not be called)', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error('fetch should not have been called');
  };
  try {
    const result = await checkSymptom('I have a mild rash', { activePlan: null, latestSummary: null });
    assert.deepEqual(result, FALLBACK_RESULT);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('checkSymptom parses a valid model response', async () => {
  const originalKey = config.geminiApiKey;
  const originalFetch = global.fetch;
  config.geminiApiKey = 'test-key';
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    urgency: 'see-gp',
                    advice: 'Keep an eye on it and see your GP if it persists.',
                    reasons: ['Mild, non-specific symptom'],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  try {
    const result = await checkSymptom('I have a mild rash', { activePlan: null, latestSummary: null });
    assert.equal(result.urgency, 'see-gp');
    assert.equal(result.reasons[0], 'Mild, non-specific symptom');
  } finally {
    config.geminiApiKey = originalKey;
    global.fetch = originalFetch;
  }
});

test('checkSymptom falls back safely when the model output does not match the schema', async () => {
  const originalKey = config.geminiApiKey;
  const originalFetch = global.fetch;
  config.geminiApiKey = 'test-key';
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ urgency: 'diagnose-it-is-cancer', advice: 'take this drug' }) }],
            },
          },
        ],
      }),
      { status: 200 },
    );
  try {
    const result = await checkSymptom('I have a mild rash', { activePlan: null, latestSummary: null });
    assert.deepEqual(result, FALLBACK_RESULT);
  } finally {
    config.geminiApiKey = originalKey;
    global.fetch = originalFetch;
  }
});

test('checkSymptom falls back safely on a network error', async () => {
  const originalKey = config.geminiApiKey;
  const originalFetch = global.fetch;
  config.geminiApiKey = 'test-key';
  global.fetch = async () => {
    throw new Error('network down');
  };
  try {
    const result = await checkSymptom('I have a mild rash', { activePlan: null, latestSummary: null });
    assert.deepEqual(result, FALLBACK_RESULT);
  } finally {
    config.geminiApiKey = originalKey;
    global.fetch = originalFetch;
  }
});
