import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ApiError } from '../lib/ApiError.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { getPlanForUser } from '../lib/plans.js';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    dueDate: z.string().date().nullable().optional(),
    status: z.enum(['pending', 'done']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

router.use(authenticate);

/**
 * Load the task plus the ids needed for an access check.
 */
async function loadTask(taskId) {
  const { rows } = await query(
    `SELECT t.id, t.plan_id, p.doctor_id, p.patient_id
       FROM tasks t
       JOIN treatment_plans p ON p.id = t.plan_id
      WHERE t.id = $1`,
    [taskId],
  );
  if (rows.length === 0) {
    throw ApiError.notFound('Task not found');
  }
  return rows[0];
}

router.patch(
  '/:id',
  validate(idParam, 'params'),
  validate(updateTaskSchema),
  asyncHandler(async (req, res) => {
    const task = await loadTask(req.params.id);
    const { user } = req;

    const isDoctor = user.role === 'doctor' && String(task.doctor_id) === String(user.id);
    const isPatient = user.role === 'patient' && String(task.patient_id) === String(user.id);
    if (!isDoctor && !isPatient) {
      throw ApiError.forbidden('You do not have access to this task');
    }

    // Patients may only check tasks off / back on.
    const patch = { ...req.body };
    if (isPatient) {
      const keys = Object.keys(patch);
      if (keys.length !== 1 || keys[0] !== 'status') {
        throw ApiError.forbidden('Patients can only update task status');
      }
    }

    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      const column = key === 'dueDate' ? 'due_date' : key;
      fields.push(`${column} = $${fields.length + 1}`);
      values.push(value);
    }

    if (patch.status === 'done') {
      fields.push(`completed_at = now()`);
    } else if (patch.status === 'pending') {
      fields.push(`completed_at = NULL`);
    }

    values.push(req.params.id);
    await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
    await query('UPDATE treatment_plans SET updated_at = now() WHERE id = $1', [task.plan_id]);

    res.json({ plan: await getPlanForUser(task.plan_id, user) });
  }),
);

router.delete(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const task = await loadTask(req.params.id);
    const { user } = req;
    if (!(user.role === 'doctor' && String(task.doctor_id) === String(user.id))) {
      throw ApiError.forbidden('Only the plan owner can delete tasks');
    }
    await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    await query('UPDATE treatment_plans SET updated_at = now() WHERE id = $1', [task.plan_id]);
    res.json({ plan: await getPlanForUser(task.plan_id, user) });
  }),
);

export default router;
