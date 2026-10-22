import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { detectRedFlags, checkSymptom } from '../lib/symptomChecker.js';
import { config } from '../config/env.js';

const router = Router();

const createSchema = z.object({ input: z.string().trim().min(3).max(2000) });
const listQuery = z.object({ patientId: z.coerce.number().int().positive().optional() });

function serialize(row) {
  return {
    id: row.id,
    patient: { id: row.patient_id, fullName: row.patient_name ?? undefined },
    input: row.input,
    redFlag: row.red_flag,
    urgency: row.urgency,
    advice: row.advice,
    reasons: row.reasons ?? [],
    model: row.model,
    createdAt: row.created_at,
  };
}

router.use(authenticate);

router.post(
  '/',
  requireRole('patient'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { input } = req.body;
    const redFlags = detectRedFlags(input);

    let result;
    let model = null;
    if (redFlags.matched) {
      // Red flags never reach the AI.
      result = {
        urgency: 'urgent',
        advice:
          'Call Triple Zero (000) or go to the nearest emergency department.' +
          (redFlags.suicide
            ? ' If you are having thoughts of suicide or self-harm, you can also call Lifeline on 13 11 14, 24/7.'
            : ''),
        reasons: redFlags.flags,
      };
    } else {
      const { rows: planRows } = await query(
        `SELECT title, description FROM treatment_plans
          WHERE patient_id = $1 AND status = 'active'
          ORDER BY updated_at DESC LIMIT 1`,
        [req.user.id],
      );
      const { rows: noteRows } = await query(
        `SELECT summary FROM visit_notes
          WHERE patient_id = $1 AND summary_status = 'ready'
          ORDER BY created_at DESC LIMIT 1`,
        [req.user.id],
      );
      result = await checkSymptom(input, {
        activePlan: planRows[0] ?? null,
        latestSummary: noteRows[0]?.summary ?? null,
      });
      model = config.geminiApiKey ? config.summaryModel : null;
    }

    const { rows } = await query(
      `INSERT INTO symptom_checks (patient_id, input, red_flag, urgency, advice, reasons, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, input, redFlags.matched, result.urgency, result.advice, JSON.stringify(result.reasons ?? []), model],
    );

    res.status(201).json({
      check: serialize(rows[0]),
      emergency: redFlags.matched ? { callTripleZero: true, lifeline: redFlags.suicide } : null,
    });
  }),
);

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    if (req.user.role === 'patient') {
      const { rows } = await query(
        `SELECT * FROM symptom_checks WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [req.user.id],
      );
      res.json({ checks: rows.map(serialize) });
      return;
    }

    const params = [req.user.id];
    let patientFilter = '';
    if (req.query.patientId) {
      params.push(req.query.patientId);
      patientFilter = ` AND sc.patient_id = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT sc.*, pt.full_name AS patient_name
         FROM symptom_checks sc
         JOIN users pt ON pt.id = sc.patient_id
        WHERE sc.patient_id IN (
          SELECT patient_id FROM treatment_plans WHERE doctor_id = $1
          UNION
          SELECT patient_id FROM visit_notes WHERE doctor_id = $1
          UNION
          SELECT patient_id FROM access_grants
           WHERE doctor_id = $1 AND revoked_at IS NULL AND expires_at > now()
        )${patientFilter}
        ORDER BY sc.created_at DESC
        LIMIT 100`,
      params,
    );
    res.json({ checks: rows.map(serialize) });
  }),
);

export default router;
