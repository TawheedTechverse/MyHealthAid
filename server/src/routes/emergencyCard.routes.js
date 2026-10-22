import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { buildEmergencyCard, verifyEmergencyCard } from '../lib/emergencyCard.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requireRole('patient'),
  asyncHandler(async (req, res) => {
    res.json({ card: await buildEmergencyCard(req.user.id) });
  }),
);

router.post(
  '/block',
  requireRole('patient'),
  asyncHandler(async (req, res) => {
    await query(
      'UPDATE users SET emergency_card_version = emergency_card_version + 1 WHERE id = $1',
      [req.user.id],
    );
    // Reissue immediately so the patient leaves with a fresh, valid card.
    res.json({ card: await buildEmergencyCard(req.user.id) });
  }),
);

const verifySchema = z.object({ card: z.object({ data: z.record(z.any()), signature: z.string() }) });

/**
 * Any authenticated doctor can verify a card - deliberately not restricted
 * to patients they already treat, since an emergency card exists precisely
 * for doctors who have never seen this patient before.
 */
router.post(
  '/verify',
  requireRole('doctor'),
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    res.json(await verifyEmergencyCard(req.body.card));
  }),
);

export default router;
