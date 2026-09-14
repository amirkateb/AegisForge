import test from 'node:test';
import assert from 'node:assert/strict';
import { sum } from '../src/sum.js';

test('adds finite numbers', () => assert.equal(sum(2, 3), 5));
test('rejects non-finite input', () => assert.throws(() => sum(Infinity, 1), TypeError));
