import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ApiError } from '../lib/ApiError.js';
import { signToken } from '../lib/jwt.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { REGISTRATION_NUMBER_RE, PHONE_RE } from '../lib/validators.js';

const router = Router();

const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(160),
    password: z.string().min(8).max(200),
    role: z.enum(['patient', 'doctor']),
    phone: z
      .string()
      .trim()
      .regex(PHONE_RE, 'Enter a valid phone number, e.g. +61412345678')
      .optional(),
  })
  .refine((v) => v.role !== 'patient' || Boolean(v.phone), {
    message: 'Phone number is required for patients',
    path: ['phone'],
  });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z
  .object({
    medicalRegistrationNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(REGISTRATION_NUMBER_RE, 'Must be 3 letters followed by 10 digits, e.g. MED0001234567'),
    phone: z.string().trim().regex(PHONE_RE, 'Enter a valid phone number, e.g. +61412345678'),
    allergies: z.string().trim().max(500),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    medicalRegistrationNumber: row.medical_registration_number ?? null,
    phone: row.phone ?? null,
    allergies: row.allergies ?? null,
  };
}

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { fullName, email, password, role, phone } = req.body;

    const existing = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw ApiError.conflict('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role, phone`,
      [email, passwordHash, fullName, role, phone ?? null],
    );

    const user = publicUser(rows[0]);
    res.status(201).json({ token: signToken(user), user });
  }),
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query(
      'SELECT id, email, full_name, role, password_hash FROM users WHERE email = $1',
      [email],
    );
    if (rows.length === 0) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const user = publicUser(rows[0]);
    res.json({ token: signToken(user), user });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

router.patch(
  '/profile',
  authenticate,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    if (req.body.medicalRegistrationNumber !== undefined && req.user.role !== 'doctor') {
      throw ApiError.forbidden('Only doctors have a medical registration number');
    }
    if ((req.body.phone !== undefined || req.body.allergies !== undefined) && req.user.role !== 'patient') {
      throw ApiError.forbidden('Only patients set these fields');
    }

    const fields = [];
    const values = [];
    if (req.body.medicalRegistrationNumber !== undefined) {
      values.push(req.body.medicalRegistrationNumber);
      fields.push(`medical_registration_number = $${values.length}`);
    }
    if (req.body.phone !== undefined) {
      values.push(req.body.phone);
      fields.push(`phone = $${values.length}`);
    }
    if (req.body.allergies !== undefined) {
      values.push(req.body.allergies);
      fields.push(`allergies = $${values.length}`);
    }
    values.push(req.user.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length}
       RETURNING id, email, full_name, role, medical_registration_number, phone, allergies`,
      values,
    );
    res.json({ user: publicUser(rows[0]) });
  }),
);

export default router;
