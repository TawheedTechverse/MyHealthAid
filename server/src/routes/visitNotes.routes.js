import { Router } from 'express';
import bcrypt from 'bcryptjs';
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
  assertNoteEditable,
} from '../lib/visitNotes.js';
import { recordAudit } from '../lib/audit.js';
import { deliverVisitPdf } from '../lib/visitPdfDelivery.js';
import { generateVisitPdf } from '../lib/pdf.js';
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

const passwordSchema = z.object({ password: z.string().min(1) });

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
    if (req.user.role === 'doctor') {
      await recordAudit({
        doctorId: req.user.id,
        patientId: row.patient_id,
        recordType: 'visit_note',
        recordId: row.id,
        action: 'view',
      });
    }
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
    const note = await assertDoctorOwnsNote(req.params.id, req.user.id);
    assertNoteEditable(note);
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
    const note = await assertDoctorOwnsNote(req.params.id, req.user.id);
    assertNoteEditable(note);

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
    const note = await assertDoctorOwnsNote(req.params.id, req.user.id);
    assertNoteEditable(note);
    await query('DELETE FROM visit_notes WHERE id = $1', [req.params.id]);
    res.status(204).end();
  }),
);

/**
 * Finalize a reviewed summary: the doctor re-enters their password and the
 * note is stamped with their name, registration number, and the time, then
 * locked against further edits.
 */
router.post(
  '/:id/sign',
  requireRole('doctor'),
  validate(idParam, 'params'),
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const note = await assertDoctorOwnsNote(req.params.id, req.user.id);
    if (note.signed_at) {
      throw ApiError.conflict('This note is already signed');
    }
    if (note.summary_status !== 'ready') {
      throw ApiError.badRequest('Only a note with a reviewed summary can be signed');
    }

    const { rows } = await query(
      'SELECT password_hash, full_name, medical_registration_number FROM users WHERE id = $1',
      [req.user.id],
    );
    const doctor = rows[0];
    if (!doctor.medical_registration_number) {
      throw ApiError.badRequest(
        'Set your medical registration number in your profile before signing notes',
      );
    }
    const ok = await bcrypt.compare(req.body.password, doctor.password_hash);
    if (!ok) {
      throw ApiError.unauthorized('Incorrect password');
    }

    await query(
      `UPDATE visit_notes
          SET signed_by = $2, signed_name = $3, signed_registration_number = $4, signed_at = now()
        WHERE id = $1`,
      [req.params.id, req.user.id, doctor.full_name, doctor.medical_registration_number],
    );

    // A failed/slow email never undoes the signature above - it only
    // affects pdf_email_*, which the doctor can see and retry.
    await deliverVisitPdf(req.params.id);

    const row = await getVisitNoteForUser(req.params.id, req.user);
    res.json({ note: serializeVisitNote(row) });
  }),
);

/** Re-attempts generating/emailing the PDF (e.g. after a failed send). */
router.post(
  '/:id/pdf/retry',
  requireRole('doctor'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const note = await assertDoctorOwnsNote(req.params.id, req.user.id);
    if (!note.signed_at) {
      throw ApiError.badRequest('Only a signed note has a PDF to deliver');
    }
    await deliverVisitPdf(req.params.id);
    const row = await getVisitNoteForUser(req.params.id, req.user);
    res.json({ note: serializeVisitNote(row) });
  }),
);

/** Streams a freshly-generated PDF of a signed note to any participant (doctor or patient). */
router.get(
  '/:id/pdf',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const row = await getVisitNoteForUser(req.params.id, req.user);
    const note = serializeVisitNote(row);
    if (!note.signed) {
      throw ApiError.badRequest('Only a signed note has a PDF');
    }
    const pdfBuffer = await generateVisitPdf(note);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="visit-note-${note.id}.pdf"`);
    res.send(pdfBuffer);
  }),
);

/** Unsign: same doctor, password required again, clears the signature and unlocks the note. */
router.post(
  '/:id/unsign',
  requireRole('doctor'),
  validate(idParam, 'params'),
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const note = await assertDoctorOwnsNote(req.params.id, req.user.id);
    if (!note.signed_at) {
      throw ApiError.badRequest('This note is not signed');
    }

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const ok = await bcrypt.compare(req.body.password, rows[0].password_hash);
    if (!ok) {
      throw ApiError.unauthorized('Incorrect password');
    }

    await query(
      `UPDATE visit_notes
          SET signed_by = NULL, signed_name = NULL, signed_registration_number = NULL, signed_at = NULL
        WHERE id = $1`,
      [req.params.id],
    );

    const row = await getVisitNoteForUser(req.params.id, req.user);
    res.json({ note: serializeVisitNote(row) });
  }),
);

export default router;
