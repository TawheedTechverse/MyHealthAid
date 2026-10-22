import { query } from '../db/pool.js';

/**
 * Records one audit entry. Swallows and logs errors so a logging failure
 * never breaks the read/grant/revoke action that triggered it.
 * @param {{ doctorId: number, patientId: number, recordType: 'plan'|'visit_note'|'access_grant',
 *           recordId: number|null, action: 'view'|'grant'|'revoke' }} entry
 */
export async function recordAudit({ doctorId, patientId, recordType, recordId, action }) {
  try {
    await query(
      `INSERT INTO audit_log (doctor_id, patient_id, record_type, record_id, action)
       VALUES ($1, $2, $3, $4, $5)`,
      [doctorId, patientId, recordType, recordId ?? null, action],
    );
  } catch (err) {
    console.error('Failed to record audit log entry:', err);
  }
}

/** Newest-first audit trail for a patient's own records. */
export async function listAuditForPatient(patientId) {
  const { rows } = await query(
    `SELECT a.*, d.full_name AS doctor_name, d.email AS doctor_email
       FROM audit_log a
       JOIN users d ON d.id = a.doctor_id
      WHERE a.patient_id = $1
      ORDER BY a.created_at DESC
      LIMIT 200`,
    [patientId],
  );
  return rows.map((r) => ({
    id: r.id,
    doctor: { id: r.doctor_id, fullName: r.doctor_name, email: r.doctor_email },
    recordType: r.record_type,
    recordId: r.record_id,
    action: r.action,
    createdAt: r.created_at,
  }));
}
