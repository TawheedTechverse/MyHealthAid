# MyHealthAid

Shared treatment tracking for patients and doctors. Doctors build treatment
plans made of tasks; patients see their plans and check tasks off. Both sides get
a dashboard that rolls up progress.

Doctors can also dictate **voice visit notes**: speech is transcribed live in the
browser, then the server turns the transcript into a structured clinical summary
(chief complaint, assessment, plan, follow-up, medications) that the doctor
reviews and edits instead of writing from memory.

- **Frontend:** React 19 + Vite, React Router, plain CSS (glassmorphism, red/white gradient theme). Responsive down to phone width. Voice capture uses the browser `SpeechRecognition` API (Chrome/Edge).
- **Backend:** Node + Express, PostgreSQL via `pg`, JWT auth, Zod validation. Visit-note summaries use the Anthropic API (`@anthropic-ai/sdk`, structured output).
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

In `server/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
SUMMARY_MODEL=claude-opus-5      # or claude-haiku-4-5 for a much cheaper call
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
            summary_error, summary_model, created_at, updated_at)
```

## API

All routes are under `/api`. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path                  | Who      | Purpose                                  |
| ------ | --------------------- | -------- | ---------------------------------------- |
| POST   | `/auth/register`      | anon     | Create account, returns token + user     |
| POST   | `/auth/login`         | anon     | Log in, returns token + user             |
| GET    | `/auth/me`            | any      | Current user                             |
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
| PATCH  | `/visit-notes/:id`    | owner doctor | Edit transcript or summary fields    |
| DELETE | `/visit-notes/:id`    | owner doctor | Delete a note                        |

## Notes

- Passwords are hashed with bcrypt; tokens are stateless JWTs (`JWT_EXPIRES_IN`, default 7d).
- Patients can only toggle a task's `status` — the API rejects any other field from a patient.
- This is a first milestone: no messaging, file uploads, or audit log yet.

## License

MIT — see [LICENSE](LICENSE).
