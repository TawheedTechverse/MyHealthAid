-- MyHealthAid schema
-- Safe to run repeatedly: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patient', 'doctor')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Doctors: AHPRA-style registration number (3 letters + 10 digits), required
-- before a doctor can sign a visit note. Validated in the app layer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_registration_number TEXT;

-- Patients: phone number, used to send a 2FA code when a new doctor requests
-- access to their records (lib/access.js). Validated in the app layer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS treatment_plans (
  id          BIGSERIAL PRIMARY KEY,
  doctor_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_doctor  ON treatment_plans(doctor_id);
CREATE INDEX IF NOT EXISTS idx_plans_patient ON treatment_plans(patient_id);

CREATE TABLE IF NOT EXISTS tasks (
  id           BIGSERIAL PRIMARY KEY,
  plan_id      BIGINT NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  completed_at TIMESTAMPTZ,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(plan_id);

CREATE TABLE IF NOT EXISTS visit_notes (
  id             BIGSERIAL PRIMARY KEY,
  doctor_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id        BIGINT REFERENCES treatment_plans(id) ON DELETE SET NULL,
  transcript     TEXT NOT NULL DEFAULT '',
  summary        JSONB,
  summary_status TEXT NOT NULL DEFAULT 'none'
                 CHECK (summary_status IN ('none', 'pending', 'ready', 'error')),
  summary_error  TEXT,
  summary_model  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_notes_doctor  ON visit_notes(doctor_id);
CREATE INDEX IF NOT EXISTS idx_visit_notes_patient ON visit_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_visit_notes_plan    ON visit_notes(plan_id);

-- Digital signature: finalizing a reviewed summary requires the doctor's
-- password and records who signed, their registration number, and when.
-- While signed_at is set the note is locked (see assertNoteEditable in
-- lib/visitNotes.js); unsigning (same doctor + password) clears these.
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS signed_by BIGINT REFERENCES users(id);
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS signed_name TEXT;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS signed_registration_number TEXT;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- PDF delivery: generated and emailed (or saved to server/tmp if SMTP isn't
-- configured) when a doctor signs a note. See lib/visitPdfDelivery.js.
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS pdf_email_status TEXT NOT NULL DEFAULT 'none'
  CHECK (pdf_email_status IN ('none', 'pending', 'sent', 'failed'));
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS pdf_email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS pdf_email_error TEXT;
ALTER TABLE visit_notes ADD COLUMN IF NOT EXISTS pdf_saved_path TEXT;

-- Patient-approved 2FA access for a doctor who doesn't already treat them.
-- A request holds a hashed 6-digit code (never the code itself), expires in
-- 10 minutes, and locks after 3 wrong attempts (lib/access.js).
CREATE TABLE IF NOT EXISTS access_requests (
  id          BIGSERIAL PRIMARY KEY,
  doctor_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_pair ON access_requests(doctor_id, patient_id);

-- A correct code grants the doctor 30 days of read-only access to the
-- patient's plans and visit notes. One row per (doctor, patient) pair -
-- verifying again just refreshes it; revoking just marks it.
CREATE TABLE IF NOT EXISTS access_grants (
  id          BIGSERIAL PRIMARY KEY,
  doctor_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  UNIQUE (doctor_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_access_grants_patient ON access_grants(patient_id);

-- Append-only: every time a doctor views a patient's plan or visit note, and
-- every access grant/revoke. No UPDATE/DELETE route exists for this table -
-- see lib/audit.js and routes/audit.routes.js.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  doctor_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('plan', 'visit_note', 'access_grant')),
  record_id   BIGINT,
  action      TEXT NOT NULL CHECK (action IN ('view', 'grant', 'revoke')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_patient ON audit_log(patient_id, created_at DESC);
