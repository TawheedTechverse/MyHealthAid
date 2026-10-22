import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { ApiError } from './ApiError.js';
import { sendSms, isSmsConfigured } from './sms.js';

const CODE_EXPIRY_MINUTES = 10;
const GRANT_DAYS = 30;
const MAX_ATTEMPTS = 3;

export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** True if the doctor has a current (not revoked, not expired) grant for this patient. */
export async function hasActiveGrant(doctorId, patientId) {
  const { rows } = await query(
    `SELECT 1 FROM access_grants
      WHERE doctor_id = $1 AND patient_id = $2
        AND revoked_at IS NULL AND expires_at > now()`,
    [doctorId, patientId],
  );
  return rows.length > 0;
}

/** True if the doctor already has a direct relationship (a plan or a visit note) with the patient. */
export async function doctorAlreadyTreats(doctorId, patientId) {
  const { rows } = await query(
    `SELECT 1 FROM treatment_plans WHERE doctor_id = $1 AND patient_id = $2
     UNION
     SELECT 1 FROM visit_notes WHERE doctor_id = $1 AND patient_id = $2`,
    [doctorId, patientId],
  );
  return rows.length > 0;
}

/** Creates a fresh verification code, invalidating any earlier pending one for this pair, and sends/logs it. */
export async function createAccessRequest(doctor, patient) {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60_000);

  await query(
    `UPDATE access_requests SET consumed_at = now()
      WHERE doctor_id = $1 AND patient_id = $2 AND consumed_at IS NULL`,
    [doctor.id, patient.id],
  );
  await query(
    `INSERT INTO access_requests (doctor_id, patient_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [doctor.id, patient.id, codeHash, expiresAt],
  );

  const message =
    `MyHealthAid: Dr. ${doctor.fullName} is requesting access to your records. ` +
    `Your verification code is ${code}. It expires in 10 minutes.`;

  if (isSmsConfigured()) {
    await sendSms(patient.phone, message);
  } else {
    console.log(`[access] Verification code for ${patient.email} (requested by ${doctor.email}): ${code}`);
  }
}

/**
 * Checks a submitted code against the latest pending request for this pair.
 * On success, grants (or refreshes) 30 days of read access and returns the grant row.
 */
export async function verifyAccessCode(doctor, patient, code) {
  const { rows } = await query(
    `SELECT * FROM access_requests
      WHERE doctor_id = $1 AND patient_id = $2 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [doctor.id, patient.id],
  );
  if (rows.length === 0) {
    throw ApiError.badRequest('No pending verification code for this patient. Request access again.');
  }
  const request = rows[0];

  if (new Date(request.expires_at) < new Date()) {
    throw ApiError.badRequest('That code has expired. Request access again.');
  }
  if (request.attempts >= MAX_ATTEMPTS) {
    throw ApiError.forbidden('Too many incorrect attempts. Request access again.');
  }

  const ok = await bcrypt.compare(code, request.code_hash);
  if (!ok) {
    const attempts = request.attempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await query(
      `UPDATE access_requests SET attempts = $2, consumed_at = ${locked ? 'now()' : 'NULL'} WHERE id = $1`,
      [request.id, attempts],
    );
    if (locked) {
      throw ApiError.forbidden('Too many incorrect attempts. Request access again.');
    }
    throw ApiError.unauthorized(`Incorrect code. ${MAX_ATTEMPTS - attempts} attempt(s) left.`);
  }

  await query('UPDATE access_requests SET consumed_at = now() WHERE id = $1', [request.id]);

  const expiresAt = new Date(Date.now() + GRANT_DAYS * 24 * 60 * 60_000);
  const { rows: grantRows } = await query(
    `INSERT INTO access_grants (doctor_id, patient_id, granted_at, expires_at)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (doctor_id, patient_id)
     DO UPDATE SET granted_at = now(), expires_at = $3, revoked_at = NULL
     RETURNING *`,
    [doctor.id, patient.id, expiresAt],
  );
  return grantRows[0];
}
