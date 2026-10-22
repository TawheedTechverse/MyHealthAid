import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordAudit } from '../../src/lib/audit.js';
import { pool } from '../../src/db/pool.js';

test('recordAudit swallows errors instead of throwing (e.g. an unknown record_type)', async () => {
  await assert.doesNotReject(
    recordAudit({
      doctorId: 1,
      patientId: 1,
      recordType: 'not-a-real-type',
      recordId: 1,
      action: 'view',
    }),
  );
  await pool.end();
});
