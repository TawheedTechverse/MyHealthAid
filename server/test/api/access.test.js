import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeClient, resetDb, registerUser, pool } from '../helpers.js';

/** Captures console.log lines during `fn`, restoring console.log afterwards. */
async function captureLogs(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}

test('2FA access request/verify flow, then the grant unlocks (and revoke re-locks) read access', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);

  try {
    const { token: ownerToken } = await registerUser(client, {
      role: 'doctor',
      email: 'owner-doc@test.dev',
    });
    const { token: newDocToken } = await registerUser(client, {
      role: 'doctor',
      email: 'new-doc@test.dev',
    });
    const { token: patientToken, user: patient } = await registerUser(client, {
      role: 'patient',
      email: 'access-patient@test.dev',
      phone: '+61400000001',
    });

    // The owning doctor creates a plan for the patient.
    const planRes = await client.post('/plans', {
      token: ownerToken,
      body: { title: 'Owner plan', patientId: patient.id, tasks: [] },
    });
    assert.equal(planRes.status, 201);
    const planId = planRes.body.plan.id;

    // Before any grant, the new doctor can't see the plan.
    const forbidden = await client.get(`/plans/${planId}`, { token: newDocToken });
    assert.equal(forbidden.status, 403);

    // Request access, capturing the code the server logs (SMS isn't configured in tests).
    const logs = await captureLogs(() =>
      client.post('/access/request', { token: newDocToken, body: { patient: patient.email } }),
    );
    const logLine = logs.find((l) => l.includes('[access] Verification code'));
    assert.ok(logLine, 'expected the code to be logged');
    const code = logLine.match(/: (\d{6})$/)[1];

    // Wrong code is rejected and counts an attempt.
    const wrong = await client.post('/access/verify', {
      token: newDocToken,
      body: { patient: patient.email, code: '000000' },
    });
    assert.equal(wrong.status, 401);

    const verify = await client.post('/access/verify', {
      token: newDocToken,
      body: { patient: patient.email, code },
    });
    assert.equal(verify.status, 200);
    assert.equal(String(verify.body.grant.patientId), String(patient.id));

    // Now the new doctor can read the plan, and it shows up in their list.
    const allowed = await client.get(`/plans/${planId}`, { token: newDocToken });
    assert.equal(allowed.status, 200);

    const list = await client.get('/plans', { token: newDocToken });
    assert.ok(list.body.plans.some((p) => p.id === planId));

    // The patient sees the grant and can revoke it.
    const grants = await client.get('/access/grants', { token: patientToken });
    assert.equal(grants.body.grants.length, 1);
    assert.equal(grants.body.grants[0].active, true);
    const grantId = grants.body.grants[0].id;

    const revoke = await client.post(`/access/grants/${grantId}/revoke`, { token: patientToken });
    assert.equal(revoke.status, 204);

    const afterRevoke = await client.get(`/plans/${planId}`, { token: newDocToken });
    assert.equal(afterRevoke.status, 403);
  } finally {
    await close();
    await pool.end();
  }
});
