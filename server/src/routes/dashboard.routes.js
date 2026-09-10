import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { user } = req;

    if (user.role === 'doctor') {
      const { rows: patients } = await query(
        `SELECT pt.id,
                pt.full_name,
                pt.email,
                COUNT(DISTINCT p.id) AS plan_count,
                COUNT(t.id) AS task_total,
                COUNT(t.id) FILTER (WHERE t.status = 'done') AS task_done
           FROM treatment_plans p
           JOIN users pt ON pt.id = p.patient_id
           LEFT JOIN tasks t ON t.plan_id = p.id
          WHERE p.doctor_id = $1
          GROUP BY pt.id, pt.full_name, pt.email
          ORDER BY pt.full_name`,
        [user.id],
      );

      const { rows: totals } = await query(
        `SELECT COUNT(*) AS plan_count,
                COUNT(*) FILTER (WHERE status = 'active') AS active_count
           FROM treatment_plans WHERE doctor_id = $1`,
        [user.id],
      );

      res.json({
        role: 'doctor',
        summary: {
          patientCount: patients.length,
          planCount: Number(totals[0].plan_count),
          activePlanCount: Number(totals[0].active_count),
        },
        patients: patients.map((p) => {
          const total = Number(p.task_total);
          const done = Number(p.task_done);
          return {
            id: p.id,
            fullName: p.full_name,
            email: p.email,
            planCount: Number(p.plan_count),
            taskTotal: total,
            taskDone: done,
            progress: total === 0 ? 0 : Math.round((done / total) * 100),
          };
        }),
      });
      return;
    }

    // Patient dashboard
    const { rows: totals } = await query(
      `SELECT COUNT(DISTINCT p.id) AS plan_count,
              COUNT(t.id) AS task_total,
              COUNT(t.id) FILTER (WHERE t.status = 'done') AS task_done
         FROM treatment_plans p
         LEFT JOIN tasks t ON t.plan_id = p.id
        WHERE p.patient_id = $1`,
      [user.id],
    );

    const { rows: upcoming } = await query(
      `SELECT t.id, t.title, t.due_date, p.id AS plan_id, p.title AS plan_title
         FROM tasks t
         JOIN treatment_plans p ON p.id = t.plan_id
        WHERE p.patient_id = $1 AND t.status = 'pending'
        ORDER BY t.due_date NULLS LAST, t.id
        LIMIT 8`,
      [user.id],
    );

    const total = Number(totals[0].task_total);
    const done = Number(totals[0].task_done);

    res.json({
      role: 'patient',
      summary: {
        planCount: Number(totals[0].plan_count),
        taskTotal: total,
        taskDone: done,
        progress: total === 0 ? 0 : Math.round((done / total) * 100),
      },
      upcomingTasks: upcoming.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        planId: t.plan_id,
        planTitle: t.plan_title,
      })),
    });
  }),
);

export default router;
