import { query } from '../db/pool.js';
import { ApiError } from './ApiError.js';

/**
 * Shape a raw joined plan row (with task_total / task_done aggregates) into the
 * response object the client expects.
 */
export function serializePlanRow(row) {
  const total = Number(row.task_total ?? 0);
  const done = Number(row.task_done ?? 0);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    doctor: { id: row.doctor_id, fullName: row.doctor_name },
    patient: { id: row.patient_id, fullName: row.patient_name },
    taskTotal: total,
    taskDone: done,
    progress: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

const PLAN_SELECT = `
  SELECT p.*,
         d.full_name AS doctor_name,
         pt.full_name AS patient_name,
         COALESCE(agg.task_total, 0) AS task_total,
         COALESCE(agg.task_done, 0)  AS task_done
    FROM treatment_plans p
    JOIN users d  ON d.id = p.doctor_id
    JOIN users pt ON pt.id = p.patient_id
    LEFT JOIN (
      SELECT plan_id,
             COUNT(*) AS task_total,
             COUNT(*) FILTER (WHERE status = 'done') AS task_done
        FROM tasks
       GROUP BY plan_id
    ) agg ON agg.plan_id = p.id
`;

/**
 * List plans visible to a user. Doctors see plans they own; patients see plans
 * assigned to them.
 */
export async function listPlansForUser(user) {
  const column = user.role === 'doctor' ? 'p.doctor_id' : 'p.patient_id';
  const { rows } = await query(
    `${PLAN_SELECT} WHERE ${column} = $1 ORDER BY p.status = 'active' DESC, p.updated_at DESC`,
    [user.id],
  );
  return rows.map(serializePlanRow);
}

/**
 * Fetch a single plan (with tasks) if the user is a participant, else throw.
 * @returns {Promise<object>}
 */
export async function getPlanForUser(planId, user) {
  const { rows } = await query(`${PLAN_SELECT} WHERE p.id = $1`, [planId]);
  if (rows.length === 0) {
    throw ApiError.notFound('Plan not found');
  }
  const row = rows[0];
  const isParticipant =
    (user.role === 'doctor' && String(row.doctor_id) === String(user.id)) ||
    (user.role === 'patient' && String(row.patient_id) === String(user.id));
  if (!isParticipant) {
    throw ApiError.forbidden('You do not have access to this plan');
  }

  const { rows: taskRows } = await query(
    `SELECT id, title, description, due_date, status, completed_at, sort_order
       FROM tasks WHERE plan_id = $1
      ORDER BY sort_order, id`,
    [planId],
  );

  return {
    ...serializePlanRow(row),
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      dueDate: t.due_date,
      status: t.status,
      completedAt: t.completed_at,
      sortOrder: t.sort_order,
    })),
  };
}

/**
 * Load a plan and assert the given doctor owns it. Used for mutations.
 */
export async function assertDoctorOwnsPlan(planId, doctorId) {
  const { rows } = await query(
    'SELECT id, doctor_id FROM treatment_plans WHERE id = $1',
    [planId],
  );
  if (rows.length === 0) {
    throw ApiError.notFound('Plan not found');
  }
  if (String(rows[0].doctor_id) !== String(doctorId)) {
    throw ApiError.forbidden('Only the plan owner can change it');
  }
}
