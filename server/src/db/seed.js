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
      await client.query(
        `TRUNCATE audit_log, symptom_checks, access_grants, access_requests,
                  tasks, treatment_plans, users
         RESTART IDENTITY CASCADE`,
      );

      const { rows: users } = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, medical_registration_number, phone, allergies)
         VALUES
           ($1, $6, 'Dr. Alice Reyes', 'doctor', 'MED0001234567', NULL, NULL),
           ($2, $6, 'Dr. Priya Shah', 'doctor', 'MED0009876543', NULL, NULL),
           ($3, $6, 'Ben Carter', 'patient', NULL, '+61412345671', 'Penicillin'),
           ($4, $6, 'Chloe Nguyen', 'patient', NULL, '+61412345672', 'None known'),
           ($5, $6, 'David Okafor', 'patient', NULL, '+61412345673', 'Peanuts')
         RETURNING id, email, role, full_name`,
        [
          'dr.reyes@myhealthaid.dev',
          'dr.shah@myhealthaid.dev',
          'ben@myhealthaid.dev',
          'chloe@myhealthaid.dev',
          'david@myhealthaid.dev',
          passwordHash,
        ],
      );

      const doctor = users.find((u) => u.email === 'dr.reyes@myhealthaid.dev');
      const secondDoctor = users.find((u) => u.email === 'dr.shah@myhealthaid.dev');
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
          visitNote: {
            signed: true,
            transcript:
              'Patient reports knee pain improving, swelling down. Range of motion to 110 degrees. ' +
              'Incision clean, no signs of infection. Continue physio, add stationary bike next week.',
            summary: {
              chiefComplaint: 'Post-op follow-up, right knee',
              historyOfPresentIllness: 'Pain and swelling improving since arthroscopic surgery.',
              assessment: 'Recovering on schedule. Range of motion 110 degrees.',
              plan: 'Continue physiotherapy; add stationary bike next week.',
              followUp: 'Review in 2 weeks',
              medications: [{ name: 'Ibuprofen 400mg', instruction: 'As needed for pain, with food' }],
            },
          },
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
          visitNote: {
            signed: false,
            transcript:
              'Blood pressure 138 over 88 today, down from 148 over 92 last visit. Patient tolerating ' +
              'lisinopril well, no side effects. Encouraged continued sodium reduction and walking.',
            summary: {
              chiefComplaint: 'Hypertension review',
              historyOfPresentIllness: 'BP trending down on current regimen.',
              assessment: 'Improving, not yet at target.',
              plan: 'Continue lisinopril 10mg, reinforce lifestyle changes.',
              followUp: 'Review in 4 weeks',
              medications: [{ name: 'Lisinopril 10mg', instruction: 'Once daily each morning' }],
            },
          },
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

        if (plan.visitNote) {
          const vn = plan.visitNote;
          await client.query(
            `INSERT INTO visit_notes
               (doctor_id, patient_id, plan_id, transcript, summary, summary_status, summary_model,
                signed_by, signed_name, signed_registration_number, signed_at)
             VALUES ($1, $2, $3, $4, $5, 'ready', 'gemini-flash-latest', $6, $7, $8, $9)`,
            [
              doctor.id,
              plan.patient,
              planId,
              vn.transcript,
              vn.summary,
              vn.signed ? doctor.id : null,
              vn.signed ? 'Dr. Alice Reyes' : null,
              vn.signed ? 'MED0001234567' : null,
              vn.signed ? new Date() : null,
            ],
          );
        }
      }

      // Demo of feature 3: Dr. Shah doesn't treat Ben directly, but has
      // already verified a 2FA code and holds 30 days of read access.
      const { rows: grantRows } = await client.query(
        `INSERT INTO access_grants (doctor_id, patient_id, granted_at, expires_at)
         VALUES ($1, $2, now() - interval '1 day', now() + interval '29 days')
         RETURNING id`,
        [secondDoctor.id, ben.id],
      );

      // Demo of feature 4: the grant above, plus Dr. Reyes viewing Ben's plan,
      // show up on Ben's "Who viewed my records" page.
      const { rows: benPlanRows } = await client.query(
        `SELECT id FROM treatment_plans WHERE patient_id = $1 LIMIT 1`,
        [ben.id],
      );
      await client.query(
        `INSERT INTO audit_log (doctor_id, patient_id, record_type, record_id, action, created_at)
         VALUES
           ($1, $2, 'access_grant', $3, 'grant', now() - interval '1 day'),
           ($4, $2, 'plan', $5, 'view', now() - interval '2 hours')`,
        [secondDoctor.id, ben.id, grantRows[0].id, doctor.id, benPlanRows[0].id],
      );

      // Demo of feature 6: one safe, AI-assessed check and one red-flag
      // check that escalated without ever calling the AI.
      await client.query(
        `INSERT INTO symptom_checks (patient_id, input, red_flag, urgency, advice, reasons, model, created_at)
         VALUES
           ($1, 'I have had a mild headache since yesterday afternoon, no other symptoms.',
            false, 'self-care',
            'This sounds like a mild, common headache. Rest, stay hydrated, and over-the-counter pain relief as directed should help. See your GP if it worsens or lasts more than a few days.',
            '["Mild, non-specific symptom with no red flags"]'::jsonb, $2, now() - interval '3 days'),
           ($1, 'I have crushing chest pain and feel short of breath.',
            true, 'urgent',
            'Call Triple Zero (000) or go to the nearest emergency department.',
            '["chest pain", "difficulty breathing"]'::jsonb, NULL, now() - interval '1 day')`,
        [ben.id, 'gemini-flash-latest'],
      );
    });

    console.log('Seed complete. Demo accounts (password: %s):', DEMO_PASSWORD);
    console.log('  doctor  -> dr.reyes@myhealthaid.dev (owns the plans/notes below)');
    console.log('  doctor  -> dr.shah@myhealthaid.dev (has granted read access to Ben)');
    console.log('  patient -> ben@myhealthaid.dev / chloe@myhealthaid.dev / david@myhealthaid.dev');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
