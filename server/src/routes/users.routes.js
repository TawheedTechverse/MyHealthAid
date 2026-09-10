import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const searchSchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
});

/**
 * Doctor-only: look up patients to assign a plan to. Optional `?q=` filters by
 * name or email (case-insensitive prefix/substring).
 */
router.get(
  '/patients',
  authenticate,
  requireRole('doctor'),
  validate(searchSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    const { rows } = await query(
      `SELECT id, full_name, email
         FROM users
        WHERE role = 'patient'
          AND ($1 = '' OR full_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
        ORDER BY full_name
        LIMIT 25`,
      [q],
    );
    res.json({
      patients: rows.map((r) => ({ id: r.id, fullName: r.full_name, email: r.email })),
    });
  }),
);

export default router;
