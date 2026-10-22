import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeClient, resetDb, registerUser, pool } from '../helpers.js';

after(() => pool.end());

test('emergency card: verify, block, and the old card is revoked while a fresh one verifies', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);

  try {
    const { token: patientToken } = await registerUser(client, {
      role: 'patient',
      email: 'ec-patient@test.dev',
      phone: '+61400000007',
    });
    const { token: doctorToken } = await registerUser(client, { role: 'doctor', email: 'ec-doctor@test.dev' });

    const getCard = await client.get('/emergency-card', { token: patientToken });
    assert.equal(getCard.status, 200);
    const originalCard = getCard.body.card;
    assert.ok(originalCard.signature);

    // Any doctor can verify, even one who has never treated this patient.
    const verify = await client.post('/emergency-card/verify', { token: doctorToken, body: { card: originalCard } });
    assert.equal(verify.status, 200);
    assert.equal(verify.body.verified, true);

    // A patient cannot call the doctor-only verify endpoint.
    const patientVerifyAttempt = await client.post('/emergency-card/verify', {
      token: patientToken,
      body: { card: originalCard },
    });
    assert.equal(patientVerifyAttempt.status, 403);

    const block = await client.post('/emergency-card/block', { token: patientToken });
    assert.equal(block.status, 200);
    const newCard = block.body.card;
    assert.notEqual(newCard.signature, originalCard.signature);

    const verifyOld = await client.post('/emergency-card/verify', { token: doctorToken, body: { card: originalCard } });
    assert.equal(verifyOld.body.verified, false);
    assert.match(verifyOld.body.reason, /revoked/);

    const verifyNew = await client.post('/emergency-card/verify', { token: doctorToken, body: { card: newCard } });
    assert.equal(verifyNew.body.verified, true);

    // A tampered card fails on signature, not just version.
    const tampered = { data: { ...newCard.data, allergies: 'Forged' }, signature: newCard.signature };
    const verifyTampered = await client.post('/emergency-card/verify', { token: doctorToken, body: { card: tampered } });
    assert.equal(verifyTampered.body.verified, false);
    assert.equal(verifyTampered.body.reason, 'Invalid signature');
  } finally {
    await close();
  }
});
