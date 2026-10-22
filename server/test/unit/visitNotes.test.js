import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeVisitNote, assertNoteEditable } from '../../src/lib/visitNotes.js';

test('serializeVisitNote exposes signed:false and no signature when unsigned', () => {
  const row = {
    id: 1,
    doctor_id: 10,
    doctor_name: 'Dr. Reyes',
    patient_id: 20,
    patient_name: 'Ben',
    plan_id: null,
    transcript: 'hello',
    summary: null,
    summary_status: 'none',
    signed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const note = serializeVisitNote(row);
  assert.equal(note.signed, false);
  assert.equal(note.signature, null);
});

test('serializeVisitNote exposes the signature once signed', () => {
  const signedAt = new Date();
  const row = {
    id: 1,
    doctor_id: 10,
    doctor_name: 'Dr. Reyes',
    patient_id: 20,
    patient_name: 'Ben',
    plan_id: null,
    transcript: 'hello',
    summary: null,
    summary_status: 'ready',
    signed_by: 10,
    signed_name: 'Dr. Alice Reyes',
    signed_registration_number: 'MED0001234567',
    signed_at: signedAt,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const note = serializeVisitNote(row);
  assert.equal(note.signed, true);
  assert.deepEqual(note.signature, {
    doctorId: 10,
    fullName: 'Dr. Alice Reyes',
    registrationNumber: 'MED0001234567',
    signedAt,
  });
});

test('assertNoteEditable throws for a signed note and passes for an unsigned one', () => {
  assert.throws(() => assertNoteEditable({ signed_at: new Date() }), /locked/);
  assert.doesNotThrow(() => assertNoteEditable({ signed_at: null }));
});
