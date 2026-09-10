# MyHealthAid

Shared treatment tracking for patients and doctors. Doctors build treatment
plans made of tasks; patients see their plans and check tasks off. Both sides get
a dashboard that rolls up progress.

- **Frontend:** React 19 + Vite, React Router, plain CSS (glassmorphism, red/white gradient theme). Responsive down to phone width.
- **Backend:** Node + Express, PostgreSQL via `pg`, JWT auth, Zod validation.
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

## Notes

- Passwords are hashed with bcrypt; tokens are stateless JWTs (`JWT_EXPIRES_IN`, default 7d).
- Patients can only toggle a task's `status` — the API rejects any other field from a patient.
- This is a first milestone: no messaging, file uploads, or audit log yet.

## License

MIT — see [LICENSE](LICENSE).
