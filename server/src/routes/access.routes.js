import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ApiError } from '../lib/ApiError.js';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { createAccessRequest, verifyAccessCode, doctorAlreadyTreats, hasActiveGrant } from '../lib/access.js';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });
const requestSchema = z.object({ patient: z.string().trim().min(1).max(160) });
const verifySchema = requestSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

router.use(authenticate);

/** Accepts a numeric patient id or an email address. */
async function findPatientByIdentifier(identifier) {
  const isNumeric = /^\d+$/.test(identifier);
  const { rows } = await query(
    `SELECT id, email, full_name, phone FROM users
      WHERE role = 'patient' AND (${isNumeric ? 'id = $1::bigint' : 'email = $1'})`,
    [isNumeric ? identifier : identifier.toLowerCase()],
  );
  if (rows.length === 0) {
    throw ApiError.notFound('No patient found with that email or ID');
  }
  return rows[0];
}

router.post(
  '/request',
  requireRole('doctor'),
  validate(requestSchema),
  asyncHandler(async (req, res) => {
    const patient = await findPatientByIdentifier(req.body.patient);

    if (await doctorAlreadyTreats(req.user.id, patient.id)) {
      throw ApiError.conflict('You already treat this patient');
    }
    if (await hasActiveGrant(req.user.id, patient.id)) {
      throw ApiError.conflict('You already have access to this patient');
    }
    if (!patient.phone) {
      throw ApiError.badRequest('This patient has not set a phone number yet');
    }

    await createAccessRequest(req.user, patient);
    res.status(201).json({ message: 'A verification code was sent to the patient', patientId: patient.id });
  }),
);

router.post(
  '/verify',
  requireRole('doctor'),
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const patient = await findPatientByIdentifier(req.body.patient);
    const grant = await verifyAccessCode(req.user, patient, req.body.code);
    res.json({
      grant: {
        id: grant.id,
        doctorId: grant.doctor_id,
        patientId: grant.patient_id,
        grantedAt: grant.granted_at,
        expiresAt: grant.expires_at,
      },
    });
  }),
);

router.get(
  '/grants',
  requireRole('patient'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT g.*, d.full_name AS doctor_name, d.email AS doctor_email
         FROM access_grants g
         JOIN users d ON d.id = g.doctor_id
        WHERE g.patient_id = $1
        ORDER BY g.granted_at DESC`,
      [req.user.id],
    );
    res.json({
      grants: rows.map((g) => ({
        id: g.id,
        doctor: { id: g.doctor_id, fullName: g.doctor_name, email: g.doctor_email },
        grantedAt: g.granted_at,
        expiresAt: g.expires_at,
        revokedAt: g.revoked_at,
        active: !g.revoked_at && new Date(g.expires_at) > new Date(),
      })),
    });
  }),
);

router.post(
  '/grants/:id/revoke',
  requireRole('patient'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE access_grants SET revoked_at = now()
        WHERE id = $1 AND patient_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) {
      throw ApiError.notFound('Grant not found');
    }
    res.status(204).end();
  }),
);

export default router;
