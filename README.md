# MyHealthAid

Shared treatment tracking for patients and doctors. Doctors build treatment
plans made of tasks; patients see their plans and check tasks off. Both sides get
a dashboard that rolls up progress.

Doctors can also dictate **voice visit notes**: speech is transcribed live in the
browser, then the server turns the transcript into a structured clinical summary
(chief complaint, assessment, plan, follow-up, medications) that the doctor
reviews and edits instead of writing from memory. Once reviewed, a doctor can
**digitally sign** a note (password re-entry required) to lock it and attach a
signature block (name, registration number, timestamp); unsigned notes are
labelled "Draft – not verified" everywhere, including to the patient.

A doctor who doesn't already treat a patient can request **2FA-verified read
access**: the patient gets a 6-digit code by SMS (or in the server log if
Twilio isn't configured), and a correct code unlocks 30 days of read-only
access to that patient's plans and visit notes. Patients see and can revoke
every grant on their "Doctor access" page. Every doctor view of a patient's
plan or visit note, and every grant/revoke, is recorded in an append-only
audit log the patient can see on a "Who viewed my records" page — no route
can edit or delete it.

Signing also generates a **PDF of the visit** (patient, date, summary
sections, medications, signature block) and emails it to the patient via
SMTP — or, without SMTP configured, saves it to `server/tmp` and logs the
path. A real send failure is retried up to 3 times and shown to the doctor
(with a manual retry button); it never undoes the signature. Patients and
the doctor can download the PDF from the visit note at any time.

- **Frontend:** React 19 + Vite, React Router, plain CSS (glassmorphism, red/white gradient theme) with a dark mode — toggle in the top-right of the header, defaults to the OS theme, remembered per device. Responsive down to phone width. Voice capture uses the browser `SpeechRecognition` API (Chrome/Edge).
- **Backend:** Node + Express, PostgreSQL via `pg`, JWT auth, Zod validation. Visit-note summaries use the Gemini API (structured output via `generationConfig.responseSchema`).
- **Layout:** npm workspaces monorepo — [`client/`](client) and [`server/`](server).

## Prerequisites

- Node.js 20+
- A PostgreSQL database. Any of:
  - a local install (`createdb myhealthaid`), or
  - a free hosted instance (Neon, Supabase, Railway) — set `PG_SSL=true`.

## Setup

```bash
# from the repo root
npm install

# --- server env ---
cp server/.env.example server/.env
# edit server/.env: set DATABASE_URL and a strong JWT_SECRET

# create tables and load demo data
npm run db:migrate
npm run db:seed
```

Optionally `cp client/.env.example client/.env` (defaults are fine for local dev —
the Vite dev server proxies `/api` to `http://localhost:4000`).

### Enabling AI visit-note summaries (optional)

Without this, doctors can still record and save transcripts — only the automatic
summary step is skipped (and can be run later per note).

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), then in
`server/.env`:

```
GEMINI_API_KEY=...
SUMMARY_MODEL=gemini-flash-latest   # tracks Google's current fast model
```

## Run

```bash
npm run dev
```

- API: http://localhost:4000
- App: http://localhost:5173

### Demo accounts

Password for all: `password123`

| Role    | Email                   |
| ------- | ----------------------- |
| Doctor  | `dr.reyes@myhealthaid.dev` |
| Patient | `ben@myhealthaid.dev`   |
| Patient | `chloe@myhealthaid.dev` |
| Patient | `david@myhealthaid.dev` |

## Deploy

The client is a static SPA (host on Vercel); the server is a stateful Node
process with Postgres (host on Render / Railway / Fly). They are deployed
separately and connected with two environment variables.

### Server — Render (blueprint included)

[`render.yaml`](render.yaml) provisions the API plus a Postgres database:

1. Render dashboard → **New → Blueprint** → pick this repo.
2. When prompted, set `CLIENT_ORIGIN` to your Vercel URL
   (e.g. `https://my-health-aid.vercel.app`) and, optionally, `GEMINI_API_KEY`.
   `DATABASE_URL` and `JWT_SECRET` are wired up automatically; the schema is
   applied on every deploy (`npm run migrate`).
3. Once live, open the service **Shell** and run `npm run seed` to load the demo
   accounts.

Any other host works too — set `DATABASE_URL`, `PG_SSL=true`, `JWT_SECRET`,
`CLIENT_ORIGIN`, `NODE_ENV=production`; build with `npm install`, start with
`npm run start`.

### Client — Vercel

- **Root Directory:** `client` ([`client/vercel.json`](client/vercel.json) sets
  the Vite build and the SPA fallback rewrite).
- **Environment variable:** `VITE_API_URL` = `https://<your-api-host>/api`
  — without this the client calls `/api` on its own domain, where nothing is
  listening, and every request 404s.
- Redeploy after changing the variable (Vite inlines it at build time).

## Scripts

| Command              | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Run API + client together (hot reload)        |
| `npm run dev:server` | API only                                      |
| `npm run dev:client` | Client only                                   |
| `npm run build`      | Production build of the client                |
| `npm run start`      | Run the API in production mode                |
| `npm run db:migrate` | Apply `server/src/db/schema.sql`              |
| `npm run db:seed`    | Reset data and load demo accounts/plans       |
| `npm run db:reset`   | Drop tables, re-migrate, re-seed              |

