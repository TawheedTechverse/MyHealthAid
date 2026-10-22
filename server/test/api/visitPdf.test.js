import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer, makeClient, resetDb, registerUser, pool } from '../helpers.js';

test('signing a note delivers a PDF (saved locally, since SMTP is off in tests); patient and doctor can both download it', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);

  try {
    const { token: doctorToken } = await registerUser(client, {
      role: 'doctor',
      email: 'pdf-doctor@test.dev',
    });
    const { token: patientToken, user: patient } = await registerUser(client, {
      role: 'patient',
      email: 'pdf-patient@test.dev',
      phone: '+61400000003',
    });

    const create = await client.post('/visit-notes', {
      token: doctorToken,
      body: { patientId: patient.id, transcript: 'Patient reports mild back pain.' },
    });
    const noteId = create.body.note.id;

    // A draft note has no PDF yet.
    const draftPdf = await client.get(`/visit-notes/${noteId}/pdf`, { token: doctorToken });
    assert.equal(draftPdf.status, 400);

    await client.patch(`/visit-notes/${noteId}`, {
      token: doctorToken,
      body: {
        summary: {
          chiefComplaint: 'Back pain',
          historyOfPresentIllness: 'Mild, 3 days',
          assessment: 'Muscular strain',
          plan: 'Rest, stretching',
          followUp: 'PRN',
          medications: [],
        },
      },
    });
    await client.patch('/auth/profile', {
      token: doctorToken,
      body: { medicalRegistrationNumber: 'MED0001234567' },
    });

    const sign = await client.post(`/visit-notes/${noteId}/sign`, {
      token: doctorToken,
      body: { password: 'password123' },
    });
    assert.equal(sign.status, 200);
    assert.equal(sign.body.note.pdfEmail.status, 'sent');
    assert.equal(sign.body.note.pdfEmail.savedLocally, true);

    const { rows } = await pool.query('SELECT pdf_saved_path FROM visit_notes WHERE id = $1', [noteId]);
    assert.ok(existsSync(rows[0].pdf_saved_path), 'expected the PDF to be saved to server/tmp');

    for (const token of [doctorToken, patientToken]) {
      const res = await fetch(`${baseURL}/visit-notes/${noteId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-');
    }

    const retry = await client.post(`/visit-notes/${noteId}/pdf/retry`, { token: doctorToken });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.note.pdfEmail.status, 'sent');
  } finally {
    await close();
    await pool.end();
  }
});
