import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidRegistrationNumber } from '../../src/lib/validators.js';

test('accepts 3 letters + 10 digits', () => {
  assert.equal(isValidRegistrationNumber('MED0001234567'), true);
});

test('rejects wrong shapes', () => {
  assert.equal(isValidRegistrationNumber('MED123'), false);
  assert.equal(isValidRegistrationNumber('med0001234567'), false); // lowercase
  assert.equal(isValidRegistrationNumber('MEDD001234567'), false); // 4 letters
  assert.equal(isValidRegistrationNumber(''), false);
  assert.equal(isValidRegistrationNumber(null), false);
});
