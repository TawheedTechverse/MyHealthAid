import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ApiError } from '../lib/ApiError.js';
import { signToken } from '../lib/jwt.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(200),
  role: z.enum(['patient', 'doctor']),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

function publicUser(row) {
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { fullName, email, password, role } = req.body;

    const existing = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw ApiError.conflict('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role`,
      [email, passwordHash, fullName, role],
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

export default router;
