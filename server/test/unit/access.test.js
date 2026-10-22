import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode } from '../../src/lib/access.js';

test('generateCode produces a zero-padded 6-digit string', () => {
  for (let i = 0; i < 25; i += 1) {
    const code = generateCode();
    assert.match(code, /^\d{6}$/);
  }
});
