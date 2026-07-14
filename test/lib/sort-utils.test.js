import assert from 'node:assert/strict';
import test from 'node:test';
import { arraysEqual, buildMoveBatch } from '../../src/lib/sort-utils.js';

test('arraysEqual compares collection order exactly', () => {
  assert.equal(arraysEqual(['a', 'b'], ['a', 'b']), true);
  assert.equal(arraysEqual(['a', 'b'], ['b', 'a']), false);
  assert.equal(arraysEqual(['a'], ['a', 'b']), false);
});

test('buildMoveBatch creates safe moves and preserves the next local order', () => {
  const batch = buildMoveBatch(['a', 'b', 'c', 'd'], ['d', 'b', 'a', 'c'], 2);

  assert.deepEqual(batch.moves, [
    { id: 'd', newPosition: '0' },
    { id: 'b', newPosition: '1' },
  ]);
  assert.deepEqual(batch.nextOrder, ['d', 'b', 'a', 'c']);
});

test('buildMoveBatch rejects a target product missing from the current collection', () => {
  assert.throws(
    () => buildMoveBatch(['a', 'b'], ['a', 'missing'], 10),
    /Product missing was not found/,
  );
});
