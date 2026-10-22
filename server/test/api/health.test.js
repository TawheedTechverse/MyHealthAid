import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeClient, resetDb, pool } from '../helpers.js';

test('GET /health responds ok, and auth/register + /auth/me round-trip', async () => {
  await resetDb();
  const { baseURL, close } = await startServer();
  const client = makeClient(baseURL);
  try {
    const health = await client.get('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);

    const register = await client.post('/auth/register', {
      body: {
        fullName: 'Health Check',
        email: 'health@test.dev',
        password: 'password123',
        role: 'patient',
      },
    });
    assert.equal(register.status, 201);
    assert.ok(register.body.token);

    const me = await client.get('/auth/me', { token: register.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'health@test.dev');
  } finally {
    await close();
    await pool.end();
  }
});
