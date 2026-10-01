import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ApiError } from '../lib/ApiError.js';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  listVisitNotes,
  getVisitNoteForUser,
  serializeVisitNote,
  assertDoctorOwnsNote,
} from '../lib/visitNotes.js';
import {
  summarizeTranscript,
  isSummarizerConfigured,
  visitSummarySchema,
} from '../lib/summarize.js';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

const listQuery = z.object({
  patientId: z.coerce.number().int().positive().optional(),
  planId: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive().optional().nullable(),
  transcript: z.string().trim().min(1).max(20_000),
});

const updateSchema = z
  .object({
    transcript: z.string().trim().min(1).max(20_000).optional(),
    summary: visitSummarySchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

router.use(authenticate);

router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({ summarizerConfigured: isSummarizerConfigured() });
  }),
);

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const notes = await listVisitNotes(req.user, req.query);
    res.json({ notes });
  }),
);

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const row = await getVisitNoteForUser(req.params.id, req.user);
    res.json({ note: serializeVisitNote(row) });
  }),
);

/**
 * Run summarization for a note id and persist the outcome. Never throws for a
 * model/API failure - it records `summary_status = 'error'` instead.
 */
async function runSummary(noteId) {
  await query(
    `UPDATE visit_notes SET summary_status = 'pending', summary_error = NULL, updated_at = now()
     WHERE id = $1`,
    [noteId],
  );
  const { rows } = await query('SELECT transcript FROM visit_notes WHERE id = $1', [noteId]);
  try {
    const { summary, model } = await summarizeTranscript(rows[0].transcript);
    await query(
      `UPDATE visit_notes
          SET summary = $2, summary_status = 'ready', summary_error = NULL,
              summary_model = $3, updated_at = now()
        WHERE id = $1`,
      [noteId, summary, model],
    );
  } catch (err) {
    // Without this, a broken summarizer (bad key, wrong model id, network
    // block) only ever shows up as "summary failed" in the UI — nothing
    // lands in the server logs to say why.
    console.error(`Visit note ${noteId} summarization failed:`, err);
    await query(
      `UPDATE visit_notes
          SET summary_status = 'error', summary_error = $2, updated_at = now()
        WHERE id = $1`,
      [noteId, err.message?.slice(0, 500) ?? 'Unknown error'],
    );
  }
}

router.post(
  '/',
  requireRole('doctor'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { patientId, planId, transcript } = req.body;

    const patient = await query(
      `SELECT id FROM users WHERE id = $1 AND role = 'patient'`,
      [patientId],
    );
    if (patient.rows.length === 0) {
      throw ApiError.badRequest('Selected patient does not exist');
    }

    if (planId) {
      const plan = await query(
        'SELECT doctor_id, patient_id FROM treatment_plans WHERE id = $1',
        [planId],
      );
      if (plan.rows.length === 0) {
        throw ApiError.badRequest('Selected plan does not exist');
      }
      if (String(plan.rows[0].doctor_id) !== String(req.user.id)) {
        throw ApiError.forbidden('You do not own that plan');
      }
      if (String(plan.rows[0].patient_id) !== String(patientId)) {
        throw ApiError.badRequest('Plan and patient do not match');
      }
    }

    const { rows } = await query(
      `INSERT INTO visit_notes (doctor_id, patient_id, plan_id, transcript)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.user.id, patientId, planId ?? null, transcript],
    );
    const noteId = rows[0].id;

    if (isSummarizerConfigured()) {
      await runSummary(noteId);
    }

    const row = await getVisitNoteForUser(noteId, req.user);
    res.status(201).json({ note: serializeVisitNote(row) });
  }),
);

router.post(
  '/:id/summarize',
  requireRole('doctor'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    await assertDoctorOwnsNote(req.params.id, req.user.id);
    if (!isSummarizerConfigured()) {
      throw ApiError.badRequest(
        'Summarization is not configured on the server (GEMINI_API_KEY is unset)',
      );
    }
    await runSummary(req.params.id);
    const row = await getVisitNoteForUser(req.params.id, req.user);
    res.json({ note: serializeVisitNote(row) });
  }),
);

router.patch(
  '/:id',
  requireRole('doctor'),
  validate(idParam, 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    await assertDoctorOwnsNote(req.params.id, req.user.id);

    const sets = [];
    const values = [];
    if (req.body.transcript !== undefined) {
      values.push(req.body.transcript);
      sets.push(`transcript = $${values.length}`);
    }
    if (req.body.summary !== undefined) {
      values.push(req.body.summary);
      sets.push(`summary = $${values.length}`);
      sets.push(`summary_status = 'ready'`);
      sets.push(`summary_error = NULL`);
    }
    values.push(req.params.id);
    await query(
      `UPDATE visit_notes SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
      values,
    );

    const row = await getVisitNoteForUser(req.params.id, req.user);
    res.json({ note: serializeVisitNote(row) });
  }),
);

router.delete(
  '/:id',
  requireRole('doctor'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    await assertDoctorOwnsNote(req.params.id, req.user.id);
    await query('DELETE FROM visit_notes WHERE id = $1', [req.params.id]);
    res.status(204).end();
  }),
);

export default router;
