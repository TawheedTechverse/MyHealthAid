import { query } from '../db/pool.js';
import { ApiError } from './ApiError.js';

const NOTE_SELECT = `
  SELECT vn.*,
         d.full_name  AS doctor_name,
         pt.full_name AS patient_name,
         p.title      AS plan_title
    FROM visit_notes vn
    JOIN users d  ON d.id = vn.doctor_id
    JOIN users pt ON pt.id = vn.patient_id
    LEFT JOIN treatment_plans p ON p.id = vn.plan_id
`;

export function serializeVisitNote(row) {
  return {
    id: row.id,
    doctor: { id: row.doctor_id, fullName: row.doctor_name },
    patient: { id: row.patient_id, fullName: row.patient_name },
    plan: row.plan_id ? { id: row.plan_id, title: row.plan_title } : null,
    transcript: row.transcript,
    summary: row.summary ?? null,
    summaryStatus: row.summary_status,
    summaryError: row.summary_error ?? null,
    summaryModel: row.summary_model ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List notes visible to a user, optionally filtered by patient and/or plan.
 * Doctors see notes they authored; patients see notes about themselves.
 */
export async function listVisitNotes(user, { patientId, planId } = {}) {
  const where = [];
  const params = [];

  if (user.role === 'doctor') {
    params.push(user.id);
    where.push(`vn.doctor_id = $${params.length}`);
  } else {
    params.push(user.id);
    where.push(`vn.patient_id = $${params.length}`);
  }
  if (patientId) {
    params.push(patientId);
    where.push(`vn.patient_id = $${params.length}`);
  }
  if (planId) {
    params.push(planId);
    where.push(`vn.plan_id = $${params.length}`);
  }

  const { rows } = await query(
    `${NOTE_SELECT} WHERE ${where.join(' AND ')} ORDER BY vn.created_at DESC LIMIT 100`,
    params,
  );
  return rows.map(serializeVisitNote);
}

/** Fetch one note if the user is a participant, else throw. */
export async function getVisitNoteForUser(id, user) {
  const { rows } = await query(`${NOTE_SELECT} WHERE vn.id = $1`, [id]);
  if (rows.length === 0) {
    throw ApiError.notFound('Visit note not found');
  }
  const row = rows[0];
  const isParticipant =
    (user.role === 'doctor' && String(row.doctor_id) === String(user.id)) ||
    (user.role === 'patient' && String(row.patient_id) === String(user.id));
  if (!isParticipant) {
    throw ApiError.forbidden('You do not have access to this visit note');
  }
  return row;
}

/** Load a note and assert the doctor authored it. Used for mutations. */
export async function assertDoctorOwnsNote(id, doctorId) {
  const { rows } = await query(
    'SELECT id, doctor_id FROM visit_notes WHERE id = $1',
    [id],
  );
  if (rows.length === 0) {
    throw ApiError.notFound('Visit note not found');
  }
  if (String(rows[0].doctor_id) !== String(doctorId)) {
    throw ApiError.forbidden('Only the note author can change it');
  }
}
