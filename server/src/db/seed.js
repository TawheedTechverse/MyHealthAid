import bcrypt from 'bcryptjs';
import { pool, withTransaction } from './pool.js';

const DEMO_PASSWORD = 'password123';

/**
 * Wipes plan/task/user data and inserts a small, coherent demo dataset:
 * one doctor, three patients, a few treatment plans with tasks.
 */
async function main() {
  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    await withTransaction(async (client) => {
      await client.query('TRUNCATE tasks, treatment_plans, users RESTART IDENTITY CASCADE');

      const { rows: users } = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES
           ($1, $5, 'Dr. Alice Reyes', 'doctor'),
           ($2, $5, 'Ben Carter', 'patient'),
           ($3, $5, 'Chloe Nguyen', 'patient'),
           ($4, $5, 'David Okafor', 'patient')
         RETURNING id, email, role`,
        [
          'dr.reyes@myhealthaid.dev',
          'ben@myhealthaid.dev',
          'chloe@myhealthaid.dev',
          'david@myhealthaid.dev',
          passwordHash,
        ],
      );

      const doctor = users.find((u) => u.role === 'doctor');
      const [ben, chloe, david] = users.filter((u) => u.role === 'patient');

      const plans = [
        {
          patient: ben.id,
          title: 'Post-op knee recovery',
          description: 'Six-week rehabilitation program following arthroscopic surgery.',
          status: 'active',
          tasks: [
            { title: 'Ice the knee 3x daily for 15 minutes', status: 'done', due: -6 },
            { title: 'Complete morning range-of-motion exercises', status: 'done', due: -2 },
            { title: 'Walk 1,000 steps with crutches', status: 'pending', due: 1 },
            { title: 'Attend physiotherapy session', status: 'pending', due: 3 },
            { title: 'Photograph incision and upload', status: 'pending', due: 5 },
          ],
        },
        {
          patient: chloe.id,
          title: 'Hypertension management',
          description: 'Lifestyle and medication adherence plan to bring blood pressure under 130/80.',
          status: 'active',
          tasks: [
            { title: 'Take lisinopril 10mg each morning', status: 'done', due: -1 },
            { title: 'Log blood pressure twice daily', status: 'pending', due: 0 },
            { title: 'Reduce sodium: no processed food this week', status: 'pending', due: 2 },
            { title: '30 minute brisk walk, 5 days', status: 'pending', due: 4 },
          ],
        },
        {
          patient: david.id,
          title: 'Type 2 diabetes onboarding',
          description: 'Initial three-week plan to establish glucose monitoring habits.',
          status: 'completed',
          tasks: [
            { title: 'Set up glucose meter and test strips', status: 'done', due: -14 },
            { title: 'Record fasting glucose every morning', status: 'done', due: -7 },
            { title: 'Meet with nutritionist', status: 'done', due: -3 },
          ],
        },
      ];

      for (const plan of plans) {
        const { rows: planRows } = await client.query(
          `INSERT INTO treatment_plans (doctor_id, patient_id, title, description, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [doctor.id, plan.patient, plan.title, plan.description, plan.status],
        );
        const planId = planRows[0].id;

        for (let i = 0; i < plan.tasks.length; i += 1) {
          const t = plan.tasks[i];
          await client.query(
            `INSERT INTO tasks (plan_id, title, status, completed_at, due_date, sort_order)
             VALUES ($1, $2, $3, $4, (CURRENT_DATE + $5::int), $6)`,
            [
              planId,
              t.title,
              t.status,
              t.status === 'done' ? new Date() : null,
              t.due,
              i,
            ],
          );
        }
      }
    });

    console.log('Seed complete. Demo accounts (password: %s):', DEMO_PASSWORD);
    console.log('  doctor  -> dr.reyes@myhealthaid.dev');
    console.log('  patient -> ben@myhealthaid.dev / chloe@myhealthaid.dev / david@myhealthaid.dev');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
