import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidRegistrationNumber, isValidPhone } from '../../src/lib/validators.js';

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

test('isValidPhone accepts E.164-ish numbers', () => {
  assert.equal(isValidPhone('+61412345678'), true);
  assert.equal(isValidPhone('61412345678'), true);
});

test('isValidPhone rejects obviously wrong input', () => {
  assert.equal(isValidPhone('not-a-number'), false);
  assert.equal(isValidPhone('123'), false);
  assert.equal(isValidPhone(''), false);
  assert.equal(isValidPhone(null), false);
});