## Data model

```
users(id, email, password_hash, full_name, role['patient'|'doctor'], created_at)

treatment_plans(id, doctor_id -> users, patient_id -> users,
                title, description, status['active'|'completed'|'archived'],
                created_at, updated_at)

tasks(id, plan_id -> treatment_plans, title, description, due_date,
      status['pending'|'done'], completed_at, sort_order, created_at)

visit_notes(id, doctor_id -> users, patient_id -> users,
            plan_id -> treatment_plans NULL, transcript,
            summary JSONB, summary_status['none'|'pending'|'ready'|'error'],
            summary_error, summary_model,
            signed_by -> users NULL, signed_name, signed_registration_number, signed_at,
            pdf_email_status['none'|'pending'|'sent'|'failed'], pdf_email_attempts,
            pdf_email_error, pdf_saved_path,
            created_at, updated_at)

access_requests(id, doctor_id -> users, patient_id -> users, code_hash,
                attempts, expires_at, consumed_at, created_at)

access_grants(id, doctor_id -> users, patient_id -> users,
              granted_at, expires_at, revoked_at)

audit_log(id, doctor_id -> users, patient_id -> users,
          record_type['plan'|'visit_note'|'access_grant'], record_id,
          action['view'|'grant'|'revoke'], created_at)
```

`audit_log` is append-only: there is no route to update or delete an entry.

`users.medical_registration_number` is set by doctors in their profile (AHPRA-style:
3 letters + 10 digits, e.g. `MED0001234567`) and is required before they can sign a
note. `users.phone` is set by patients at sign-up and in their profile; it's used to
send the 2FA access code.

## API

All routes are under `/api`. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path                  | Who      | Purpose                                  |
| ------ | --------------------- | -------- | ---------------------------------------- |
| POST   | `/auth/register`      | anon     | Create account, returns token + user     |
| POST   | `/auth/login`         | anon     | Log in, returns token + user             |
| GET    | `/auth/me`            | any      | Current user                             |
| PATCH  | `/auth/profile`       | any      | Doctor: set medical registration number  |
| GET    | `/dashboard`          | any      | Role-aware summary (+ patients / up-next) |
| GET    | `/plans`              | any      | Plans you own (doctor) or are on (patient) |
| POST   | `/plans`              | doctor   | Create a plan with optional tasks        |
| GET    | `/plans/:id`          | participant | Plan detail with tasks                 |
| PATCH  | `/plans/:id`          | owner doctor | Update title / description / status   |
| DELETE | `/plans/:id`          | owner doctor | Delete plan + tasks                   |
| POST   | `/plans/:id/tasks`    | owner doctor | Add a task                           |
| PATCH  | `/tasks/:id`          | doctor: any field · patient: `status` only | Update a task     |
| DELETE | `/tasks/:id`          | owner doctor | Delete a task                        |
| GET    | `/users/patients?q=`  | doctor   | Patient lookup for assigning plans       |
| GET    | `/visit-notes?patientId=&planId=` | any | Visit notes you authored (doctor) or about you (patient) |
| GET    | `/visit-notes/config` | any      | `{ summarizerConfigured }` — is an API key set        |
| POST   | `/visit-notes`        | doctor   | Create from a transcript; summarizes inline if configured |
| GET    | `/visit-notes/:id`    | participant | One note with transcript + summary   |
| POST   | `/visit-notes/:id/summarize` | owner doctor | (Re)generate the summary        |
| PATCH  | `/visit-notes/:id`    | owner doctor | Edit transcript or summary fields (blocked once signed) |
| DELETE | `/visit-notes/:id`    | owner doctor | Delete a note (blocked once signed)  |
| POST   | `/visit-notes/:id/sign` | owner doctor | Password + reviewed summary required; stamps name, registration number, and time, then locks the note |
| POST   | `/visit-notes/:id/unsign` | owner doctor | Password required; clears the signature and unlocks the note |
| GET    | `/visit-notes/:id/pdf` | participant | Download the signed visit as a PDF |
| POST   | `/visit-notes/:id/pdf/retry` | owner doctor | Re-attempt generating/emailing the PDF |
| POST   | `/access/request`     | doctor   | Request access to a patient (by email/ID); sends a 6-digit code |
| POST   | `/access/verify`      | doctor   | Submit the code; on success grants 30 days of read access |
| GET    | `/access/grants`      | patient  | Doctors with access to your records |
| POST   | `/access/grants/:id/revoke` | patient | Revoke a doctor's access |
| GET    | `/access/audit`       | patient  | Who viewed your plans/visit notes, and every grant/revoke, newest first |

## Notes

- Passwords are hashed with bcrypt; tokens are stateless JWTs (`JWT_EXPIRES_IN`, default 7d).
- Patients can only toggle a task's `status` — the API rejects any other field from a patient.
- A doctor with 2FA-granted access can only read a patient's plans and visit
  notes — not edit, sign, or delete them; only the original owner/author can.
- Get Twilio credentials at [console.twilio.com](https://console.twilio.com) to send
  real SMS access codes; without them the code is printed to the server log.
- This is a first milestone: no messaging or file uploads yet.

## License

MIT — see [LICENSE](LICENSE).
