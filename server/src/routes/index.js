import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './users.routes.js';
import planRoutes from './plans.routes.js';
import taskRoutes from './tasks.routes.js';
import visitNoteRoutes from './visitNotes.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import accessRoutes from './access.routes.js';
import symptomCheckRoutes from './symptomChecks.routes.js';
import emergencyCardRoutes from './emergencyCard.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true }));
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/plans', planRoutes);
router.use('/tasks', taskRoutes);
router.use('/visit-notes', visitNoteRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/access', accessRoutes);
router.use('/symptom-checks', symptomCheckRoutes);
router.use('/emergency-card', emergencyCardRoutes);

export default router;
