import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { config } from '../config/env.js';

function sign(data) {
  return crypto.createHmac('sha256', config.emergencyCardSecret).update(JSON.stringify(data)).digest('hex');
}

/**
 * Builds a signed emergency-card payload for offline access: allergies,
 * current medications (from the most recent "ready" visit summary, a
 * signed one preferred over a draft), latest visit date, and doctor name.
 * @returns {Promise<{ data: object, signature: string } | null>} null if the patient doesn't exist
 */
export async function buildEmergencyCard(patientId) {
  const { rows: userRows } = await query(
    `SELECT full_name, allergies, emergency_card_version
       FROM users WHERE id = $1 AND role = 'patient'`,
    [patientId],
  );
  if (userRows.length === 0) {
    return null;
  }
  const user = userRows[0];

  const { rows: noteRows } = await query(
    `SELECT summary, signed_name, created_at
       FROM visit_notes
      WHERE patient_id = $1 AND summary_status = 'ready'
      ORDER BY (signed_at IS NOT NULL) DESC, created_at DESC
      LIMIT 1`,
    [patientId],
  );
  const note = noteRows[0];

  const data = {
    v: user.emergency_card_version,
    patientId,
    patientName: user.full_name,
    allergies: user.allergies || 'None recorded',
    medications: note?.summary?.medications ?? [],
    latestVisitDate: note?.created_at ?? null,
    doctorName: note?.signed_name ?? null,
    issuedAt: new Date().toISOString(),
  };
  return { data, signature: sign(data) };
}

/**
 * Checks a scanned card's HMAC signature and its version against the
 * patient's current emergency_card_version (so a blocked/reissued card
 * reads as revoked once the verifier is online).
 * @returns {Promise<{ verified: boolean, reason?: string }>}
 */
export async function verifyEmergencyCard(card) {
  if (!card || typeof card !== 'object' || !card.data || typeof card.signature !== 'string') {
    return { verified: false, reason: 'Malformed card data' };
  }
  if (sign(card.data) !== card.signature) {
    return { verified: false, reason: 'Invalid signature' };
  }

  const { rows } = await query('SELECT emergency_card_version FROM users WHERE id = $1', [
    card.data.patientId,
  ]);
  if (rows.length === 0) {
    return { verified: false, reason: 'Unknown patient' };
  }
  if (rows[0].emergency_card_version !== card.data.v) {
    return { verified: false, reason: 'This card has been revoked - a newer one has been issued' };
  }
  return { verified: true };
}
