import assert from 'node:assert/strict';
import test from 'node:test';
import { UPDATE_COLLECTION_SORT_ORDER_MUTATION } from '../../src/graphql/collection-mutations.js';
import { updateSortOrder } from '../../src/services/collection-order.js';

test('collection sort-order mutation uses the 2026-04 CollectionInput signature', () => {
  assert.match(UPDATE_COLLECTION_SORT_ORDER_MUTATION, /\$input: CollectionInput!/);
  assert.match(UPDATE_COLLECTION_SORT_ORDER_MUTATION, /collectionUpdate\(input: \$input\)/);
  assert.doesNotMatch(UPDATE_COLLECTION_SORT_ORDER_MUTATION, /CollectionUpdateInput/);
});

test('updateSortOrder sends sortOrder inside the collectionUpdate input variable', async () => {
  let request;
  const client = {
    async request(input) {
      request = input;
      return { data: { collectionUpdate: { collection: { id: 'collection-1', sortOrder: 'MANUAL' }, userErrors: [] } } };
    },
  };

  await updateSortOrder(client, 'collection-1', 'MANUAL');

  assert.deepEqual(request.variables, {
    input: { id: 'collection-1', sortOrder: 'MANUAL' },
  });
});
