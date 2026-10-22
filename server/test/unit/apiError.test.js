import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/lib/ApiError.js';

test('ApiError factories set the expected status codes', () => {
  assert.equal(ApiError.badRequest().status, 400);
  assert.equal(ApiError.unauthorized().status, 401);
  assert.equal(ApiError.forbidden().status, 403);
  assert.equal(ApiError.notFound().status, 404);
  assert.equal(ApiError.conflict().status, 409);
});

test('ApiError carries a client-safe message and optional details', () => {
  const err = ApiError.badRequest('Validation failed', { field: ['required'] });
  assert.equal(err.message, 'Validation failed');
  assert.deepEqual(err.details, { field: ['required'] });
  assert.ok(err instanceof Error);
});
