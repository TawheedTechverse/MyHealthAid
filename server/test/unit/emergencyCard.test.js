import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { pool } from '../../src/db/pool.js';
import { buildEmergencyCard, verifyEmergencyCard } from '../../src/lib/emergencyCard.js';

after(() => pool.end());

async function makePatient(overrides = {}) {
  const hash = await bcrypt.hash('password123', 10);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, phone, allergies)
     VALUES ($1, $2, $3, 'patient', $4, $5)
     RETURNING id`,
    [
      overrides.email ?? `ec-${Math.random().toString(36).slice(2)}@test.dev`,
      hash,
      overrides.fullName ?? 'Test Patient',
      overrides.phone ?? '+61400000000',
      overrides.allergies ?? null,
    ],
  );
  return rows[0].id;
}

test('buildEmergencyCard returns null for a non-existent patient', async () => {
  assert.equal(await buildEmergencyCard(999999999), null);
});

test('a freshly built card verifies, and tampering with its data invalidates the signature', async () => {
  const patientId = await makePatient({ allergies: 'Penicillin' });
  const card = await buildEmergencyCard(patientId);
  assert.equal(card.data.allergies, 'Penicillin');
  assert.equal(card.data.medications.length, 0);
  assert.equal(card.data.latestVisitDate, null);

  assert.equal((await verifyEmergencyCard(card)).verified, true);

  const tampered = { data: { ...card.data, allergies: 'Nothing' }, signature: card.signature };
  const result = await verifyEmergencyCard(tampered);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'Invalid signature');
});

test('bumping emergency_card_version revokes a previously issued card', async () => {
  const patientId = await makePatient();
  const card = await buildEmergencyCard(patientId);
  assert.equal((await verifyEmergencyCard(card)).verified, true);

  await pool.query(
    'UPDATE users SET emergency_card_version = emergency_card_version + 1 WHERE id = $1',
    [patientId],
  );

  const result = await verifyEmergencyCard(card);
  assert.equal(result.verified, false);
  assert.match(result.reason, /revoked/);
});
