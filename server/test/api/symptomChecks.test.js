import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeClient, resetDb, registerUser, pool } from '../helpers.js';
import { config } from '../../src/config/env.js';

// Several tests share this file's process and the pool singleton, so it's
// closed once at the end rather than inside each test.
after(() => pool.end());

test('red-flag symptoms always escalate without calling the AI (mocked fetch)', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async (...args) => {
    // The test client's own HTTP calls to the local test server also go
    // through global.fetch; only flag calls to the Gemini API itself.
    if (String(args[0]).includes('generativelanguage.googleapis.com')) {
      fetchCalled = true;
    }
    return originalFetch(...args);
  };

  try {
    const { token } = await registerUser(client, { role: 'patient', phone: '+61400000004' });

    const res = await client.post('/symptom-checks', {
      token,
      body: { input: 'I have crushing chest pain and feel dizzy' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.check.redFlag, true);
    assert.equal(res.body.check.urgency, 'urgent');
    assert.ok(res.body.emergency.callTripleZero);
    assert.equal(res.body.emergency.lifeline, false);
    assert.match(res.body.check.advice, /Triple Zero \(000\)/);
    assert.equal(fetchCalled, false, 'the AI must never be called for red-flag text');

    const suicideRes = await client.post('/symptom-checks', {
      token,
      body: { input: 'I keep having thoughts of suicide' },
    });
    assert.equal(suicideRes.body.emergency.lifeline, true);
    assert.match(suicideRes.body.check.advice, /Lifeline on 13 11 14/);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
    await close();
  }
});

test('bad AI output falls back to a safe see-gp recommendation instead of surfacing invalid data', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);

  const originalKey = config.geminiApiKey;
  const originalFetch = global.fetch;
  config.geminiApiKey = 'test-key';
  global.fetch = async (...args) => {
    if (!String(args[0]).includes('generativelanguage.googleapis.com')) {
      return originalFetch(...args);
    }
    return new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ urgency: 'not-a-real-level', advice: 'x' }) }] } },
        ],
      }),
      { status: 200 },
    );
  };

  try {
    const { token } = await registerUser(client, { role: 'patient', phone: '+61400000005' });
    const res = await client.post('/symptom-checks', {
      token,
      body: { input: 'I have a mild headache since yesterday' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.check.redFlag, false);
    assert.equal(res.body.check.urgency, 'see-gp');
    assert.equal(res.body.emergency, null);

    const list = await client.get('/symptom-checks', { token });
    assert.equal(list.body.checks.length, 1);
    assert.equal(list.body.checks[0].urgency, 'see-gp');
  } finally {
    config.geminiApiKey = originalKey;
    global.fetch = originalFetch;
    await close();
  }
});

test('a doctor only sees symptom checks for patients they treat or have been granted access to', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);

  try {
    const { token: ownerToken } = await registerUser(client, { role: 'doctor', email: 'sc-owner@test.dev' });
    const { token: strangerToken } = await registerUser(client, { role: 'doctor', email: 'sc-stranger@test.dev' });
    const { token: patientToken, user: patient } = await registerUser(client, {
      role: 'patient',
      email: 'sc-patient@test.dev',
      phone: '+61400000006',
    });

    await client.post('/plans', {
      token: ownerToken,
      body: { title: 'Owner plan', patientId: patient.id, tasks: [] },
    });
    await client.post('/symptom-checks', {
      token: patientToken,
      body: { input: 'I have crushing chest pain' },
    });

    const ownerView = await client.get('/symptom-checks', { token: ownerToken });
    assert.equal(ownerView.body.checks.length, 1);

    const strangerView = await client.get('/symptom-checks', { token: strangerToken });
    assert.equal(strangerView.body.checks.length, 0);
  } finally {
    await close();
  }
});
