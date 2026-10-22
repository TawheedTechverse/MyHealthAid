import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeClient, resetDb, registerUser, pool } from '../helpers.js';

test('audit log records plan views, grants, and revokes - and cannot be edited or deleted', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);

  try {
    const { token: ownerToken } = await registerUser(client, {
      role: 'doctor',
      email: 'audit-owner@test.dev',
    });
    const { token: otherDocToken } = await registerUser(client, {
      role: 'doctor',
      email: 'audit-other@test.dev',
    });
    const { token: patientToken, user: patient } = await registerUser(client, {
      role: 'patient',
      email: 'audit-patient@test.dev',
      phone: '+61400000002',
    });

    const planRes = await client.post('/plans', {
      token: ownerToken,
      body: { title: 'Audit test plan', patientId: patient.id, tasks: [] },
    });
    const planId = planRes.body.plan.id;

    // Owner views their own plan - this counts as a "view" too.
    await client.get(`/plans/${planId}`, { token: ownerToken });

    // The other doctor requests access; capture the code from the server log
    // (SMS isn't configured in tests).
    let code;
    const originalLog = console.log;
    console.log = (...args) => {
      const match = args.join(' ').match(/: (\d{6})$/);
      if (match) code = match[1];
    };
    try {
      await client.post('/access/request', { token: otherDocToken, body: { patient: patient.email } });
    } finally {
      console.log = originalLog;
    }
    assert.ok(code, 'expected a code to be captured');

    const verify = await client.post('/access/verify', {
      token: otherDocToken,
      body: { patient: patient.email, code },
    });
    assert.equal(verify.status, 200);
    const grantId = verify.body.grant.id;

    // The newly-granted doctor views the plan too.
    await client.get(`/plans/${planId}`, { token: otherDocToken });

    const audit = await client.get('/access/audit', { token: patientToken });
    assert.equal(audit.status, 200);
    const actions = audit.body.entries.map((e) => e.action);
    assert.ok(actions.includes('view'));
    assert.ok(actions.includes('grant'));
    assert.equal(audit.body.entries.filter((e) => e.action === 'view').length, 2);

    // Revoke, which should also be audited.
    await client.post(`/access/grants/${grantId}/revoke`, { token: patientToken });
    const afterRevoke = await client.get('/access/audit', { token: patientToken });
    assert.ok(afterRevoke.body.entries.some((e) => e.action === 'revoke'));

    // No route exists to edit or delete audit entries.
    const entryId = afterRevoke.body.entries[0].id;
    const patchAttempt = await client.patch(`/access/audit/${entryId}`, { token: patientToken, body: {} });
    assert.equal(patchAttempt.status, 404);
    const deleteAttempt = await client.delete(`/access/audit/${entryId}`, { token: patientToken });
    assert.equal(deleteAttempt.status, 404);
  } finally {
    await close();
    await pool.end();
  }
});
