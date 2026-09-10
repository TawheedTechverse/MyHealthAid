import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ApiError } from '../lib/ApiError.js';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  listPlansForUser,
  getPlanForUser,
  assertDoctorOwnsPlan,
} from '../lib/plans.js';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

const taskInput = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().default(''),
  dueDate: z.string().date().optional().nullable(),
});

const createPlanSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().default(''),
  tasks: z.array(taskInput).max(50).optional().default([]),
});

const updatePlanSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(['active', 'completed', 'archived']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ plans: await listPlansForUser(req.user) });
  }),
);

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ plan: await getPlanForUser(req.params.id, req.user) });
  }),
);

router.post(
  '/',
  requireRole('doctor'),
  validate(createPlanSchema),
  asyncHandler(async (req, res) => {
    const { patientId, title, description, tasks } = req.body;

    const patient = await query(
      `SELECT id FROM users WHERE id = $1 AND role = 'patient'`,
      [patientId],
    );
    if (patient.rows.length === 0) {
      throw ApiError.badRequest('Selected patient does not exist');
    }

    const planId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO treatment_plans (doctor_id, patient_id, title, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [req.user.id, patientId, title, description],
      );
      const newId = rows[0].id;

      for (let i = 0; i < tasks.length; i += 1) {
        const t = tasks[i];
        await client.query(
          `INSERT INTO tasks (plan_id, title, description, due_date, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [newId, t.title, t.description, t.dueDate || null, i],
        );
      }
      return newId;
    });

    res.status(201).json({ plan: await getPlanForUser(planId, req.user) });
  }),
);

router.patch(
  '/:id',
  requireRole('doctor'),
  validate(idParam, 'params'),
  validate(updatePlanSchema),
  asyncHandler(async (req, res) => {
    await assertDoctorOwnsPlan(req.params.id, req.user.id);

    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(req.body)) {
      fields.push(`${key} = $${fields.length + 1}`);
      values.push(value);
    }
    values.push(req.params.id);
    await query(
      `UPDATE treatment_plans SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${values.length}`,
      values,
    );

    res.json({ plan: await getPlanForUser(req.params.id, req.user) });
  }),
);

router.delete(
  '/:id',
  requireRole('doctor'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    await assertDoctorOwnsPlan(req.params.id, req.user.id);
    await query('DELETE FROM treatment_plans WHERE id = $1', [req.params.id]);
    res.status(204).end();
  }),
);

router.post(
  '/:id/tasks',
  requireRole('doctor'),
  validate(idParam, 'params'),
  validate(taskInput),
  asyncHandler(async (req, res) => {
    await assertDoctorOwnsPlan(req.params.id, req.user.id);
    const { title, description, dueDate } = req.body;

    const { rows } = await query(
      `SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM tasks WHERE plan_id = $1`,
      [req.params.id],
    );
    await query(
      `INSERT INTO tasks (plan_id, title, description, due_date, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, title, description, dueDate || null, rows[0].next],
    );

    await query('UPDATE treatment_plans SET updated_at = now() WHERE id = $1', [
      req.params.id,
    ]);
    res.status(201).json({ plan: await getPlanForUser(req.params.id, req.user) });
  }),
);

export default router;
