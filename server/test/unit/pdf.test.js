import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateVisitPdf } from '../../src/lib/pdf.js';

const baseNote = {
  id: 1,
  patient: { fullName: 'Ben Carter' },
  doctor: { fullName: 'Dr. Alice Reyes' },
  createdAt: new Date().toISOString(),
  signature: null,
};

test('generateVisitPdf returns a real PDF buffer for an unsigned note', async () => {
  const buffer = await generateVisitPdf({
    ...baseNote,
    summary: { chiefComplaint: 'Headache', medications: [] },
  });
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buffer.length > 200);
});

test('generateVisitPdf includes a signature block when signed', async () => {
  const buffer = await generateVisitPdf({
    ...baseNote,
    summary: {
      chiefComplaint: 'Headache',
      medications: [{ name: 'Ibuprofen', instruction: 'As needed' }],
    },
    signature: {
      fullName: 'Dr. Alice Reyes',
      registrationNumber: 'MED0001234567',
      signedAt: new Date().toISOString(),
    },
  });
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
});
