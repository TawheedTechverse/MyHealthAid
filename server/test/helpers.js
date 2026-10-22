import http from 'node:http';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

/**
 * Starts the Express app on an ephemeral port for API tests.
 * @returns {Promise<{ baseURL: string, close: () => Promise<void> }>}
 */
export async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return {
    baseURL: `http://127.0.0.1:${port}/api`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Wipes every app table. Safe to call before each test file / test case. */
export async function resetDb() {
  await pool.query(
    `TRUNCATE audit_log, symptom_checks, access_grants, access_requests,
              visit_notes, tasks, treatment_plans, users
     RESTART IDENTITY CASCADE`,
  );
}

async function json(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/** Thin fetch wrapper that returns `{ status, body }` and never throws on non-2xx. */
export function makeClient(baseURL) {
  async function call(method, path, { body, token } = {}) {
    const res = await fetch(`${baseURL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await json(res) };
  }
  return {
    get: (path, opts) => call('GET', path, opts),
    post: (path, opts) => call('POST', path, opts),
    patch: (path, opts) => call('PATCH', path, opts),
    delete: (path, opts) => call('DELETE', path, opts),
  };
}

/** Registers a user through the real API and returns `{ user, token }`. */
export async function registerUser(client, overrides = {}) {
  const n = Math.random().toString(36).slice(2, 10);
  const role = overrides.role ?? 'patient';
  const payload = {
    fullName: overrides.fullName ?? 'Test User',
    email: overrides.email ?? `${n}@test.dev`,
    password: overrides.password ?? 'password123',
    role,
    ...(role === 'patient' ? { phone: overrides.phone ?? '+61412345670' } : {}),
  };
  const res = await client.post('/auth/register', { body: payload });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { user: res.body.user, token: res.body.token };
}

export { pool };
