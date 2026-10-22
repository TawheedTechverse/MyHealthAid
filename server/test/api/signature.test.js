import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeClient, resetDb, registerUser, pool } from '../helpers.js';

test('doctor signature: sign/unsign flow and locking', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);

  try {
    const { token: doctorToken } = await registerUser(client, {
      role: 'doctor',
      email: 'sig-doctor@test.dev',
      password: 'password123',
    });
    const { user: patient } = await registerUser(client, {
      role: 'patient',
      email: 'sig-patient@test.dev',
    });

    const create = await client.post('/visit-notes', {
      token: doctorToken,
      body: { patientId: patient.id, transcript: 'Patient reports mild headache, resolving.' },
    });
    assert.equal(create.status, 201);
    const noteId = create.body.note.id;
    assert.equal(create.body.note.signed, false);

    // Can't sign without a reviewed (ready) summary.
    const signNoSummary = await client.post(`/visit-notes/${noteId}/sign`, {
      token: doctorToken,
      body: { password: 'password123' },
    });
    assert.equal(signNoSummary.status, 400);

    // Give it a "reviewed" summary via PATCH (summarizer isn't configured in tests).
    await client.patch(`/visit-notes/${noteId}`, {
      token: doctorToken,
      body: {
        summary: {
          chiefComplaint: 'Headache',
          historyOfPresentIllness: 'Mild, resolving',
          assessment: 'Tension headache',
          plan: 'Rest, fluids',
          followUp: 'PRN',
          medications: [],
        },
      },
    });

    // Can't sign before a registration number is set.
    const signNoReg = await client.post(`/visit-notes/${noteId}/sign`, {
      token: doctorToken,
      body: { password: 'password123' },
    });
    assert.equal(signNoReg.status, 400);
    assert.match(signNoReg.body.error, /registration number/);

    const setReg = await client.patch('/auth/profile', {
      token: doctorToken,
      body: { medicalRegistrationNumber: 'MED0001234567' },
    });
    assert.equal(setReg.status, 200);

    // Wrong password is rejected.
    const wrongPassword = await client.post(`/visit-notes/${noteId}/sign`, {
      token: doctorToken,
      body: { password: 'wrong-password' },
    });
    assert.equal(wrongPassword.status, 401);

    const sign = await client.post(`/visit-notes/${noteId}/sign`, {
      token: doctorToken,
      body: { password: 'password123' },
    });
    assert.equal(sign.status, 200);
    assert.equal(sign.body.note.signed, true);
    assert.equal(sign.body.note.signature.registrationNumber, 'MED0001234567');

    // Signed notes are locked: edits, regeneration, and deletion are all rejected.
    const editLocked = await client.patch(`/visit-notes/${noteId}`, {
      token: doctorToken,
      body: { transcript: 'Edited after signing' },
    });
    assert.equal(editLocked.status, 403);

    const deleteLocked = await client.delete(`/visit-notes/${noteId}`, { token: doctorToken });
    assert.equal(deleteLocked.status, 403);

    // Unsigning requires the password again, then unlocks the note.
    const unsign = await client.post(`/visit-notes/${noteId}/unsign`, {
      token: doctorToken,
      body: { password: 'password123' },
    });
    assert.equal(unsign.status, 200);
    assert.equal(unsign.body.note.signed, false);

    const editAfterUnsign = await client.patch(`/visit-notes/${noteId}`, {
      token: doctorToken,
      body: { transcript: 'Edited after unsigning' },
    });
    assert.equal(editAfterUnsign.status, 200);
  } finally {
    await close();
    await pool.end();
  }
});
